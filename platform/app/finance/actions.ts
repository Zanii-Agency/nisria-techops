"use server";
import { admin } from "../../lib/supabase-admin";
import { emit } from "../../lib/events";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// M-Pesa screenshot vision parse.
// Mirrors captionImage() in lib/anthropic.ts but asks Claude to read an
// M-Pesa confirmation screenshot and return structured JSON. Kept local to the
// finance slice (lib/* is shared and off-limits to edit).
// ---------------------------------------------------------------------------
type MpesaParse = { amount: number | null; date: string | null; payee: string | null; ref: string | null };

async function parseMpesaImage(base64: string, mediaType: string): Promise<MpesaParse | null> {
  const KEY = process.env.ANTHROPIC_API_KEY || "";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            {
              type: "text",
              text:
                "This is an M-Pesa (mobile money) payment confirmation screenshot. Extract the transaction details. " +
                "amount = the value actually SENT/PAID in this transaction, NOT the M-Pesa balance left, NOT the transaction cost/fee, and NOT any earlier transaction shown. If a separate transaction fee is listed, the amount is the sum paid to the recipient (exclude the fee unless only a single combined figure is shown). " +
                'Respond with ONLY valid JSON, no prose, no code fences, in this exact shape: ' +
                '{"amount": <number or null>, "date": "<ISO date string or null>", "payee": "<recipient name or null>", "ref": "<transaction code/ref or null>"}. ' +
                "amount must be a plain number (no currency symbol or commas). If a field is not visible, use null.",
            },
          ],
        },
      ],
    }),
    cache: "no-store",
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "mpesa vision failed");
  const raw: string = j?.content?.[0]?.text ?? "";
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(cleaned);
    const amt = parsed?.amount;
    return {
      amount: amt === null || amt === undefined ? null : Number(String(amt).replace(/[^0-9.]/g, "")) || null,
      date: parsed?.date ?? null,
      payee: parsed?.payee ?? null,
      ref: parsed?.ref ?? null,
    };
  } catch {
    return null;
  }
}

// Allowed enum sets — guard against bad form values reaching the DB.
const CATEGORIES = ["subscription", "salary", "vendor", "kenya", "other"];
const METHODS = ["mpesa", "bank", "card"];
const CURRENCIES = ["USD", "KES"];
const RECURRENCES = ["none", "monthly", "yearly"];

// ---------------------------------------------------------------------------
// AI EXPENSE INTAKE
// One structured shape every intake path (image / voice / text) resolves into,
// then a human confirms before it is ever written to `payments`. Nothing here
// moves money; it only RECORDS a paid expense once Nur taps confirm.
// ---------------------------------------------------------------------------
export type ExtractedExpense = {
  vendor: string | null;
  amount: number | null;
  currency: "USD" | "KES";
  date: string | null; // YYYY-MM-DD
  category: string; // one of CATEGORIES
  method: "mpesa" | "bank" | "card";
  notes: string | null;
  itemized?: boolean;      // false when the receipt showed only a total
  amountUnclear?: boolean; // true when the paid amount was ambiguous on the receipt
  ref?: string | null;     // canonical transaction reference (M-Pesa code etc.)
};

// M-Pesa style transaction reference: 10 uppercase alphanumerics, must contain a
// digit ("UG4EJ9WXT5"). In SMS text it precedes "Confirmed"; on receipts it is the
// printed receipt number. One ref = one payment (the dedup anchor).
export async function extractTxnRef(text: string | null | undefined): Promise<string | null> {
  const s = String(text || "");
  const m = /\b([A-Z0-9]{10})\s+Confirmed/i.exec(s) || /\b(?=[A-Z0-9]*\d)([A-Z]{2}[A-Z0-9]{8})\b/.exec(s);
  return m ? m[1].toUpperCase() : null;
}

export type ExtractResult = {
  ok: boolean;
  expense?: ExtractedExpense;
  screenshot_path?: string | null; // set when an image was uploaded
  lowConfidence?: boolean; // amount couldn't be read with confidence
  raw?: string | null; // model text, for debugging / transparency
  error?: string;
};

// Coerce a loose model object into a clean ExtractedExpense (never trust the LLM).
function normalizeExpense(parsed: any): ExtractedExpense {
  let category = String(parsed?.category || "").toLowerCase();
  if (!CATEGORIES.includes(category)) category = "other";
  let method = String(parsed?.method || "").toLowerCase();
  if (!METHODS.includes(method)) method = "card";
  let currency = String(parsed?.currency || "USD").toUpperCase();
  if (!CURRENCIES.includes(currency)) currency = "USD";

  const rawAmt = parsed?.amount;
  const amount =
    rawAmt === null || rawAmt === undefined || rawAmt === ""
      ? null
      : Number(String(rawAmt).replace(/[^0-9.]/g, "")) || null;

  let date: string | null = null;
  if (parsed?.date) {
    const d = new Date(String(parsed.date));
    if (!isNaN(d.getTime())) date = d.toISOString().slice(0, 10);
  }

  // Itemisation honesty: if the receipt showed only a total (no line items),
  // say so plainly instead of leaving a blank or a guessed description. A model
  // 'items' summary rides into notes when present; an unclear amount is flagged.
  const items = parsed?.items ? String(parsed.items).trim().slice(0, 200) : null;
  const itemized = parsed?.itemized === true || (parsed?.itemized === undefined && !!items);
  const amountUnclear = String(parsed?.amount_kind || "").toLowerCase() === "unclear";
  const modelNotes = parsed?.notes ? String(parsed.notes).trim().slice(0, 200) : null;
  const noteParts = [
    items ? `Items: ${items}` : (amount != null && !itemized ? "Total only: receipt not itemised (what was bought is not shown)" : null),
    amountUnclear ? "Amount unclear on receipt, please verify" : null,
    modelNotes,
  ].filter(Boolean);

  return {
    vendor: parsed?.vendor ? String(parsed.vendor).trim().slice(0, 120) : null,
    amount,
    currency: currency as "USD" | "KES",
    date,
    category,
    method: method as "mpesa" | "bank" | "card",
    notes: noteParts.length ? noteParts.join(". ").slice(0, 400) : null,
    itemized,
    amountUnclear,
    ref: parsed?.ref ? String(parsed.ref).trim().toUpperCase().slice(0, 24) : null,
  };
}

const EXPENSE_SHAPE =
  "Read it carefully and reason before answering:\n" +
  "- AMOUNT: return the FINAL amount actually paid — the grand total including any tax or service, or the amount transferred. Do NOT return a subtotal, a single line-item price, a tax line on its own, a balance, or change given. When several numbers appear, pick the one labelled total / total due / amount paid / grand total; if none is labelled, pick the bottom-line figure that represents the whole payment. Never add up line items yourself when a printed total exists.\n" +
  "- ITEMS: if the receipt lists what was bought, summarise it briefly in 'items' and set itemized=true. If it shows ONLY a total with no breakdown of what was purchased, set items=null and itemized=false. Do NOT invent, guess, or infer what was bought when it is not printed — an unitemised total is normal and must be reported honestly.\n" +
  "- amount_kind: 'total' if you are confident the amount is the final paid figure; 'unclear' if the receipt is ambiguous, partly cut off, or you had to guess which number to use.\n" +
  'Respond with ONLY valid JSON, no prose, no code fences, in this exact shape: ' +
  '{"vendor": <string or null>, "amount": <number or null>, "currency": "USD"|"KES", ' +
  '"date": "<ISO date YYYY-MM-DD or null>", "category": "subscription"|"salary"|"vendor"|"kenya"|"other", ' +
  '"method": "mpesa"|"bank"|"card", "ref": "<the receipt/transaction reference code printed on it, or null>", ' +
  '"items": <short string or null>, "itemized": true|false, "amount_kind": "total"|"unclear", "notes": <short string or null>}. ' +
  "amount must be a plain number (no symbol or commas). Use KES for Kenyan shillings / M-Pesa, " +
  "USD otherwise. Pick the single best category. If unsure of a field, use null (but always give currency, category, method, itemized, amount_kind).";

// Vision: read a receipt / screenshot image OR a PDF into a structured expense.
async function visionExtractExpense(base64: string, mediaType: string): Promise<{ expense: ExtractedExpense; raw: string } | null> {
  const KEY = process.env.ANTHROPIC_API_KEY || "";
  const isPdf = mediaType === "application/pdf";
  const mediaBlock = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
    : { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [
            mediaBlock,
            {
              type: "text",
              text:
                "This is a receipt, invoice, or payment confirmation for a nonprofit's expense. Extract the spend details. " +
                EXPENSE_SHAPE,
            },
          ],
        },
      ],
    }),
    cache: "no-store",
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "vision extract failed");
  const raw: string = j?.content?.[0]?.text ?? "";
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    return { expense: normalizeExpense(JSON.parse(cleaned)), raw };
  } catch {
    return null;
  }
}

// Text: parse a typed or spoken description into the same structured expense.
async function textExtractExpense(text: string): Promise<{ expense: ExtractedExpense; raw: string } | null> {
  const KEY = process.env.ANTHROPIC_API_KEY || "";
  const today = new Date().toISOString().slice(0, 10);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content:
            `A nonprofit founder is describing money she spent, by voice or typing. Today is ${today}. ` +
            `Turn her words into a single structured expense. If she doesn't say a date, leave date null (do NOT guess). ` +
            `Description:\n"""${text.slice(0, 1500)}"""\n\n` +
            EXPENSE_SHAPE,
        },
      ],
    }),
    cache: "no-store",
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "text extract failed");
  const raw: string = j?.content?.[0]?.text ?? "";
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    return { expense: normalizeExpense(JSON.parse(cleaned)), raw };
  } catch {
    return null;
  }
}

// ACTION: drop a receipt image → upload to Storage → vision extract → return a
// PRE-FILLED expense for one-tap confirm. Does NOT write a payment yet (gated).
export async function extractExpenseFromImage(fd: FormData): Promise<ExtractResult> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "No file received." };
  const isPdf = file.type === "application/pdf";
  if (!file.type.startsWith("image/") && !isPdf) return { ok: false, error: "Please drop an image or PDF (receipt, screenshot, invoice)." };

  const db = admin();
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "image/jpeg";
  const safe = file.name.replace(/[^a-z0-9._-]/gi, "_");
  const path = `receipts/${Date.now()}-${safe}`;

  const { error: upErr } = await db.storage.from("assets").upload(path, buf, { contentType: mime, upsert: false });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  if (buf.length >= 4_500_000) {
    // too large for the vision API — keep the file, return an empty draft to confirm by hand
    return { ok: true, screenshot_path: path, lowConfidence: true, expense: normalizeExpense({}) , raw: null };
  }

  let out: { expense: ExtractedExpense; raw: string } | null = null;
  try {
    out = await visionExtractExpense(buf.toString("base64"), mime);
  } catch (e: any) {
    return { ok: true, screenshot_path: path, lowConfidence: true, expense: normalizeExpense({}), error: e?.message || null, raw: null };
  }
  if (!out) return { ok: true, screenshot_path: path, lowConfidence: true, expense: normalizeExpense({}), raw: null };

  return { ok: true, screenshot_path: path, lowConfidence: !out.expense.amount, expense: out.expense, raw: out.raw };
}

// ACTION: typed or spoken description → structured expense draft for confirm.
export async function extractExpenseFromText(text: string): Promise<ExtractResult> {
  const t = (text || "").trim();
  if (!t) return { ok: false, error: "Tell me what you spent." };
  let out: { expense: ExtractedExpense; raw: string } | null = null;
  try {
    out = await textExtractExpense(t);
  } catch (e: any) {
    return { ok: false, error: e?.message || "Could not read that." };
  }
  if (!out) return { ok: false, error: "Could not understand that. Try naming the vendor and amount." };
  return { ok: true, lowConfidence: !out.expense.amount, expense: out.expense, raw: out.raw };
}

// ACTION: human-confirmed expense → write a PAID, money-out payment row.
// This is the only path in the AI intake that touches the DB. Gated by an
// explicit click in the confirm UI. Re-validates every field server-side.
export async function confirmExpense(fd: FormData) {
  const vendor = String(fd.get("vendor") || "").trim();
  const amount = Number(String(fd.get("amount") || "").replace(/[^0-9.]/g, "")) || null;
  if (!vendor || !amount) return;

  let category = String(fd.get("category") || "other").toLowerCase();
  if (!CATEGORIES.includes(category)) category = "other";
  let method = String(fd.get("method") || "card").toLowerCase();
  if (!METHODS.includes(method)) method = "card";
  let currency = String(fd.get("currency") || "USD").toUpperCase();
  if (!CURRENCIES.includes(currency)) currency = "USD";

  const notes = String(fd.get("notes") || "").trim() || "Logged via AI expense intake";
  const screenshot_path = String(fd.get("screenshot_path") || "").trim() || null;
  const source = String(fd.get("source") || "ai").trim(); // image | voice | text | pdf
  const dateStr = String(fd.get("date") || "").trim();

  // Project scope (e.g. Yalla Kenya) + provenance. A project expense books the
  // same way, tagged so the project ledger can sum it and prove its source.
  const project = String(fd.get("project") || "").trim().toLowerCase() || null;
  const source_type = String(fd.get("source_type") || source || "").trim() || null;
  const source_ref = screenshot_path || String(fd.get("source_ref") || "").trim() || null;
  // when the proof was uploaded — this confirm always follows an upload, so now
  const source_uploaded_at = source_ref ? new Date().toISOString() : null;

  // a Kenya/M-Pesa expense in KES belongs on the Kenya side of reconciliation
  const vendor_country = category === "kenya" || method === "mpesa" ? "Kenya" : null;

  let paid_at = new Date().toISOString();
  if (dateStr) {
    const d = new Date(dateStr + "T12:00:00Z");
    if (!isNaN(d.getTime())) paid_at = d.toISOString();
  }

  const db = admin();
  const { data: row } = await db
    .from("payments")
    .insert({
      direction: "out",
      payee: vendor,
      purpose: notes,
      amount,
      currency,
      method,
      status: "paid",
      paid_at,
      category,
      recurrence: "none",
      vendor_country,
      screenshot_path,
      project,
      source_type,
      source_ref,
      source_uploaded_at,
      confirmed_at: new Date().toISOString(), // human-confirmed at the point of save
      ref: `AI-${source.toUpperCase()}-${Date.now()}`,
      created_by: "Nur",
    })
    .select()
    .single();

  await emit({
    type: "payment.verified",
    source: "finance",
    actor: "Nur",
    subject_type: "payment",
    subject_id: row?.id ?? null,
    payload: { payee: vendor, amount, currency, method, category, paid_at, intake: source, ai: true, project },
  });
  revalidatePath("/finance");
  revalidatePath("/reports");
  if (project) revalidatePath(`/${project}`);
}

// ---------------------------------------------------------------------------
// GROUP RECEIPT AUTO-BOOK — a receipt image/PDF dropped in a project group (e.g.
// the Finances group, currently all Yalla expenses) is the expense itself. Run
// the same vision extractor and book it, tagged to the group's project, with the
// stored file as its source proof. Guard: only books if an AMOUNT is read, so a
// logo/selfie never becomes a phantom expense. needs_review=true → Nur confirms
// at day end. Idempotent on the caller-supplied ref. Called from the group
// ingest route (server-to-server), so it takes raw bytes, not a FormData.
// ---------------------------------------------------------------------------
export async function bookExpenseFromMedia(opts: {
  base64: string;
  mime: string;
  project: string | null;
  sourceRef: string;      // storage path of the already-stored asset
  ref: string;            // idempotency key, e.g. GROUP-MEDIA-<messageId>
  group?: string | null;
  sender?: string | null;
  createdBy?: string | null; // e.g. group:<senderPhone>, so a caption can back-fill this sender's batch
  captionText?: string | null; // the message text sent WITH the receipt, if any
}): Promise<{ booked: boolean; reason?: string; amount?: number | null; currency?: string; payee?: string | null }> {
  const db = admin();
  // Idempotency: never double-book the same message.
  const { data: exist } = await db.from("payments").select("id").eq("ref", opts.ref).limit(1);
  if (exist?.[0]) return { booked: false, reason: "duplicate" };

  const isPdf = opts.mime === "application/pdf";

  // TWO WITNESSES (architecture, 2026-07-11): a receipt can speak twice — the
  // human caption ("Kes 557 for food ... [image]") and the document itself via
  // vision. Read BOTH when both are available. Agreement = cross-checked (high
  // confidence). Disagreement = book the CAPTION amount (the human's claim) with
  // a loud mismatch note for Nur. Vision-only for bare receipts; caption-only
  // when the vision API is down (never blocks booking).
  const caption = String(opts.captionText || "").trim();
  const capAmtM = /(?:kes|ksh|kshs|ksh\.|kes\.)\s*([\d][\d,]*)/i.exec(caption);
  const capAmt = capAmtM ? Number(capAmtM[1].replace(/,/g, "")) || null : null;

  let visionE: ExtractedExpense | null = null;
  if (opts.base64.length < 6_000_000) {
    try {
      const out = await visionExtractExpense(opts.base64, isPdf ? "application/pdf" : opts.mime);
      visionE = out?.expense || null;
    } catch (err: any) {
      if (!capAmt) return { booked: false, reason: `vision_error:${String(err?.message || err).slice(0, 80)}` };
      // caption still books; vision cross-check just unavailable this time
    }
  } else if (!capAmt) return { booked: false, reason: "too_large_for_vision" };

  let e: ExtractedExpense | null = null;
  if (capAmt) {
    // Payee from "to/for <Name>" in the caption (never the project label itself),
    // falling back to the vision-read payee off the receipt.
    let payeeM = /(?:sent to|paid to|to|for)\s+([A-Z][A-Za-z .'-]{2,40})/.exec(caption);
    if (payeeM && /yalla|film|project|nisria/i.test(payeeM[1])) payeeM = null;
    const desc = caption.replace(/^\[(?:image|document)\][^\S\n]*/i, "").replace(/^[^A-Za-z]*(?:kes|ksh)[\s.]*[\d,]+\s*/i, "").trim().slice(0, 200) || null;
    const crossNote =
      visionE?.amount == null
        ? null
        : visionE.amount === capAmt
          ? "Amount cross-checked against the receipt"
          : `MISMATCH: caption says ${capAmt}, receipt reads ${visionE.amount}. Please check`;
    e = {
      vendor: payeeM ? payeeM[1].trim() : visionE?.vendor || null,
      amount: capAmt,
      currency: /(?:usd|\$)/i.test(caption) ? "USD" : "KES",
      date: visionE?.date || null,
      category: "other",
      method: "mpesa",
      notes: [desc, crossNote].filter(Boolean).join(". ") || null,
      itemized: false,
      ref: visionE?.ref || null,
    };
  } else {
    // No caption amount: the receipt itself is the only witness.
    if (!visionE || !visionE.amount) return { booked: false, reason: "no_amount" };
    e = visionE;
  }

  // IDENTITY-FIRST DEDUP (architecture, 2026-07-11): the transaction reference on
  // the receipt is the payment's canonical identity. Same ref anywhere in the
  // ledger, ANY day = the same payment (SMS today, PDF tomorrow, screenshot next
  // week all collapse). Two real purchases with the same amount have different
  // refs, so they BOTH book. The sender+amount+booking-day heuristic survives
  // only as the fallback for ref-less receipts.
  const txnRef = e.ref || (await extractTxnRef(caption));
  if (txnRef) {
    const { data: dupRef } = await db.from("payments").select("id").eq("txn_ref", txnRef).limit(1);
    if (dupRef?.[0]) {
      await emit({ type: "group.payment_dup_suppressed", source: "group-bot", actor: opts.sender || "group", subject_type: "payment", subject_id: dupRef[0].id, payload: { group: opts.group, amount: e.amount, txn_ref: txnRef, via: "ref_identity" } });
      return { booked: false, reason: "duplicate_txn_ref" };
    }
  } else if (opts.createdBy && e.amount) {
    const d = new Date();
    const dayStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
    const { data: dup } = await db.from("payments").select("id")
      .eq("created_by", opts.createdBy).eq("amount", e.amount)
      .gte("created_at", dayStart).limit(1); // booking day, not txn date: a forwarded SMS carries an old paid_at
    if (dup?.[0]) {
      await emit({ type: "group.payment_dup_suppressed", source: "group-bot", actor: opts.sender || "group", subject_type: "payment", subject_id: dup[0].id, payload: { group: opts.group, amount: e.amount, ref: opts.ref, via: "sender_day_amount" } });
      return { booked: false, reason: "duplicate_same_sender_day_amount" };
    }
  }
  const project = opts.project || null;
  const category = e.category && e.category !== "other" ? e.category : project === "yalla" ? "other" : "kenya";
  const vendor_country = category === "kenya" || e.method === "mpesa" ? "Kenya" : null;
  const paid_at = e.date ? new Date(e.date + "T12:00:00Z").toISOString() : new Date().toISOString();

  const { data: row } = await db
    .from("payments")
    .insert({
      direction: "out",
      payee: e.vendor || `Receipt from ${opts.group || "group"}`,
      purpose: `${e.notes ? e.notes + ". " : ""}Auto-logged receipt from ${opts.group || "group"}${opts.sender ? ` (posted by ${opts.sender})` : ""}; needs day-end confirm`,
      amount: e.amount,
      currency: e.currency,
      method: e.method,
      status: "paid",
      paid_at,
      category,
      recurrence: "none",
      vendor_country,
      project,
      source_type: isPdf ? "pdf" : "image",
      source_ref: opts.sourceRef,
      screenshot_path: opts.sourceRef,
      source_uploaded_at: new Date().toISOString(),
      needs_review: true,
      ref: opts.ref,
      txn_ref: txnRef,
      created_by: opts.createdBy || `group:${opts.group || ""}`,
    })
    .select()
    .single();

  await emit({
    type: "group.receipt_autobooked", source: "group-bot", actor: opts.sender || "group",
    subject_type: "payment", subject_id: row?.id ?? null,
    payload: { group: opts.group, project, amount: e.amount, currency: e.currency, needs_review: true },
  });
  revalidatePath("/finance");
  if (project) revalidatePath(`/${project}`);
  return { booked: true, amount: e.amount, currency: e.currency, payee: e.vendor };
}

// ACTION: Nur confirms the auto-logged (needs_review) expenses for a project.
// Clears the review flag and stamps confirmed_at. This is the day-end sign-off
// the digest asks her for. Explicit click only; records, never moves money.
export async function confirmReviewedExpenses(fd: FormData) {
  const project = String(fd.get("project") || "").trim().toLowerCase() || null;
  const db = admin();
  let q = db
    .from("payments")
    .update({ needs_review: false, confirmed_at: new Date().toISOString() })
    .eq("needs_review", true);
  q = project ? q.eq("project", project) : q.is("project", null);
  const { data: rows } = await q.select("id");
  await emit({
    type: "expenses.confirmed", source: "finance", actor: "Nur",
    subject_type: "payment", subject_id: null,
    payload: { project, count: rows?.length ?? 0 },
  });
  revalidatePath("/finance");
  if (project) revalidatePath(`/${project}`);
}

// ---------------------------------------------------------------------------
// KENYA RECONCILIATION — upload a PAST receipt + log the KES spend.
// Stores the receipt image in Storage and records a paid Kenya (KES) payment so
// the "Paid out in Kenya" side of the reconciliation reflects real ground spend.
// Historical data is expected to be incomplete; that's fine — every receipt from
// here forward is captured. Vision pre-read is best-effort, never blocking.
// ---------------------------------------------------------------------------
export async function logKenyaReceipt(fd: FormData) {
  const amount = Number(String(fd.get("amount") || "").replace(/[^0-9.]/g, "")) || null;
  const payee = String(fd.get("payee") || "").trim() || "Kenya field spend";
  const purpose = String(fd.get("purpose") || "").trim() || "Historical Kenya receipt";
  const dateStr = String(fd.get("paid_at") || "").trim();
  let currency = String(fd.get("currency") || "KES").toUpperCase();
  if (!CURRENCIES.includes(currency)) currency = "KES";

  let paid_at = new Date().toISOString();
  if (dateStr) {
    const d = new Date(dateStr + "T12:00:00Z");
    if (!isNaN(d.getTime())) paid_at = d.toISOString();
  }

  const db = admin();

  // optional receipt image — store it if present
  let screenshot_path: string | null = null;
  const file = fd.get("file");
  if (file instanceof File && file.size > 0 && file.type.startsWith("image/")) {
    const buf = Buffer.from(await file.arrayBuffer());
    const safe = file.name.replace(/[^a-z0-9._-]/gi, "_");
    const path = `receipts/kenya-${Date.now()}-${safe}`;
    const { error: upErr } = await db.storage.from("assets").upload(path, buf, { contentType: file.type, upsert: false });
    if (!upErr) screenshot_path = path;
  }

  if (!amount) return; // need at least an amount to count toward the reconciliation

  const { data: row } = await db
    .from("payments")
    .insert({
      direction: "out",
      payee,
      purpose,
      amount,
      currency,
      method: "mpesa",
      status: "paid",
      paid_at,
      category: "kenya",
      recurrence: "none",
      vendor_country: "Kenya",
      screenshot_path,
      ref: `KENYA-RECEIPT-${Date.now()}`,
      created_by: "Nur",
    })
    .select()
    .single();

  await emit({
    type: "payment.verified",
    source: "finance",
    actor: "Nur",
    subject_type: "payment",
    subject_id: row?.id ?? null,
    payload: { payee, amount, currency, category: "kenya", paid_at, screenshot_path, historical: true },
  });
  revalidatePath("/finance");
  revalidatePath("/reports");
}

// Roll a YYYY-MM-DD date forward by N months or N years (calendar-safe).
function rollForward(due: string | null, recurrence: string): string | null {
  if (!due) return null;
  const base = new Date(due + "T00:00:00Z");
  if (isNaN(base.getTime())) return null;
  if (recurrence === "monthly") base.setUTCMonth(base.getUTCMonth() + 1);
  else if (recurrence === "yearly") base.setUTCFullYear(base.getUTCFullYear() + 1);
  else return null;
  return base.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Add a payment / obligation. RECORDS an upcoming obligation; never moves money.
// Captures category, currency, recurrence and vendor country so the finance
// department can populate Nur's recurring bills and remind her when due.
// ---------------------------------------------------------------------------
export async function addPayment(fd: FormData) {
  const payee = String(fd.get("payee") || "").trim();
  const purpose = String(fd.get("purpose") || "").trim() || null;
  const amount = Number(String(fd.get("amount") || "").replace(/[^0-9.]/g, "")) || null;
  const due_on = String(fd.get("due_on") || "").trim() || null;

  let category = String(fd.get("category") || "other");
  if (!CATEGORIES.includes(category)) category = "other";
  let method = String(fd.get("method") || "mpesa");
  if (!METHODS.includes(method)) method = "mpesa";
  let currency = String(fd.get("currency") || "USD").toUpperCase();
  if (!CURRENCIES.includes(currency)) currency = "USD";
  let recurrence = String(fd.get("recurrence") || "none");
  if (!RECURRENCES.includes(recurrence)) recurrence = "none";
  const vendor_country = String(fd.get("vendor_country") || "").trim() || null;

  if (!payee || !amount) return;

  const db = admin();
  const { data: row } = await db
    .from("payments")
    .insert({
      direction: "out",
      payee,
      purpose,
      amount,
      currency,
      method,
      status: "upcoming",
      due_on,
      category,
      recurrence,
      vendor_country,
      created_by: "Nur",
    })
    .select()
    .single();

  await emit({
    type: "payment.scheduled",
    source: "finance",
    actor: "Nur",
    subject_type: "payment",
    subject_id: row?.id ?? null,
    payload: { payee, amount, currency, method, category, recurrence, due_on, vendor_country },
  });
  revalidatePath("/finance");
}

// ---------------------------------------------------------------------------
// Mark an existing payment as paid. Explicit click only. Records, doesn't pay.
// If the payment recurs (monthly|yearly), ALSO schedule the next occurrence so
// the reminder keeps coming back — same details, due date rolled forward.
// ---------------------------------------------------------------------------
export async function markPaid(fd: FormData) {
  const id = String(fd.get("id") || "");
  if (!id) return;

  const db = admin();
  const { data: row } = await db
    .from("payments")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  let nextDue: string | null = null;
  if (row && row.recurrence && row.recurrence !== "none") {
    // base the next due date off the original due date when present, else today
    const base = row.due_on || new Date().toISOString().slice(0, 10);
    nextDue = rollForward(base, row.recurrence);
    if (nextDue) {
      const { data: next } = await db
        .from("payments")
        .insert({
          direction: row.direction || "out",
          payee: row.payee,
          purpose: row.purpose,
          amount: row.amount,
          currency: row.currency || "USD",
          method: row.method,
          status: "upcoming",
          due_on: nextDue,
          category: row.category || "other",
          recurrence: row.recurrence,
          vendor_country: row.vendor_country || null,
          created_by: "Nur",
        })
        .select()
        .single();

      await emit({
        type: "payment.scheduled",
        source: "finance",
        actor: "Nur",
        subject_type: "payment",
        subject_id: next?.id ?? null,
        payload: { payee: row.payee, amount: row.amount, currency: row.currency, recurrence: row.recurrence, due_on: nextDue, rolled_from: id },
      });
    }
  }

  await emit({
    type: "payment.verified",
    source: "finance",
    actor: "Nur",
    subject_type: "payment",
    subject_id: id,
    payload: { payee: row?.payee, amount: row?.amount, currency: row?.currency, method: row?.method, recurrence: row?.recurrence, next_due: nextDue },
  });
  revalidatePath("/finance");
}

// ---------------------------------------------------------------------------
// Log a Givebutter payout — the cash Givebutter wired to the bank, which is
// what actually funds the Kenya M-Pesa spend. Records a PAID, money-out row
// (method=givebutter, category=payout). Used when the API sync path is
// unavailable, or to capture a payout before the next sync runs.
// ---------------------------------------------------------------------------
export async function logPayout(fd: FormData) {
  const amount = Number(String(fd.get("amount") || "").replace(/[^0-9.]/g, "")) || null;
  const dateStr = String(fd.get("paid_at") || "").trim();
  if (!amount) return;

  // form date is YYYY-MM-DD (local intent) → anchor at midday UTC so it never
  // slips to the previous calendar day. Fall back to now if blank/invalid.
  let paid_at = new Date().toISOString();
  if (dateStr) {
    const d = new Date(dateStr + "T12:00:00Z");
    if (!isNaN(d.getTime())) paid_at = d.toISOString();
  }

  const db = admin();
  const { data: row } = await db
    .from("payments")
    .insert({
      direction: "out",
      payee: "Givebutter",
      purpose: "Givebutter payout → Kenya operating funds",
      amount,
      currency: "USD",
      method: "givebutter",
      status: "paid",
      paid_at,
      category: "payout",
      recurrence: "none",
      ref: `GB-PAYOUT-MANUAL-${Date.now()}`,
      created_by: "Nur",
    })
    .select()
    .single();

  await emit({
    type: "payment.verified",
    source: "finance",
    actor: "Nur",
    subject_type: "payment",
    subject_id: row?.id ?? null,
    payload: { payee: "Givebutter", amount, currency: "USD", method: "givebutter", category: "payout", paid_at, manual: true },
  });
  revalidatePath("/finance");
}

// ---------------------------------------------------------------------------
// Log an M-Pesa payment from a confirmation screenshot.
// file -> Claude vision -> create a paid payment row + store the image.
// Best-effort: low-confidence parses still record, flagged for review.
// ---------------------------------------------------------------------------
export async function logMpesa(fd: FormData) {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return;

  const db = admin();
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "image/jpeg";
  const safe = file.name.replace(/[^a-z0-9._-]/gi, "_");
  const path = `receipts/${Date.now()}-${safe}`;

  // store the screenshot in the shared private "assets" bucket
  const { error: upErr } = await db.storage.from("assets").upload(path, buf, { contentType: mime, upsert: false });
  if (upErr) {
    await emit({ type: "payment.failed", source: "finance", actor: "Nur", payload: { name: file.name, error: upErr.message } });
    return;
  }

  // vision parse (best-effort; images must be small enough for the API)
  let parsed: MpesaParse | null = null;
  if (buf.length < 4_500_000) {
    try {
      parsed = await parseMpesaImage(buf.toString("base64"), mime);
    } catch {
      parsed = null;
    }
  }

  const lowConfidence = !parsed || !parsed.amount;
  const amount = parsed?.amount ?? null;
  const payee = parsed?.payee?.trim() || "M-Pesa payment";
  const ref = parsed?.ref?.trim() || null;
  const purpose = lowConfidence
    ? "M-Pesa receipt, needs review (could not auto-read amount)"
    : "Logged from M-Pesa receipt";
  const paid_at = parsed?.date ? new Date(parsed.date).toISOString() : new Date().toISOString();

  const { data: row } = await db
    .from("payments")
    .insert({
      direction: "out",
      payee,
      purpose,
      amount,
      currency: "KES",
      method: "mpesa",
      status: "paid",
      paid_at,
      ref,
      category: "kenya",
      recurrence: "none",
      screenshot_path: path,
      created_by: "Nur",
    })
    .select()
    .single();

  await emit({
    type: "payment.verified",
    source: "finance",
    actor: "Nur",
    subject_type: "payment",
    subject_id: row?.id ?? null,
    payload: { payee, amount, ref, currency: "KES", low_confidence: lowConfidence, screenshot_path: path },
  });
  revalidatePath("/finance");
}
