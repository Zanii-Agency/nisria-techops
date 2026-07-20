// Maisha inventory text-draft gate wall (2026-07-01 junk-draft incident). A FINANCE/
// greeting group message ("Good morning everyone, 3300 was deposited ... from a tote
// BAG order") drafted a junk inventory item because a lone product noun ("bag") tripped
// describesNewProduct. Fix: reject finance/greeting/sale/order language, and for a
// text-only draft require a product noun PLUS an inventory-ADD action (or a tracking
// code) — a bare noun in chat is not new stock. This wall pins both directions.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);

// mirror of lib/maisha-ingest.ts describesNewProduct (keep in step)
const NOT_PRODUCT_RE = /\b(good\s*(?:morning|afternoon|evening|day)|deposit(?:ed)?|payment|paid|invoice|receipt|sold|\bsale\b|\border\s+(?:for|from)\b|customer|balance|owe[sd]?|thank(?:s|\s+you)|\bksh?\b|\bkes\b|\busd\b)\b/i;
const INVENTORY_ACTION_RE = /\b(new|add(?:ed|ing)?|finish(?:ed)?|complet(?:e|ed)|ready|received|made|produced|restock(?:ed)?|in\s+stock|log(?:ged)?\s+(?:to\s+)?(?:inventory|stock)|tracking|trk[-\s]?\d)\b/i;
const PRODUCT_NOUN_RE = /\b(abaya|dress(?:es)?|kaftan|caftan|gown|bag|tote|scarf|shawl|kimono|jacket|kikoy|ankara|fabric|textile|silk|cotton|linen|garment|piece|product|item|stock|collection)\b/i;
const TRACKING_RE = /\b(?:trk[-\s]?\d|tracking\s*(?:no|number|#)?\s*[:#]?\s*\w)/i;
const describesNewProduct = (text) => {
  const t = (text || "").trim();
  if (t.length < 4) return false;
  if (NOT_PRODUCT_RE.test(t)) return false;
  if (TRACKING_RE.test(t)) return true;
  return PRODUCT_NOUN_RE.test(t) && INVENTORY_ACTION_RE.test(t);
};

// ---- I1: finance/greeting/sale chatter must NOT draft (the incident class) ----
{
  for (const t of [
    "Good morning everyone, 3300 was deposited to Nisria account from a tote bag order",
    "thanks for the payment",
    "balance is 5000 KES",
    "sold 3 bags today",
    "order from Jane for a scarf",
    "nice bag!",
    "hello team",
    "the meeting is at 3",
  ]) if (describesNewProduct(t)) fail(`I1 "${t.slice(0, 40)}" must NOT draft an inventory item`);
  ok("I1 finance / greeting / sale / bare-noun chatter does not draft");
}

// ---- I2: real new-stock notes STILL draft ----
{
  for (const t of [
    "New abaya finished, TRK-102, black silk",
    "received new silk fabric for the collection",
    "finished 3 kaftans, adding to stock",
    "made a new tote bag, ready for inventory",
    "TRK-88 dress completed",
  ]) if (!describesNewProduct(t)) fail(`I2 "${t.slice(0, 40)}" is real new stock and MUST draft`);
  ok("I2 genuine new-stock notes (noun + add-action, or tracking) still draft");
}

// ---- I3: the source gate is the deployed one (anti-drift) ----
{
  const SRC = readFileSync(resolve(HERE, "../../lib/maisha-ingest.ts"), "utf8");
  if (!/const NOT_PRODUCT_RE =/.test(SRC)) fail("I3 maisha-ingest must have the NOT_PRODUCT_RE finance/greeting reject gate");
  else if (!/PRODUCT_NOUN_RE\.test\(t\) && INVENTORY_ACTION_RE\.test\(t\)/.test(SRC)) fail("I3 text-only draft must require noun + inventory action");
  else ok("I3 deployed gate rejects finance/greeting + requires noun+action");
}

if (process.exitCode) console.error("\nsasa-maisha-ingest-gate-wall: FAIL");
else console.log("\nsasa-maisha-ingest-gate-wall: ALL GREEN");
