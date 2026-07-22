// Maisha inventory capture wall (2026-07-22, FADHILI incident). Nur sent a kimono photo-burst
// with a caption; the whole caption landed in the title, only one photo attached, and no fields
// were parsed. Root causes: (1) classify_and_enrich resolved the draft by name.ilike AFTER
// stripping commas/quotes, so a name holding "L, XL, XXL" never matched itself and enrichment
// silently failed; (2) the draft name was the whole caption; (3) a burst of photos became N
// one-photo drafts. This wall pins the fixed capture.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseProductCaption, MAISHA_ITEM_TEMPLATE } from "../../lib/inventory-parse.ts";
const HERE = dirname(fileURLToPath(import.meta.url));
let failed = 0;
const ok = (m) => console.log("PASS:", m);
const fail = (m) => { failed++; console.log("FAIL:", m); };
const st = readFileSync(resolve(HERE, "../../lib/smart-tools.ts"), "utf8");
const ing = readFileSync(resolve(HERE, "../../lib/maisha-ingest.ts"), "utf8");
const ui = readFileSync(resolve(HERE, "../../app/inventory/[id]/page.tsx"), "utf8");

// I1 (behavioral): the parser splits a caption into a CLEAN name + size + measurements.
{
  const r = parseProductCaption('FADHILI Kimono Can fit size L, XL, XXL Shoulder 20" Chest 50" Sleeve 12/9.5" Length 40"');
  if (r.name === "FADHILI Kimono" && r.sizeRange === "L/XL/XXL" && /Shoulder 20/.test(r.measurements || "") && /Sleeve 12\/9\.5/.test(r.measurements || ""))
    ok("I1 parseProductCaption -> clean name, full size range, measurements");
  else fail(`I1 parser wrong: ${JSON.stringify(r)}`);
}
// I2: classify_and_enrich targets the draft by explicit id (no fragile self-matching ilike),
// cleans the name, and stores measurements in the links jsonb.
if (/const explicitId = String\(input\.inventory_id/.test(st)
    && /\.eq\("id", explicitId\)/.test(st)
    && /name: \(parsed\.name && parsed\.name\.length >= 2 \? parsed\.name : target\.name\)/.test(st)
    && /linksPatch\.measurements = parsed\.measurements/.test(st))
  ok("I2 classify_and_enrich targets by id, cleans the name, stores measurements in links");
else fail("I2 classify_and_enrich must target by inventory_id + clean name + store measurements");
// I3: the draft is created with a CLEAN product name, not the whole caption.
if (/parseProductCaption\(t\)\.name/.test(ing) && /draftNameFrom/.test(ing))
  ok("I3 draftNameFrom uses the clean product name, not the whole caption");
else fail("I3 draftNameFrom must use parseProductCaption().name");
// I4: enrichment is driven by the draft's id, so a comma'd name always matches.
if (/runSmartTool\("classify_and_enrich", \{ inventory_id: inventoryId/.test(ing))
  ok("I4 runEnrich passes inventory_id (enrichment can't miss its own draft)");
else fail("I4 runEnrich must pass inventory_id to classify_and_enrich");
// I5: SAFE photo-merge (hardened after the adversarial review) — a bare photo attaches ONLY to a
// CAPTIONED anchor (never a bare "Maisha photo" placeholder, so two different products can't chain),
// writes a wamid-keyed 'merged' pending row for idempotency, and NEVER deletes a draft.
if (/if \(hasPhoto && !hasCaption && assetId && opts\.senderPhone\)/.test(ing)
    && /\/\^Maisha photo\/i\.test\(String\(a\.name \|\| ""\)\)\) continue; \/\/ require a CAPTIONED anchor/.test(ing)
    && /status: "merged"/.test(ing)
    && !/from\("inventory"\)\.delete\(\)/.test(ing))
  ok("I5 photo-merge: captioned-anchor-only, idempotent (merged row), never deletes a draft");
else fail("I5 photo-merge must anchor to a captioned draft, write a merged row, and never delete");
// I5b: a redelivered bare-merged photo is idempotent (top-level pending_enrichment check).
if (/message_external_id", wamid\)\.limit\(1\);\n\s*if \(mergedPe\?\.\[0\]\?\.inventory_id\)/.test(ing))
  ok("I5b a redelivered merged photo returns the anchor (no duplicate draft)");
else fail("I5b the top idempotency check must catch a redelivered merged photo");
// I6: the detail page shows the parsed measurements.
if (/it\.links\?\.measurements && <Row icon=\{Ruler\} label="Measurements">/.test(ui))
  ok("I6 the inventory detail page renders the measurements");
else fail("I6 the detail page must show links.measurements");
// I7 (behavioral): the STANDARD template parses cleanly — name, size, measurements, cost, price.
{
  const r = parseProductCaption(MAISHA_ITEM_TEMPLATE.replace(/Name:\s*/, "Name: FADHILI Kimono ").replace(/Sizes:\s*/, "Sizes: L, XL, XXL ").replace(/Shoulder:\s*/, "Shoulder: 20 ").replace(/Chest:\s*/, "Chest: 50 ").replace(/Cost:\s*/, "Cost: 3500 KES ").replace(/Price:\s*/, "Price: 60 USD "));
  if (r.name === "FADHILI Kimono" && r.sizeRange === "L/XL/XXL" && /Shoulder 20/.test(r.measurements || "") && r.unitCost === 3500 && r.costCurrency === "KES" && r.unitPrice === 60 && r.priceCurrency === "USD")
    ok("I7 the standard template parses to name/size/measurements/cost/price");
  else fail(`I7 template parse wrong: ${JSON.stringify(r)}`);
}
// I8: the template exists (labeled fields), carries NO em-dash (doctrine), and is reachable via
// the inventory_format tool (registered) so Nur/Michell can ask for it.
if (/Name:\n?Sizes:/.test(MAISHA_ITEM_TEMPLATE.replace(/\n+/g, "\n")) && !/—/.test(MAISHA_ITEM_TEMPLATE)
    && /name === "inventory_format"/.test(st) && /"inventory_format"/.test(readFileSync(resolve(HERE, "../../lib/agents/manifests/index.ts"), "utf8")))
  ok("I8 the labeled template exists (no em-dash) and inventory_format is a registered tool");
else fail("I8 the template + inventory_format tool must exist, be em-dash-free, and be registered");
// I9 (Currency law): a cost/price with NO currency must NOT become a money figure.
{
  const r = parseProductCaption("Name: X Cost: 3500 Price: 60");
  if (r.unitCost === null && r.unitPrice === null) ok("I9 a bare cost/price (no currency) is never stored as money");
  else fail(`I9 money without a currency must be dropped, got ${JSON.stringify(r)}`);
}
// I10 (review fix): a DETAILS-ONLY caption (no leading product name) yields an EMPTY name, so the
// caller keeps its placeholder/existing name instead of dumping the whole caption into the title.
{
  const r = parseProductCaption("Chest 50, Waist 30, black abaya");
  if (r.name === "") ok("I10 details-only caption -> empty name (never the whole-caption dump)");
  else fail(`I10 details-only must yield an empty name, got ${JSON.stringify(r.name)}`);
}
// I11 (review fix): sizeRange is anchored to a size context, so noise letters (a maker's "S.",
// "M-Pesa") are never folded in as a size.
{
  const r = parseProductCaption("Josephine S. made this kimono, size L");
  if (r.sizeRange === "L") ok("I11 sizeRange anchored to a size context (noise letters ignored)");
  else fail(`I11 sizeRange must ignore noise letters, got ${r.sizeRange}`);
}

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
