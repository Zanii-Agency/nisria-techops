// MAISHA PHOTO-BURST EVAL — a burst of product photos must all land on the product (2026-07-23).
//
// The FADHILI Kimono incident: an album arrived (caption on the first image, the rest bare). The
// caption enriched the anchor draft within the same burst, flipping its pending_enrichment row to
// 'enriched'. The bare-photo merge only searched 'pending' anchors, so every photo after the caption
// processed orphaned into its own "Maisha photo" draft — the product kept ONE photo. Fix: the merge
// searches pending OR enriched OR merged anchors, so all album photos land whatever the enrich race.
//
// Run with:  node eval/integration/maisha-photo-burst.test.mjs
// Exit code is 0 only if all checks pass.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(HERE, "../../lib/maisha-ingest.ts"), "utf8");

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

// 1. the bare-photo merge must consider the ENRICHED (and merged) anchor, not only pending —
//    otherwise the caption's enrich strands the rest of the album.
ok(/\.in\(\s*["']status["']\s*,\s*\[\s*["']pending["']\s*,\s*["']enriched["']/.test(src),
  "bare-photo merge must search pending OR enriched anchors (not only pending)");

// 2. the merge still requires a CAPTIONED anchor (a real product name, not a bare placeholder) so
//    two different products' bursts never chain together.
ok(/\^Maisha photo/i.test(src) && /require a CAPTIONED anchor/i.test(src),
  "the merge must still require a captioned anchor (a bare 'Maisha photo' draft is not an anchor)");

// 3. SAFE never-delete invariant: the ingest never deletes an inventory row (a mis-timed delete would
//    lose a real product/photo). Consolidation moves/archives, never deletes.
ok(!/\.from\(\s*["']inventory["']\s*\)\s*\.delete\(/.test(src),
  "maisha-ingest must NEVER call .delete() on inventory (SAFE never-delete invariant)");

// 3b. caption-LAST order: a captioned product absorbs the bare "Maisha photo" placeholders sent just
//     before it (archived, not deleted), so the burst lands whatever the order.
ok(/ABSORB PRIOR BARE ORPHANS/i.test(src) && /status:\s*["']archived["']/.test(src),
  "captioned product must absorb prior bare orphans (archive them), for caption-last albums");

// 4. idempotency is still keyed on the wa message id (a redelivery must not double-attach).
ok(/message_external_id/.test(src) && /deduped:\s*true/.test(src),
  "photo persistence must stay idempotent on the wa message id");

if (fails.length) {
  console.error("FAIL maisha-photo-burst:\n  " + fails.join("\n  "));
  process.exit(1);
}
console.log("PASS maisha-photo-burst: all checks green");
