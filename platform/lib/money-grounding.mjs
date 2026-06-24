// Money-grounding for flag_to_nur (KT #394, the "Sanara KES 30,000" hallucination). A flag that
// asserts a SPECIFIC currency amount about an uploaded document must have that figure present in
// the document's real extracted text — else the model invented it. Pure helpers, imported by
// lib/smart-tools.ts AND the wall (zero-drift). No DB, no IO.

// Currency figures the summary CLAIMS (digits only, commas/spaces stripped): "KES 30,000" -> "30000".
export function claimedFigures(summary) {
  return (String(summary || "").match(/\b(?:KES|Ksh|USD|\$)\s*([\d][\d,]{2,})|\b([\d][\d,]{3,})\s*(?:KES|Ksh|USD|shillings|bob)\b/gi) || [])
    .map((m) => (m.match(/[\d,]{3,}/) || [""])[0].replace(/[,\s]/g, ""))
    .filter((x) => x.length >= 3);
}

// Figures the summary claims that are NOT present in the document's extracted text. Returns [] when
// the doc text is too short to judge (extraction failed/empty) — we never call a figure "wrong"
// when we could not read the document (no false accusation; the file is still delivered to Nur).
export function ungroundedFigures(summary, docText) {
  const norm = String(docText || "").replace(/[,\s]/g, "");
  if (norm.length <= 20) return [];
  return claimedFigures(summary).filter((c) => !norm.includes(c));
}
