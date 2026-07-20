// doc-format.mjs — pure body renderer for branded documents (letterhead PDFs).
// Nur's Claude (or Sasa) may pass semantic HTML (a contract/report with headings,
// clauses, tables) OR plain text / light markdown (a simple letter). Render both to
// clean semantic HTML for brandWrap, stripping anything unsafe for a rendered doc.
// PURE (no imports): imported by lib/smart-tools.ts AND exercised directly by the
// wall under plain node (zero-drift, the whatsapp-format.mjs pattern).
export function docBodyToHtml(raw) {
  const text = String(raw || "");
  const looksHtml = /<(p|h[1-6]|ul|ol|li|table|thead|tbody|tr|td|th|div|section|strong|em|b|i|br|blockquote|hr)\b/i.test(text);
  if (looksHtml) {
    return text
      .replace(/<\/?(?:html|head|body|meta|link|title)[^>]*>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
      .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
      .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
      .trim();
  }
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s) => esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  // MARKDOWN TABLES. Without this, a pipe table passes through as literal text and the
  // PDF prints "| Category | Amount (KES) |" and a separator row of "|, |, |" — exactly
  // what reached Nur on 2026-07-20. A document renderer that cannot render a table the
  // author will obviously write is not a renderer.
  const tableRow = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const isSep = (line) => /^\s*\|?[\s:|-]*-{2,}[\s:|-]*\|?\s*$/.test(line) && line.includes("-");
  const renderTable = (lines) => {
    const rows = lines.filter((l) => !isSep(l)).map(tableRow);
    if (!rows.length) return "";
    const head = rows[0], body = rows.slice(1);
    return "<table><thead><tr>" + head.map((c) => `<th>${inline(c)}</th>`).join("") +
      "</tr></thead><tbody>" +
      body.map((r) => "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") +
      "</tbody></table>";
  };

  const out = [];
  for (const blk of text.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const b = blk.trim();
    if (!b) continue;
    const hm = b.match(/^(#{1,3})\s+([\s\S]*)$/);
    if (hm) { out.push(`<h${hm[1].length}>${inline(hm[2].split("\n")[0])}</h${hm[1].length}>`); continue; }
    if (/^-{3,}$/.test(b)) { out.push("<hr/>"); continue; }
    const lines = b.split(/\n/).filter((l) => l.trim());
    // a pipe table: two or more lines that all carry a | and are not all separators
    if (lines.length >= 2 && lines.every((l) => l.includes("|")) && lines.some((l) => !isSep(l))) {
      const t = renderTable(lines);
      if (t) { out.push(t); continue; }
    }
    if (lines.length && lines.every((l) => /^\s*[-*]\s+/.test(l))) { out.push("<ul>" + lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ""))}</li>`).join("") + "</ul>"); continue; }
    if (lines.length && lines.every((l) => /^\s*\d+\.\s+/.test(l))) { out.push("<ol>" + lines.map((l) => `<li>${inline(l.replace(/^\s*\d+\.\s+/, ""))}</li>`).join("") + "</ol>"); continue; }
    out.push(`<p>${inline(b).replace(/\n/g, "<br/>")}</p>`);
  }
  return out.join("\n");
}
