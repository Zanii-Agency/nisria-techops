// Pure Maisha product-caption parser. Extracted from smart-tools (2026-07-22 FADHILI incident)
// so it has ZERO heavy deps and can be unit-tested in isolation. Splits a caption into a CLEAN
// name + structured details, so the whole caption never lands in `name`. Handles BOTH free-form
// ("FADHILI Kimono can fit L/XL/XXL, shoulder 20 chest 50") AND the standard labeled template.
//
// 2026-07-23: the operator's real template had drifted far past the fixed vocabulary the parser
// knew (Weight, Time to make, Artisan, Storage, Fabrics, Product Category, Product ID, "Price in
// dollars"), so those lines were silently dropped. Fix: a GENERIC labelled-line pass. Known labels
// map to first-class columns; every other label rides the `attributes` bag (the `links` jsonb) so
// nothing is ever dropped again, and any future label the operator invents is captured for free.

// The standard capture format the operator sends with every product photo. Keeping it here (next
// to the parser that reads it) so the human template and the machine parse never drift apart.
export const MAISHA_ITEM_TEMPLATE =
`📦 New Maisha piece. Copy this, fill it in, and send it with the photo:

Name:
Sizes:
Shoulder:
Chest:
Sleeve:
Length:
Weight:
Time to make:
Artisan:
Fabrics:
Collection:
Product Category:
Product ID:
Storage:
Cost:
Price:

Any extra line you add as "Label: value" is kept too. Send the extra angle photos right after,
I'll add them to the same item. Cost and Price are optional and founder-only.`;

const CAPTION_DETAIL_CUT = /\b(can\s+fit|fits?|sizes?\b|size[:\s]|shoulder|chest|bust|waist|hip|sleeve|length\b|\blen\b|measurement|colou?r|price|cost|ksh|kes|usd|aed|qty|quantity|made\s+by|maker|artisan|weight|storage|fabrics?|collection|category|product\s+id|trk[-\s]?\d)\b/i;
const normCcy = (c: string): string => { const u = c.toUpperCase(); return u === "KSH" ? "KES" : u === "$" ? "USD" : u; };

function money(text: string, label: "cost" | "price"): { amount: number | null; currency: string | null } {
  // "Cost: 3500 KES", "price 60 usd", "KES 3,500" after the label. Currency may lead or trail.
  const re = new RegExp(`\\b${label}\\b\\s*[:\\-]?\\s*(?:(KES|KSH|USD|AED|\\$)\\s*)?([\\d][\\d,]*(?:\\.\\d+)?)\\s*(KES|KSH|USD|AED|\\$)?`, "i");
  const m = text.match(re);
  if (!m) return { amount: null, currency: null };
  const amount = Number(String(m[2]).replace(/,/g, ""));
  if (!isFinite(amount) || amount < 0) return { amount: null, currency: null };
  const ccy = m[1] || m[3];
  return { amount, currency: ccy ? normCcy(ccy) : null };
}

// Money from a discrete "Label: value" pair (the template path). The value carries the figure and
// often the currency ("$200", "3500 KES"); the label can also name the currency ("Price in dollars").
// Currency law: a figure only becomes money when a currency is determinable, never a bare number.
function moneyFromLabelValue(label: string, value: string): { amount: number | null; currency: string | null } {
  const num = String(value).replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!num) return { amount: null, currency: null };
  const amount = Number(num[1]);
  if (!isFinite(amount) || amount < 0) return { amount: null, currency: null };
  let ccy: string | null = null;
  const tok = String(value).match(/\b(KES|KSH|USD|AED)\b/i) || String(value).match(/(\$)/);
  const hay = `${label} ${value}`.toLowerCase();
  if (tok) ccy = normCcy(tok[1]);
  else if (/\bdollars?\b|\busd\b|\$/.test(hay)) ccy = "USD";
  else if (/\bshillings?\b|\bbob\b|\bksh\b|\bkes\b/.test(hay)) ccy = "KES";
  else if (/\bdirhams?\b|\baed\b/.test(hay)) ccy = "AED";
  return { amount, currency: ccy };
}

// Split a caption into labelled lines. Two shapes: "Label: value" and "Label - value" (the dash
// MUST be space-padded so a hyphenated value like ASL-025-KMN stays intact as the value). Lines
// with neither (free-form prose) are skipped so the free-form path is untouched.
export function parseLabeledLines(text: string): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let m = line.match(/^([^:]{1,40}):\s*(.+)$/);              // "Label: value"
    if (!m) m = line.match(/^(.{1,40}?)\s[-–—]\s+(.+)$/);       // "Label - value"
    if (!m) continue;
    const label = m[1].trim().replace(/^[*_•\s]+|[*_•\s]+$/g, "");
    const value = m[2].trim();
    if (label && value) out.push({ label: label.slice(0, 40), value: value.slice(0, 200) });
    if (out.length >= 30) break; // sanity cap
  }
  return out;
}

// Labels we understand map to first-class columns; everything else is kept verbatim in `attributes`.
// Measurement/size/name/money labels are "handled elsewhere" — recognised so they never leak into
// the attributes bag, but their values come from the dedicated parsers below.
const KNOWN_LABEL: Record<string, "name" | "size" | "measurement" | "cost" | "price" | "collection" | "category" | "trackingNo" | "location" | "maker" | "style"> = {
  "name": "name", "product name": "name", "product": "name", "item": "name", "piece": "name", "title": "name",
  "size": "size", "sizes": "size",
  "shoulder": "measurement", "chest": "measurement", "bust": "measurement", "waist": "measurement",
  "hip": "measurement", "hips": "measurement", "sleeve": "measurement", "length": "measurement", "len": "measurement", "measurements": "measurement",
  "cost": "cost", "wholesale": "cost", "cost price": "cost",
  "price": "price", "price in dollars": "price", "price in usd": "price", "price in shillings": "price",
  "rrp": "price", "retail": "price", "retail price": "price", "selling price": "price",
  "collection": "collection",
  "category": "category", "product category": "category", "type": "category",
  "product id": "trackingNo", "productid": "trackingNo", "id": "trackingNo", "sku": "trackingNo",
  "code": "trackingNo", "product code": "trackingNo", "item id": "trackingNo", "ref": "trackingNo", "tracking": "trackingNo", "tracking no": "trackingNo", "tracking #": "trackingNo",
  "storage": "location", "location": "location", "stored": "location", "stored in": "location", "warehouse": "location",
  "artisan": "maker", "artisans": "maker", "maker": "maker", "makers": "maker", "made by": "maker", "tailor": "maker", "seamstress": "maker",
  "style": "style",
};

export function parseProductCaption(text: string): {
  name: string; sizeRange: string | null; measurements: string | null; description: string;
  unitCost: number | null; costCurrency: string | null; unitPrice: number | null; priceCurrency: string | null;
  trackingNo: string | null; category: string | null; collection: string | null; style: string | null;
  location: string | null; maker: string | null; attributes: Record<string, string>;
} {
  const full = (text || "").trim().replace(/[ \t]+/g, " ");
  const flat = full.replace(/\s+/g, " ");

  // ---- generic labelled-line pass: map known labels, keep the rest as attributes ----
  const labels = parseLabeledLines(text);
  const known: Partial<Record<string, string>> = {};
  const attributes: Record<string, string> = {};
  let labelledPrice: { amount: number | null; currency: string | null } = { amount: null, currency: null };
  let labelledCost: { amount: number | null; currency: string | null } = { amount: null, currency: null };
  for (const { label, value } of labels) {
    const key = label.toLowerCase().replace(/\s+/g, " ").replace(/[:#]+$/, "").trim();
    const mapped = KNOWN_LABEL[key];
    if (mapped === "price") { const m = moneyFromLabelValue(label, value); if (m.amount != null) labelledPrice = m; continue; }
    if (mapped === "cost") { const m = moneyFromLabelValue(label, value); if (m.amount != null) labelledCost = m; continue; }
    if (mapped === "measurement" || mapped === "size" || mapped === "name") continue; // handled by the dedicated parsers below
    if (mapped) { if (known[mapped] == null) known[mapped] = value; continue; }
    if (Object.keys(attributes).length < 20) attributes[label] = value; // the long tail rides the bag
  }

  // NAME. A labeled "Name:" (the template) wins; else the leading phrase before the first detail.
  let name = "";
  const labeled = flat.match(/\b(?:name|product|item|piece)\s*[:\-]\s*([^\n]+?)(?=\s*(?:\bsizes?\b|\bshoulder\b|\bchest\b|\bbust\b|\bwaist\b|\bhip\b|\bsleeve\b|\blength\b|\blen\b|\bcost\b|\bprice\b|\bqty\b|\bquantity\b|\bweight\b|\bartisan\b|\bstorage\b|\bfabrics?\b|\bcollection\b|\bcategory\b|\bproduct\s+id\b)|$)/i);
  if (labeled && labeled[1].trim().length >= 2) name = labeled[1].trim();
  if (!name) {
    const cut = flat.search(CAPTION_DETAIL_CUT);
    if (cut < 0) name = flat;               // no detail keyword: the whole thing is the name
    else if (cut > 0) name = flat.slice(0, cut); // leading phrase before the first detail keyword
    // cut === 0 (details-only, NO leading name): leave name EMPTY so callers use their own fallback.
  }
  name = name.replace(/^\s*(?:name|product|item|piece)\s*[:\-]\s*/i, "").replace(/[\s,\-–:."”]+$/, "").slice(0, 60).trim();
  // NO whole-caption fallback: an empty name means "no product name found" — draftNameFrom keeps
  // its placeholder and classify_and_enrich keeps target.name. Dumping the caption here was the bug.

  // SIZE RANGE: only tokens inside a SIZE context ("size(s)/can fit/fits ..."), not a bare global
  // scan — so "M-Pesa" or a maker's "S." never gets folded in as a size.
  const order = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
  let sizeRange: string | null = null;
  const sizeCtx = flat.match(/\b(?:sizes?|can\s+fit|fits?)\b\s*[:\-]?\s*([A-Za-z0-9,\/\s]*?)(?=\b(?:shoulder|chest|bust|waist|hip|sleeve|length|len|cost|price|qty|quantity|colou?r|made|maker|artisan|weight|storage|fabrics?|collection|category|product|trk)\b|$)/i);
  if (sizeCtx) {
    const found = new Set([...sizeCtx[1].matchAll(/\b(XS|S|M|L|XL|XXL|XXXL|2XL|3XL)\b/gi)].map((m) => m[1].toUpperCase().replace("2XL", "XXL").replace("3XL", "XXXL")));
    if (found.size) sizeRange = order.filter((s) => found.has(s)).join("/").slice(0, 16) || null;
  }
  // MEASUREMENTS: keyword + number pairs (with optional " / in / cm).
  const meas: string[] = [];
  for (const m of flat.matchAll(/\b(shoulder|chest|bust|waist|hip|sleeve|length|len)\b\s*[:=]?\s*(\d+(?:[./]\d+)*\s*(?:"|”|in\b|inch(?:es)?|cm)?)/gi)) {
    const key = m[1].toLowerCase() === "len" ? "length" : m[1].toLowerCase();
    meas.push(`${key[0].toUpperCase()}${key.slice(1)} ${m[2].trim()}`);
  }
  const measurements = meas.length ? meas.join(", ").slice(0, 300) : null;

  // COST / PRICE: the labelled template value (currency-aware) wins; else the free-form positional
  // scan. Currency law: only a currency-carrying figure becomes money.
  const c = labelledCost.currency ? labelledCost : money(flat, "cost");
  const p = labelledPrice.currency ? labelledPrice : money(flat, "price");

  const clip = (s?: string | null, n = 80) => (s ? String(s).replace(/[\s,]+$/, "").slice(0, n).trim() || null : null);
  return {
    name, sizeRange, measurements, description: flat.slice(0, 600),
    unitCost: c.currency ? c.amount : null, costCurrency: c.currency,
    unitPrice: p.currency ? p.amount : null, priceCurrency: p.currency,
    trackingNo: clip(known["trackingNo"], 40), category: clip(known["category"]), collection: clip(known["collection"]),
    style: clip(known["style"]), location: clip(known["location"]), maker: clip(known["maker"]),
    attributes,
  };
}
