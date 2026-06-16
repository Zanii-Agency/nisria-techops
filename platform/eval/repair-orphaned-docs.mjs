// Repair orphaned WhatsApp documents with null/empty extracted_text.
// Queries the documents table, downloads each file from Supabase Storage,
// sends to Claude via direct Anthropic API call, updates the row.
//
// Usage:
//   node eval/repair-orphaned-docs.mjs           # dry-run
//   node eval/repair-orphaned-docs.mjs --apply   # actually update rows
//   node eval/repair-orphaned-docs.mjs --apply --limit=5  # first 5 only

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// ───────────── env ─────────────
const envSrc = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of envSrc.split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[m[1]] = v;
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error("missing SUPABASE_URL or SUPABASE_SERVICE_KEY"); process.exit(2); }
if (!ANTHROPIC_KEY) { console.error("missing ANTHROPIC_API_KEY"); process.exit(2); }

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const LIMIT = parseInt(args.find((a) => a.startsWith("--limit="))?.split("=")[1] || "999", 10);

const SH = { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY };
const sbGet = (path) => fetch(SUPABASE_URL + "/rest/v1/" + path, { headers: SH }).then((r) => r.json());

// ───────────── Claude API call ─────────────
async function readMediaViaClaude(base64, mime) {
  const isImage = mime.startsWith("image/");
  const isPdf = mime === "application/pdf";
  if (!isImage && !isPdf) return "";

  const block = isImage
    ? { type: "image", source: { type: "base64", media_type: mime, data: base64 } }
    : { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };

  const prompt = "Read this attachment carefully. Extract ALL visible text, numbers, amounts, dates, payee names, and any other content. If it shows payments (M-Pesa, bank transfer, receipt, invoice, statement), list each as: payee, amount, currency (KES or USD), what it was for, and date if shown. Be precise with numbers, never guess an amount.";

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      messages: [{ role: "user", content: [block, { type: "text", text: prompt }] }],
    }),
    cache: "no-store",
  });

  if (!r.ok) {
    const errBody = await r.text().catch(() => "");
    throw new Error(`Claude ${r.status}: ${errBody.slice(0, 200)}`);
  }

  const j = await r.json();
  return j?.content?.[0]?.text ?? "";
}

// ───────────── helpers ─────────────
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function downloadFromStorage(storagePath) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/assets/${storagePath}`, { headers: SH });
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  return { base64: buf.toString("base64"), mime: r.headers.get("content-type") || "application/octet-stream" };
}

// ───────────── main ─────────────
async function main() {
  console.log(`orphan repair | ${APPLY ? "LIVE (--apply)" : "DRY-RUN"} | limit=${LIMIT}\n`);

  // 1. Find orphaned WhatsApp docs
  const docs = await sbGet(`documents?select=id,title,doc_type,drive_file_id,extracted_text,mime&source=eq.whatsapp&or=(extracted_text.is.null,extracted_text.eq.)&order=created_at.desc`);
  if (!Array.isArray(docs)) { console.error("query failed", docs); process.exit(2); }
  console.log(`orphaned docs found: ${docs.length}`);

  const results = { success: 0, skipped: 0, failed: 0, errors: [] };
  const batch = docs.slice(0, LIMIT);

  for (const doc of batch) {
    const title = doc.title || "untitled";
    const storagePath = (doc.drive_file_id || "").startsWith("ingest:") ? doc.drive_file_id.slice(7) : null;

    if (!storagePath) {
      console.log(`  SKIP  ${doc.id.slice(0, 12)} | ${title.slice(0, 50)} | no storage path`);
      results.skipped++;
      continue;
    }

    // 2. Download file bytes
    const file = await downloadFromStorage(storagePath);
    if (!file) {
      console.log(`  FAIL  ${doc.id.slice(0, 12)} | ${title.slice(0, 50)} | download failed`);
      results.failed++;
      results.errors.push({ id: doc.id, title, reason: "download_failed" });
      continue;
    }

    // 3. Extract text via Claude API
    const isReadable = file.mime.startsWith("image/") || file.mime === "application/pdf";
    if (!isReadable) {
      console.log(`  SKIP  ${doc.id.slice(0, 12)} | ${title.slice(0, 50)} | unsupported mime: ${file.mime}`);
      results.skipped++;
      continue;
    }

    try {
      const extracted = await readMediaViaClaude(file.base64, file.mime);

      if (!extracted || extracted.length < 10) {
        console.log(`  EMPTY ${doc.id.slice(0, 12)} | ${title.slice(0, 50)} | extraction returned empty`);
        results.skipped++;
        continue;
      }

      if (APPLY) {
        const body = JSON.stringify({ extracted_text: extracted });
        const r = await fetch(`${SUPABASE_URL}/rest/v1/documents?id=eq.${doc.id}`, {
          method: "PATCH", headers: { ...SH, "Content-Type": "application/json" }, body,
        });
        if (!r.ok) {
          console.log(`  FAIL  ${doc.id.slice(0, 12)} | ${title.slice(0, 50)} | update returned ${r.status}`);
          results.failed++;
          results.errors.push({ id: doc.id, title, reason: `update_${r.status}` });
          continue;
        }
      }

      console.log(`  OK    ${doc.id.slice(0, 12)} | ${title.slice(0, 50)} | ${extracted.length} chars extracted`);
      results.success++;
    } catch (e) {
      console.log(`  FAIL  ${doc.id.slice(0, 12)} | ${title.slice(0, 50)} | ${String(e.message || e).slice(0, 80)}`);
      results.failed++;
      results.errors.push({ id: doc.id, title, reason: e.message });
    }

    await sleep(500);
  }

  console.log(`\n=== results ===`);
  console.log(`  success: ${results.success}`);
  console.log(`  skipped: ${results.skipped}`);
  console.log(`  failed:  ${results.failed}`);
  if (results.errors.length) {
    console.log(`\nerrors:`);
    for (const e of results.errors) console.log(`  ${e.id.slice(0, 12)} | ${String(e.title).slice(0, 40)} | ${e.reason}`);
  }
  console.log(`\n${APPLY ? "LIVE run complete." : "DRY-RUN complete. Pass --apply to write changes."}`);
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(2); });
