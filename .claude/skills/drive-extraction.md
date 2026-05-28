# Skill: Drive Extraction

Operational pattern for extracting structured data from Google Drive documents. Reference whenever code reads a Drive file and translates its content into platform records.

## The contract

1. Every extraction lands in `extraction_staging` first. Never writes directly to production tables.
2. Every staged row carries a confidence score: high, medium, or low.
3. Every staged row carries a reconciliation flag: does the line-item sum match the stated total?
4. Every staged row is idempotent via a signature so re-extraction updates instead of duplicating.
5. Financial and beneficiary data never auto-promotes to production. The operator (currently the dev, transferring to Nur on handover) approves each batch.

## The pipeline

```
Drive file
  → lib/drive.ts (auth, fetch, export to text/CSV/XLSX/PDF)
  → lib/extract-text.ts (per-mime-type extraction preserving structure)
  → domain-specific parser (finance, beneficiaries, grants, legal)
  → extraction_staging row (signed, scored, reconciled)
  → review queue (operator approves)
  → production table (donations, payments, beneficiaries, grant_applications, etc.)
  → documents.source_doc_id back-link for traceability
```

## Per-mime-type extraction

```ts
// /platform/lib/extract-text.ts

async function extractContent(doc: DriveDoc): Promise<ExtractedContent> {
  switch (doc.mime) {
    case 'application/vnd.google-apps.document':
      // Export to text via Drive's native export
      return { type: 'text', body: await driveExport(doc.id, 'text/plain') };

    case 'application/vnd.google-apps.spreadsheet':
      // Export to CSV per sheet
      return { type: 'sheets', sheets: await driveExportSheets(doc.id) };

    case 'application/pdf':
      // unpdf for text layer; if scan, return needs-ocr flag
      return await unpdfExtract(doc.id);

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      // mammoth preserves paragraphs and tables
      return await mammothExtract(doc.id);

    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      // SheetJS
      return await xlsxExtract(doc.id);

    default:
      return { type: 'unknown', mime: doc.mime };
  }
}
```

## Structure preservation rules

**Paragraphs.** Word docs and Google Docs preserve paragraph breaks. Do not collapse to a single block of text. The DocReader renders paragraphs natively.

**Tables.** Tables become structured data: rows and columns, not flattened CSV-in-text. The extraction step parses table cells. Downstream consumers (finance line items, beneficiary databases) read the parsed structure.

**Numbers.** Numbers parse as numbers, not strings. Currency tags come from context (filename, sheet name, surrounding text). See the currency-handling skill.

**Photos.** Photos extract as separate asset records and allocate to their owning entity by filename match (then operator-confirmed). Never silently attach to the wrong record.

**Headings.** Heading levels preserve. The DocReader renders them as styled headers, not as inline text.

## The staging schema (excerpt)

```sql
create table extraction_staging (
  id uuid primary key default gen_random_uuid(),
  source_doc_id uuid references documents(id) not null,
  domain text not null, -- 'finance', 'beneficiaries', 'grants', 'legal'
  raw_json jsonb not null,
  normalized jsonb not null,
  confidence text not null check (confidence in ('high','medium','low')),
  reconciled boolean not null default false,
  status text not null default 'pending' check (status in ('pending','committed','rejected')),
  signature text unique, -- (source_doc_id || domain || normalized hash)
  notes text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);
```

## Confidence scoring

**High.** All required fields parsed. Numbers reconcile to stated totals. Currency unambiguous. No OCR involved, or OCR with clean signal.

**Medium.** Required fields parsed but reconciliation off, or one ambiguous field (e.g., a beneficiary name that might match two records). Operator review needed but extraction is structurally fine.

**Low.** Required fields missing or ambiguous. OCR produced uncertain text. Currency unclear. Operator review mandatory; might require manual entry instead of accepting the staged version.

## Reconciliation

For finance extractions, the gate is the running balance chain or the stated-total match:

```ts
function reconcileMonthSheet(lineItems: LineItem[], statedTotal: number): boolean {
  const sum = lineItems.reduce((s, li) => s + li.amount, 0);
  return Math.abs(sum - statedTotal) < 0.01; // exact-ish match for KES integers
}

function reconcileBankStatement(transactions: Txn[], opening: number, closing: number): boolean {
  let balance = opening;
  for (const t of transactions) {
    balance += t.direction === 'in' ? t.amount : -t.amount;
  }
  return Math.abs(balance - closing) < 0.01;
}
```

If reconciliation fails, the row stays in staging with `reconciled: false` and the operator decides: re-extract, accept the gap, or reject the source.

## The 38-month finance backfill (the precedent)

The November 2025, December 2025, January 2026 sheets were itemised with reconciliation:
- Nov 2025: 28 lines totaling 460,620 KES (matches stated total)
- Dec 2025: 28 lines totaling 450,120 KES (matches)
- Jan 2026: 26 lines totaling 482,120 KES (matches)

This is the template for the remaining 35 months that Pass 0 will process. Each month: SA-export the sheet as XLSX, parse with SheetJS, categorize lines, write to extraction_staging with reconciled=true asserted, then promote to payments table only after operator sign-off.

## The LHSH bank statement (the lesson)

LHSH was a 37MB image-only PDF scan. Sonnet OCR misread columns; Opus OCR with 4-page batches got 205 transactions but the balance chain didn't close (off by 149,748 KES). Even 10-page batches with carry-forward couldn't close it because one September page was OCR-illegible.

Resolution: one synthetic balancing entry covering the 270,120 KES gap, confidence='low', label ⚠ "not legible on scan, replace with CSV." The honest position. The entry exists so the chain closes; the operator knows it's synthetic; it gets replaced when LHSH provides a CSV export.

The lesson: when OCR cannot deliver a reconciling extraction, do not force one. Stage the synthetic with low confidence, flag it visibly, document the gap, ask for a better source.

## Hard rules

Never auto-commit financial or beneficiary extractions. Operator approves each batch.

Never silently lump (the 1,392,860 KES lump-month total was the wrong shape; itemized rows are the right shape).

Never strip structure (paragraphs, tables, headings).

Photos to beneficiaries: exact filename match only, or fuzzy match with operator confirmation. Never best-guess attach a child's photo to the wrong record.

## When this skill applies

Any code that reads a Drive file. Any code that translates source content into platform records. Any code that touches the extraction_staging table.
