// MAISHA CAPTURE EVAL — every labelled field the operator sends must be captured.
//
// The 2026-07-23 incident: an operator sent the full product template (Weight,
// Time to make, Artisan, Price in dollars, Storage, Fabrics, Collection, Product
// Category, Product ID) and the app captured only a handful. Root cause: the
// parser's vocabulary did not include the operator's labels, and unknown labels
// had nowhere to land. This test locks the fix: known labels map to columns,
// everything else rides the `links` attributes bag, and nothing is dropped.
//
// Run with:  node eval/integration/maisha-caption-fields.test.mjs
// Exit code is 0 only if all checks pass.

import { parseProductCaption } from "../../lib/inventory-parse.ts";

// The real caption shape (values from the 2026-07-23 ASILI Kimono, ASL-025-KMN).
const CAPTION = [
  "Name: Asili Kimono",
  "Sizes: L/XL/XXL",
  "Shoulder: 20\"",
  "Chest: 50\"",
  "Sleeve: 12/9.5\"",
  "Weight - 0.9kg",
  "Time to make - 8 Hours",
  "Artisan: Elizabeth, Monica, Marion, Lucy",
  "Price in dollars - $200",
  "Storage - Dubai",
  "Fabrics: Curtains & Cuttoffs",
  "Collection: ASILI",
  "Product Category: Kimono",
  "Product ID: ASL-025-KMN",
].join("\n");

const p = parseProductCaption(CAPTION);

const fails = [];
const eq = (name, got, want) => { if (got !== want) fails.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); };
const has = (name, got, sub) => { if (!String(got || "").includes(sub)) fails.push(`${name}: got ${JSON.stringify(got)}, want it to contain ${JSON.stringify(sub)}`); };

// --- fields that already worked (regression guard) ---
has("name", p.name, "Asili Kimono");
eq("sizeRange", p.sizeRange, "L/XL/XXL");
has("measurements(shoulder)", p.measurements, "Shoulder 20");
has("measurements(chest)", p.measurements, "Chest 50");

// --- fields that were DROPPED before the fix ---
eq("trackingNo (Product ID)", p.trackingNo, "ASL-025-KMN");
eq("category (Product Category)", p.category, "Kimono");
eq("collection", p.collection, "ASILI");
eq("location (Storage)", p.location, "Dubai");
has("maker (Artisan)", p.maker, "Elizabeth");
eq("unitPrice ($200)", p.unitPrice, 200);
eq("priceCurrency (in dollars/$)", p.priceCurrency, "USD");

// --- the long tail: unknown labels ride the attributes bag, nothing dropped ---
const attrs = p.attributes || {};
eq("attributes.Weight", attrs["Weight"], "0.9kg");
eq("attributes['Time to make']", attrs["Time to make"], "8 Hours");
eq("attributes.Fabrics", attrs["Fabrics"], "Curtains & Cuttoffs");

// known-mapped labels must NOT double up in the attributes bag
for (const k of ["Product ID", "Product Category", "Collection", "Storage", "Artisan", "Price in dollars", "Name", "Sizes"]) {
  if (k in attrs) fails.push(`attributes should not contain mapped label ${JSON.stringify(k)} (it belongs in a column)`);
}

// --- REGRESSION: the free-form caption (the FADHILI incident) must still parse and must NOT
// hallucinate labelled fields out of prose. ---
const ff = parseProductCaption("FADHILI Kimono can fit L/XL/XXL, shoulder 20 chest 50");
has("freeform name", ff.name, "FADHILI Kimono");
eq("freeform size", ff.sizeRange, "L/XL/XXL");
has("freeform measurements", ff.measurements, "Shoulder 20");
eq("freeform trackingNo stays null", ff.trackingNo, null);
if (Object.keys(ff.attributes || {}).length !== 0) fails.push(`freeform must not invent attributes, got ${JSON.stringify(ff.attributes)}`);

// --- REGRESSION: a bare number with no currency never becomes money (Currency law). ---
const noCcy = parseProductCaption("Name: Test\nPrice - 200");
eq("no-currency price stays null", noCcy.unitPrice, null);

if (fails.length) {
  console.error("FAIL maisha-caption-fields:\n  " + fails.join("\n  "));
  process.exit(1);
}
console.log("PASS maisha-caption-fields: all checks green");
