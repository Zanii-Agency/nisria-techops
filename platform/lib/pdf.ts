// Server-side PDF rendering for branded Studio / grant-ready documents (R2-5 #43).
//
// The documents are already self-contained, branded, printable HTML (built by
// lib/grant-docs + studio/actions brandWrap). We render that HTML to a real PDF
// with headless Chrome so it can be attached to outbound email and downloaded.
//
// DESIGN: this is BEST-EFFORT. headless Chrome on a serverless plan can fail to
// launch (binary size, memory, cold start). Every entry point that calls this
// MUST handle a null/throw and fall back to attaching the .html instead, so a
// PDF problem never blocks the core attach + send. Deps (@sparticuz/chromium +
// puppeteer-core) are marked external in next.config.mjs so the packed binary is
// traced rather than bundled.
//
// On Vercel (process.env.AWS_LAMBDA_FUNCTION_NAME / VERCEL is set) we use the
// @sparticuz/chromium binary. Locally there is no bundled Chrome, so we return
// null and the caller falls back to HTML. That is intentional: PDF is a
// production capability, HTML is the universal floor.

let warned = false;

export function pdfSupported(): boolean {
  // Lambda/Vercel provides the chromium binary; local dev does not.
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

// Render self-contained HTML to a PDF Buffer. Returns null on any failure
// (caller falls back to the .html attachment). Never throws.
export async function htmlToPdf(html: string): Promise<Buffer | null> {
  if (!pdfSupported()) return null;
  let browser: any = null;
  try {
    const chromiumMod: any = await import("@sparticuz/chromium");
    const chromium = chromiumMod.default || chromiumMod;
    const puppeteerMod: any = await import("puppeteer-core");
    const puppeteer = puppeteerMod.default || puppeteerMod;

    const executablePath = await chromium.executablePath();
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: true,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 25_000 });
    const pdf = await page.pdf({
      format: "letter",
      printBackground: true,
      margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
    });
    return Buffer.from(pdf);
  } catch (e: any) {
    if (!warned) {
      warned = true;
      console.error("htmlToPdf failed, falling back to HTML attachment:", e?.message || e);
    }
    return null;
  } finally {
    try { if (browser) await browser.close(); } catch {}
  }
}
