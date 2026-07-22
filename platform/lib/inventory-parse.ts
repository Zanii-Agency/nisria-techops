// Pure Maisha product-caption parser. Extracted from smart-tools (2026-07-22 FADHILI incident)
// so it has ZERO heavy deps and can be unit-tested in isolation. Splits a caption into a CLEAN
// name + structured details, so the whole caption never lands in `name`. Handles BOTH free-form
// ("FADHILI Kimono can fit L/XL/XXL, shoulder 20 chest 50") AND the standard labeled template.

// The standard capture format Nur/Michell sends with every product photo. Keeping it here (next
// to the parser that reads it) so the human template and the machine parse never drift apart.
export const MAISHA_ITEM_TEMPLATE =
`📦 New Maisha piece. Copy this, fill it in, and send it with the photo:

Name:
Sizes:
Shoulder:
Chest:
Sleeve:
Length:
Cost:
Price:

Send the extra angle photos right after, I'll add them to the same item. Cost and Price are optional and founder-only.`;

const CAPTION_DETAIL_CUT = /\b(can\s+fit|fits?|sizes?\b|size[:\s]|shoulder|chest|bust|waist|hip|sleeve|length\b|\blen\b|measurement|colou?r|price|cost|ksh|kes|usd|aed|qty|quantity|made\s+by|maker|trk[-\s]?\d)\b/i;
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

export function parseProductCaption(text: string): {
  name: string; sizeRange: string | null; measurements: string | null; description: string;
  unitCost: number | null; costCurrency: string | null; unitPrice: number | null; priceCurrency: string | null;
} {
  const full = (text || "").trim().replace(/[ \t]+/g, " ");
  const flat = full.replace(/\s+/g, " ");
  // NAME. A labeled "Name:" (the template) wins; else the leading phrase before the first detail.
  let name = "";
  const labeled = flat.match(/\b(?:name|product|item|piece)\s*[:\-]\s*([^\n]+?)(?=\s*(?:\bsizes?\b|\bshoulder\b|\bchest\b|\bbust\b|\bwaist\b|\bhip\b|\bsleeve\b|\blength\b|\blen\b|\bcost\b|\bprice\b|\bqty\b|\bquantity\b)|$)/i);
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
  const sizeCtx = flat.match(/\b(?:sizes?|can\s+fit|fits?)\b\s*[:\-]?\s*([A-Za-z0-9,\/\s]*?)(?=\b(?:shoulder|chest|bust|waist|hip|sleeve|length|len|cost|price|qty|quantity|colou?r|made|maker|trk)\b|$)/i);
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
  // COST / PRICE (currency-carrying only; a bare number never becomes money — Currency law).
  const c = money(flat, "cost");
  const p = money(flat, "price");
  return {
    name, sizeRange, measurements, description: flat.slice(0, 600),
    unitCost: c.currency ? c.amount : null, costCurrency: c.currency,
    unitPrice: p.currency ? p.amount : null, priceCurrency: p.currency,
  };
}
