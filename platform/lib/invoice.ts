// lib/invoice.ts — the invoice generator (R3-5 / P11, img 170).
//
// The founder's ask: "sometimes we want to issue invoices to other companies."
// So this issues an invoice FROM the org (auto from the brain + brand logo) TO
// another company, with line items, auto subtotal/tax/total, an auto-sequenced
// invoice number, issue date (now) + due date, and notes/terms. It is branded
// through the ONE shared printable shell (lib/brand-doc brandWrap), saved to the
// `invoices` table AND mirrored as a studio_documents row so the existing PDF
// route (/api/studio/pdf?id=) and the Library both work on it with no new path.
//
// Money is computed server-side from the line items; the client never sends a
// trusted total. Amounts render through the same currency formatter as the rest
// of the app on screen (<Money>), and as plain strings in the printable file.

import { admin, money } from "./supabase-admin";
import { now, formatLong } from "./now";
import { brandWrap, BRANDS, brandKeyOf, escapeHtml } from "./brand-doc";
import { getLogo } from "./logos";
import { emit } from "./events";
import { revalidatePath } from "next/cache";

export type LineItem = { description: string; qty: number; unitPrice: number };

export type InvoiceInput = {
  brand: string;
  billToCompany: string;
  billToContact?: string;
  billToAddress?: string;
  billToEmail?: string;
  dueDate?: string | null;     // ISO date
  currency?: string;           // default USD
  items: LineItem[];
  taxRate?: number;            // percent, e.g. 5 for 5%
  notes?: string;
  terms?: string;
};

export type InvoiceResult = {
  ok: boolean;
  invoiceId?: string;
  docId?: string;
  invoiceNumber?: string;
  title?: string;
  html?: string;
  error?: string;
};

// Round to 2 decimals without float drift.
function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Auto-sequence the next invoice number: NIS-YYYY-NNNN. Reads the latest number
// for the current year and increments; falls back to 0001 on a fresh year. Best
// effort: a unique index on invoice_number is the real guard, and the caller
// retries once on a collision.
async function nextInvoiceNumber(prefix: string, year: number): Promise<string> {
  const db = admin();
  const like = `${prefix}-${year}-%`;
  const { data } = await db
    .from("invoices")
    .select("invoice_number")
    .ilike("invoice_number", like)
    .order("invoice_number", { ascending: false })
    .limit(1);
  const last = (data && data[0]?.invoice_number) as string | undefined;
  let seq = 1;
  if (last) {
    const m = /-(\d+)$/.exec(last);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
}

// Build the invoice BODY HTML (the bill-to/from block, the line-item table, the
// totals, notes/terms). Wrapped in doc-blocks so it never splits in the PDF.
function invoiceBody(opts: {
  invoiceNumber: string;
  brandKey: string;
  issueLong: string;
  dueLong: string | null;
  inv: InvoiceInput;
  items: { description: string; qty: number; unitPrice: number; amount: number }[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: string;
}): string {
  const b = BRANDS[opts.brandKey];
  const cur = opts.currency;
  const fmt = (n: number) => (cur === "USD" ? money(n) : `${cur} ${round2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  const billTo = [
    opts.inv.billToCompany,
    opts.inv.billToContact,
    opts.inv.billToAddress,
    opts.inv.billToEmail,
  ]
    .filter((x) => x && String(x).trim())
    .map((x) => escapeHtml(String(x)))
    .join("<br/>");

  const rows = opts.items
    .map(
      (it) => `<tr>
        <td>${escapeHtml(it.description)}</td>
        <td class="num">${it.qty}</td>
        <td class="num">${fmt(it.unitPrice)}</td>
        <td class="num">${fmt(it.amount)}</td>
      </tr>`,
    )
    .join("");

  const taxRow = opts.taxRate > 0
    ? `<tr><td colspan="3" class="num">Tax (${opts.taxRate}%)</td><td class="num">${fmt(opts.taxAmount)}</td></tr>`
    : "";

  const notesBlock = opts.inv.notes
    ? `<section class="doc-block"><h3>Notes</h3><p>${escapeHtml(opts.inv.notes)}</p></section>`
    : "";
  const termsBlock = opts.inv.terms
    ? `<section class="doc-block"><h3>Payment terms</h3><p>${escapeHtml(opts.inv.terms)}</p></section>`
    : "";

  return `<section class="doc-block">
    <h1>Invoice</h1>
    <table><tbody>
      <tr><td><strong>Invoice number</strong></td><td class="num">${escapeHtml(opts.invoiceNumber)}</td></tr>
      <tr><td><strong>Issue date</strong></td><td class="num">${escapeHtml(opts.issueLong)}</td></tr>
      ${opts.dueLong ? `<tr><td><strong>Due date</strong></td><td class="num">${escapeHtml(opts.dueLong)}</td></tr>` : ""}
      <tr><td><strong>Currency</strong></td><td class="num">${escapeHtml(cur)}</td></tr>
    </tbody></table>
  </section>
  <section class="doc-block">
    <h3>From</h3>
    <p>${escapeHtml(b.name)}<br/>${escapeHtml(b.legal)}<br/>sasa@nisria.co · nisria.co</p>
    <h3>Bill to</h3>
    <p>${billTo}</p>
  </section>
  <section class="doc-block">
    <h2>Items</h2>
    <table>
      <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead>
      <tbody>
        ${rows}
      </tbody>
      <tbody>
        <tr><td colspan="3" class="num">Subtotal</td><td class="num">${fmt(opts.subtotal)}</td></tr>
        ${taxRow}
        <tr class="total"><td colspan="3" class="num">Total due</td><td class="num">${fmt(opts.total)}</td></tr>
      </tbody>
    </table>
  </section>
  ${notesBlock}
  ${termsBlock}`;
}

// MAIN: create an invoice. Computes totals + the next number server-side,
// renders branded HTML, persists to `invoices` + a studio_documents mirror +
// the Library. Returns the html + ids so the UI can preview in a FocusTab and
// link the PDF route. PII-light: stores only what the user typed for bill-to.
export async function createInvoice(inv: InvoiceInput): Promise<InvoiceResult> {
  const company = (inv.billToCompany || "").trim();
  if (!company) return { ok: false, error: "Tell the invoice which company it bills." };

  const items = (inv.items || [])
    .map((it) => ({ description: String(it.description || "").trim(), qty: Number(it.qty) || 0, unitPrice: Number(it.unitPrice) || 0 }))
    .filter((it) => it.description && (it.qty > 0 || it.unitPrice > 0))
    .map((it) => ({ ...it, amount: round2(it.qty * it.unitPrice) }));
  if (!items.length) return { ok: false, error: "Add at least one line item with a description and amount." };

  const brandKey = brandKeyOf(inv.brand);
  const currency = (inv.currency || "USD").toUpperCase();
  const subtotal = round2(items.reduce((s, it) => s + it.amount, 0));
  const taxRate = Math.max(0, Number(inv.taxRate) || 0);
  const taxAmount = round2(subtotal * (taxRate / 100));
  const total = round2(subtotal + taxAmount);

  const n = await now();
  const year = new Date(n.iso).getFullYear();
  const issueLong = n.long;
  const dueLong = inv.dueDate ? formatLong(inv.dueDate, n.tz) : null;

  const db = admin();

  // render + persist, retrying once if the auto number collides (unique index).
  for (let attempt = 0; attempt < 2; attempt++) {
    const invoiceNumber = await nextInvoiceNumber("NIS", year);
    const bodyHtml = invoiceBody({
      invoiceNumber, brandKey, issueLong, dueLong, inv: { ...inv, billToCompany: company },
      items, subtotal, taxRate, taxAmount, total, currency,
    });
    const title = `Invoice ${invoiceNumber} · ${company}`;
    const logo = await getLogo(brandKey);
    const html = brandWrap({ brandKey, title, bodyHtml, dateStr: issueLong, logoUri: logo?.data_uri || null, footNote: `${BRANDS[brandKey].legal} · Invoice ${invoiceNumber}` });

    // 1) save the branded HTML to the Library bucket + a studio_documents mirror
    //    so the SAME /api/studio/pdf route renders the invoice to PDF.
    let docId: string | null = null;
    let assetId: string | null = null;
    try {
      const outPath = `invoices/${invoiceNumber}.html`;
      await db.storage.from("assets").upload(outPath, Buffer.from(html, "utf-8"), { contentType: "text/html", upsert: true });
      const { data: asset } = await db.from("assets").insert({
        brand: brandKey, type: "document", title,
        description: `Invoice ${invoiceNumber} to ${company}. Total ${currency} ${total}.`,
        storage_path: outPath, mime: "text/html", size_bytes: Buffer.byteLength(html, "utf-8"),
        source: "invoice", created_by: "Nur",
      }).select("id").single();
      assetId = (asset?.id as string) ?? null;
      const { data: doc } = await db.from("studio_documents").insert({
        brand: brandKey, title, prompt: `Invoice to ${company}`, doc_type: "invoice",
        html, asset_id: assetId, input_paths: [], created_by: "Nur",
      }).select("id").single();
      docId = (doc?.id as string) ?? null;
    } catch {
      // persistence of the mirror is best-effort; the invoice row below is the
      // source of truth. Fall through and still write the invoice.
    }

    // 2) the invoice row (source of truth). Unique index on invoice_number.
    const { data: row, error: invErr } = await db.from("invoices").insert({
      invoice_number: invoiceNumber,
      brand: brandKey,
      bill_to_company: company,
      bill_to_contact: inv.billToContact || null,
      bill_to_address: inv.billToAddress || null,
      bill_to_email: inv.billToEmail || null,
      issue_date: n.today,
      due_date: inv.dueDate || null,
      currency,
      line_items: items,
      subtotal, tax_rate: taxRate, tax_amount: taxAmount, total,
      notes: inv.notes || null,
      terms: inv.terms || null,
      status: "issued",
      html,
      asset_id: assetId,
      doc_id: docId,
      created_by: "Nur",
    }).select("id").single();

    if (invErr) {
      // a duplicate number lost a race: retry once with a fresh number.
      if (attempt === 0 && /duplicate|unique/i.test(invErr.message || "")) continue;
      return { ok: false, error: `Could not save the invoice: ${invErr.message}` };
    }

    await emit({
      type: "invoice.created", source: "reports", actor: "Nur",
      subject_type: "invoice", subject_id: row?.id ?? null,
      payload: { invoiceNumber, company, total, currency, brand: brandKey },
    });
    revalidatePath("/reports");
    revalidatePath("/library");
    return { ok: true, invoiceId: row?.id, docId: docId ?? undefined, invoiceNumber, title, html };
  }

  return { ok: false, error: "Could not allocate an invoice number, please try again." };
}

// List recent invoices for the Reports page (newest first).
export async function listInvoices(limit = 20) {
  const { data } = await admin()
    .from("invoices")
    .select("id,invoice_number,brand,bill_to_company,issue_date,due_date,currency,total,status,doc_id,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data || []) as any[];
}
