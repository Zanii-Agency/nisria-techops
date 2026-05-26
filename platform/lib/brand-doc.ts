// lib/brand-doc.ts — the ONE branded printable-document shell (R3-5 / P8 + #43).
//
// Every self-contained, branded, printable document the platform produces (a
// Studio document, a grant-ready doc, a configurable report, an invoice) is
// wrapped by the SAME `brandWrap` so the letterhead, brand colors, the logo
// data-URI, the print CSS, and the headless-Chrome PDF path are identical
// everywhere. There is no second "build branded HTML" path. A fix to the print
// CSS or letterhead here is inherited by every consumer at once.
//
// This was extracted out of app/studio/actions.ts (where it lived as a private
// helper) so the Reports/invoice builders reuse it instead of forking a copy.
//
// Plain module (no "use server"): the consts/types/helper are pure string work
// and import nothing server-only, so server actions can all share them.

export type BrandKey = "nisria" | "maisha" | "ahadi";

export type BrandIdentity = { name: string; legal: string; accent: string; tag: string };

// Brand identity for the letterhead. Colors mirror globals.css (--nisria etc.)
// so the printed document matches the app. Maisha + AHADI are Nisria's sister
// brands; all three are By Nisria Inc.
export const BRANDS: Record<string, BrandIdentity> = {
  nisria: { name: "By Nisria Inc", legal: "By Nisria Inc · 501(c) nonprofit · EIN 88-3508268", accent: "#00C4C2", tag: "Helping children and families in Kenya" },
  maisha: { name: "Maisha", legal: "Maisha · a By Nisria Inc brand · EIN 88-3508268", accent: "#F0746B", tag: "A By Nisria Inc initiative" },
  ahadi: { name: "AHADI", legal: "AHADI · a By Nisria Inc brand · EIN 88-3508268", accent: "#5B5BD6", tag: "A By Nisria Inc initiative" },
};

export const ALLOWED_BRANDS = Object.keys(BRANDS);

export function brandKeyOf(raw: string | null | undefined): string {
  const k = String(raw || "nisria").toLowerCase();
  return ALLOWED_BRANDS.includes(k) ? k : "nisria";
}

export function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Wrap generated body HTML in a branded, self-contained printable document.
// Inline CSS only (so it prints correctly, opens standalone, and survives the
// headless-Chrome PDF path). The body is our own constrained-tag output, not
// escaped here. When a brand logo is set, the letterhead shows the rendered
// logo (a data URI prints reliably) instead of the wordmark (P8).
export function brandWrap(opts: { brandKey: string; title: string; bodyHtml: string; dateStr: string; logoUri?: string | null; footNote?: string }): string {
  const b = BRANDS[opts.brandKey] || BRANDS.nisria;
  const brandMark = opts.logoUri
    ? `<img src="${opts.logoUri}" alt="${escapeHtml(b.name)}" style="height:46px;width:auto;display:block" />`
    : `<div class="doc-brand">By <span class="accent">${escapeHtml(b.name.replace(/^By\s+/, ""))}</span></div>`;
  // R4-7: NO tool/AI-authorship watermark. The footer carries only the org's
  // own legitimate letterhead line (legal name + EIN), never "Prepared with the
  // Nisria Command Center / Document Studio" — nothing outside should learn how
  // the document was made.
  const foot = opts.footNote ? escapeHtml(opts.footNote) : escapeHtml(b.legal);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(opts.title)} · ${escapeHtml(b.name)}</title>
<style>
  :root { --accent: ${b.accent}; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f4f5f7; color: #15171a; font-family: -apple-system, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  .sheet { max-width: 820px; margin: 24px auto; background: #fff; padding: 56px 60px; box-shadow: 0 10px 40px rgba(0,0,0,.08); border-radius: 8px; }
  .doc-letterhead { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 16px; margin-bottom: 26px; border-bottom: 3px solid var(--accent); }
  .doc-brand { font-size: 22px; font-weight: 800; letter-spacing: -0.01em; }
  .doc-brand .accent { color: var(--accent); }
  .doc-tag { font-size: 12px; color: #667; margin-top: 2px; }
  .doc-meta { text-align: right; font-size: 11.5px; color: #667; line-height: 1.5; }
  .doc-body { font-size: 14px; line-height: 1.7; color: #2a2d31; }
  .doc-body h1 { font-size: 22px; margin: 0 0 14px; }
  .doc-body h2 { font-size: 17px; margin: 24px 0 8px; color: #111; }
  .doc-body h3 { font-size: 14.5px; margin: 18px 0 6px; color: #222; }
  .doc-body p { margin: 0 0 12px; }
  .doc-body ul, .doc-body ol { margin: 6px 0 14px; padding-left: 22px; }
  .doc-body li { margin-bottom: 5px; }
  .doc-body table { width: 100%; border-collapse: collapse; margin: 10px 0 18px; font-size: 13px; }
  .doc-body th { text-align: left; background: #f6f8f8; border-bottom: 2px solid var(--accent); padding: 8px 10px; font-size: 11.5px; text-transform: uppercase; letter-spacing: .03em; color: #445; }
  .doc-body td { padding: 8px 10px; border-bottom: 1px solid #e8eaed; }
  .doc-body td.num, .doc-body th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .doc-body tr.total td { border-top: 2px solid var(--accent); border-bottom: none; font-weight: 700; font-size: 14.5px; color: #111; }
  .doc-body blockquote { margin: 12px 0; padding: 6px 16px; border-left: 3px solid var(--accent); color: #445; font-style: italic; }
  .doc-body hr { border: 0; border-top: 1px solid #e3e5e8; margin: 20px 0; }
  .doc-block { break-inside: avoid; page-break-inside: avoid; }
  .doc-foot { margin-top: 34px; padding-top: 14px; border-top: 1px solid #e3e5e8; font-size: 11px; color: #889; }
  @media print {
    body { background: #fff; }
    .sheet { box-shadow: none; margin: 0; max-width: 100%; padding: 0; border-radius: 0; }
    .doc-block, .doc-body table, .doc-body tr, .doc-body p, .doc-body h2 { break-inside: avoid; page-break-inside: avoid; }
    .doc-letterhead { border-bottom-color: var(--accent); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { size: letter; margin: 18mm; }
  }
</style></head>
<body>
  <div class="sheet">
    <div class="doc-letterhead">
      <div>
        ${brandMark}
        <div class="doc-tag">${escapeHtml(b.tag)}</div>
      </div>
      <div class="doc-meta">${escapeHtml(b.legal)}<br/>${escapeHtml(opts.dateStr)}</div>
    </div>
    <div class="doc-body">
${opts.bodyHtml}
    </div>
    <div class="doc-foot">${foot}</div>
  </div>
</body></html>`;
}
