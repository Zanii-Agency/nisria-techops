import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb, q, one, tick } from "../src/db.ts";
import { ingest } from "../src/ingest.ts";
import {
  persistPendingImage, enrichRecord, transitionState, recordSale, recordShipment,
  consumeMaterials, logExpense, collectionPnl, queryInventory, inventorySummary,
  lookupOrderByToken, raiseProcurementTask,
} from "../src/tools.ts";
import { verifyGuardRegistration, honestyRewrite, groundingFor, toolsForRole, INVENTORY_TOOLS } from "../src/guard.ts";
import { sumByCurrency, formatCurrencyMap, fxConvert } from "../src/money.ts";
import { evaluateTransition } from "../src/lifecycle.ts";

// helper: seed a pending photo via ingest
async function dropPhoto(db: any, ext: string, sender = "+254700", name = "Aisha", caption: string | null = null, group = "Maisha • Inventory") {
  return ingest(db, { externalId: ext, group, sender, senderName: name, role: "team", text: caption, image: { wamid: `w_${ext}`, mediaPath: `/m/${ext}.jpg` } }, { listenOnly: true });
}

// ---------------------------------------------------------------------------
test("guard: every write tool is registered (the live-bug meta-check)", () => {
  const r = verifyGuardRegistration();
  assert.equal(r.ok, true, "unregistered tools: " + r.problems.join("; "));
});

test("guard: honesty rewrite hedges unregistered/failed, allows registered+persisted", () => {
  // registered + persisted → claim stands
  assert.equal(honestyRewrite({ toolName: "upsert_end_product", toolOk: true, rowExists: true, claim: "Logged the abaya." }).rewritten, false);
  // tool failed → hedged
  assert.equal(honestyRewrite({ toolName: "upsert_end_product", toolOk: false, rowExists: false, claim: "Logged the abaya." }).rewritten, true);
  // unknown/unregistered tool name → hedged
  assert.equal(honestyRewrite({ toolName: "made_up_tool", toolOk: true, rowExists: true, claim: "Logged it." }).rewritten, true);
});

test("guard: team tier sees no finance figures; customer sees only the gated read", () => {
  const facts = [{ content: "Noor: 12 products", is_finance: false }, { content: "Noor margin AED 4,200", is_finance: true }];
  assert.deepEqual(groundingFor("team", facts), ["Noor: 12 products"]);
  assert.equal(groundingFor("admin", facts).length, 2);
  const all = INVENTORY_TOOLS.map((t) => t.name);
  assert.deepEqual(toolsForRole("customer", all), ["lookup_order_by_token"]);
  assert.equal(toolsForRole("team", all).includes("record_sale"), false, "team must not get finance tool record_sale");
});

// ---------------------------------------------------------------------------
test("trap 1: status column rejects a lifecycle word; lifecycle_state accepts it", async () => {
  const db = await freshDb();
  await assert.rejects(
    db.query(`INSERT INTO inventory (id,item_type,name,status) VALUES ('x','end_product','t','shipped')`),
    /violates check constraint|inventory_status_check/i,
    "writing a lifecycle word into status must be rejected (the live 0-row bite)"
  );
  await db.query(`INSERT INTO inventory (id,item_type,name,status,lifecycle_state) VALUES ('y','end_product','t','in_stock','shipped')`);
  const row = await one(db, `SELECT lifecycle_state FROM inventory WHERE id='y'`);
  assert.equal((row as any).lifecycle_state, "shipped");
});

test("trap 2: tasks accept source='inventory' (live is manual|ai only)", async () => {
  const db = await freshDb();
  await db.query(`INSERT INTO inventory (id,item_type,name) VALUES ('p','end_product','Noor abaya')`);
  const t = await raiseProcurementTask(db, { itemName: "silk thread", ref: "p" });
  assert.equal(t.ok, true);
  const row = await one(db, `SELECT source FROM tasks WHERE id=$1`, [t.detail!.task_id]);
  assert.equal((row as any).source, "inventory");
});

// ---------------------------------------------------------------------------
test("intake mode 1: quoted reply enriches the right pending photo", async () => {
  const db = await freshDb();
  await dropPhoto(db, "img1");
  tick(60_000);
  const r = await ingest(db, {
    externalId: "ctx1", group: "Maisha • Inventory", sender: "+254700", senderName: "Aisha",
    role: "team", text: "TRK-192 Noor abaya, style A-line, size M, made by Aisha", replyToExternalId: "img1",
  }, { listenOnly: true });
  assert.equal(r.captured, true);
  const inv = await one(db, `SELECT tracking_no, item_type, maker, enriched FROM inventory WHERE tracking_no='TRK-0192'`);
  assert.equal((inv as any).item_type, "end_product");
  assert.equal((inv as any).maker, "Aisha");
  assert.equal((inv as any).enriched, true);
});

test("intake mode 3: loose follow-up (no reply) binds to this sender's recent photo", async () => {
  const db = await freshDb();
  await dropPhoto(db, "img2", "+254711", "Mariam");
  tick(120_000);
  const r = await ingest(db, {
    externalId: "ctx2", group: "Maisha • Inventory", sender: "+254711", senderName: "Mariam",
    role: "team", text: "TRK-205 collection: Dusk, size L, made by Mariam", replyToExternalId: null,
  }, { listenOnly: true });
  assert.equal(r.captured, true);
  const inv = await one(db, `SELECT tracking_no, collection FROM inventory WHERE tracking_no='TRK-0205'`);
  assert.equal((inv as any).collection, "Dusk");
});

test("intake: two pending photos from same sender → ambiguous, asks once (no guess)", async () => {
  const db = await freshDb();
  await dropPhoto(db, "imgA", "+254722", "Zara");
  tick(10_000);
  await dropPhoto(db, "imgB", "+254722", "Zara");
  tick(10_000);
  const r = await ingest(db, {
    externalId: "ctxAmb", group: "Maisha • Inventory", sender: "+254722", senderName: "Zara",
    role: "team", text: "size M made by Zara", replyToExternalId: null,
  }, { listenOnly: true });
  assert.ok(r.needs, "should ask which photo");
  assert.match(r.needs!, /which one|pending/i);
});

test("intake mode 2: caption on the image enriches immediately", async () => {
  const db = await freshDb();
  const r = await dropPhoto(db, "imgCap", "+254733", "Hala", "TRK-300 Noor kaftan, size S, made by Hala");
  assert.equal(r.captured, true);
  const inv = await one(db, `SELECT tracking_no, item_type FROM inventory WHERE tracking_no='TRK-0300'`);
  assert.equal((inv as any).item_type, "end_product");
});

// ---------------------------------------------------------------------------
test("lifecycle: illegal jump refused, legal path allowed", async () => {
  assert.equal(evaluateTransition("in_stock", "delivered").ok, false);
  assert.equal(evaluateTransition("sold", "shipped").ok, true);
  assert.equal(evaluateTransition("in_stock", "moon").ok, false);
});

test("lifecycle: double-ship is idempotent (no duplicate event)", async () => {
  const db = await freshDb();
  await db.query(`INSERT INTO inventory (id,item_type,name,status,lifecycle_state) VALUES ('e','end_product','x','in_stock','sold')`);
  const a = await transitionState(db, { inventoryId: "e", to: "shipped" });
  const b = await transitionState(db, { inventoryId: "e", to: "shipped" });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(b.detail!.idempotent, true);
  const events = await q(db, `SELECT id FROM inventory_lifecycle_events WHERE inventory_id='e' AND to_state='shipped'`);
  assert.equal(events.length, 1, "double-ship must not create two events");
});

// ---------------------------------------------------------------------------
test("sale: records revenue, spawns ship-task to Nur, idempotent on re-run", async () => {
  const db = await freshDb();
  await db.query(`INSERT INTO inventory (id,item_type,name,tracking_no,collection,status,lifecycle_state) VALUES ('s1','end_product','Noor abaya','TRK-0500','Noor','in_stock','in_stock')`);
  const r1 = await recordSale(db, { inventoryId: "s1", channel: "folklore", customer: "Layla", price: 850, currency: "AED", channelFee: 85, by: "Nur" });
  assert.equal(r1.ok, true);
  const task = await one(db, `SELECT assignee, source, source_kind FROM tasks WHERE id=$1`, [r1.detail!.ship_task]);
  assert.equal((task as any).assignee, "Nur");
  assert.equal((task as any).source_kind, "ship");
  const r2 = await recordSale(db, { inventoryId: "s1", channel: "folklore", customer: "Layla", price: 850, currency: "AED", by: "Nur" });
  assert.equal(r2.detail!.deduped, true, "re-recording the same sale must be idempotent");
  const sales = await q(db, `SELECT id FROM inventory_sales WHERE inventory_id='s1'`);
  assert.equal(sales.length, 1);
});

test("currency: never blends; AED/USD/KES stay separate; cross only via stamped FX", async () => {
  const m = sumByCurrency([{ amount: 100, currency: "USD" }, { amount: 200, currency: "USD" }, { amount: 30000, currency: "KES" }, { amount: 850, currency: "AED" }]);
  assert.deepEqual(m, { USD: 300, KES: 30000, AED: 850 });
  assert.match(formatCurrencyMap(m), /\$300.*KES 30,000.*AED 850/);
  // fx requires a stamped rate+date
  assert.throws(() => fxConvert(30000, { from: "KES", to: "USD", rate: 0, date: "" } as any));
  const c = fxConvert(30000, { from: "KES", to: "USD", rate: 1 / 129, date: "2026-05" });
  assert.match(c.via, /FX .* @ 2026-05/);
});

test("collection P&L: per-currency revenue and COGS, no blend", async () => {
  const db = await freshDb();
  // textile material (cost in AED)
  await db.query(`INSERT INTO inventory (id,item_type,name,unit_cost,cost_currency,quantity) VALUES ('t1','textile','silk',120,'AED',10)`);
  await db.query(`INSERT INTO inventory (id,item_type,name,tracking_no,collection,status,lifecycle_state) VALUES ('e1','end_product','Noor abaya','TRK-0600','Noor','in_stock','in_stock')`);
  await consumeMaterials(db, { endProductId: "e1", materials: [{ materialId: "t1", qty: 2 }] });
  await recordSale(db, { inventoryId: "e1", channel: "online", customer: "Sara", price: 800, currency: "AED", channelFee: 0, by: "Nur" });
  const pnl = await collectionPnl(db, "Noor");
  assert.equal(pnl.detail!.revenue.AED, 800);
  assert.equal(pnl.detail!.cogs.AED, 240); // 2 * 120
});

// ---------------------------------------------------------------------------
test("silent mode: capture happens, reply withheld; chime-in flag flips speech only", async () => {
  const db = await freshDb();
  const silent = await dropPhoto(db, "imgS", "+254744", "Nadia", "TRK-700 Noor set, size M, made by Nadia");
  assert.equal(silent.captured, true);
  assert.equal(silent.spoken, false, "must NOT speak under listen-only");
  const inv = await one(db, `SELECT tracking_no FROM inventory WHERE tracking_no='TRK-0700'`);
  assert.ok(inv, "captured to DB even while silent");
  // same message under chime-in
  const db2 = await freshDb();
  const loud = await ingest(db2, { externalId: "imgL", group: "Maisha • Inventory", sender: "+254744", senderName: "Nadia", role: "team", text: "TRK-701 Noor set, size M, made by Nadia", image: { wamid: "w_L", mediaPath: "/m/l.jpg" } }, { listenOnly: false });
  assert.equal(loud.spoken, true);
  assert.match(loud.reply, /logged/i);
});

test("system messages are never treated as intake", async () => {
  const db = await freshDb();
  const r = await ingest(db, { externalId: "sys1", group: "Maisha • Inventory", sender: "+254755", senderName: "x", role: "team", text: "Your security code with Aisha changed" }, { listenOnly: true });
  assert.equal(r.captured, false);
  const n = await one(db, `SELECT count(*)::int n FROM inventory`);
  assert.equal((n as any).n, 0);
});

test("dedupe: re-ingesting the same wamid does not double-create", async () => {
  const db = await freshDb();
  await dropPhoto(db, "imgDup");
  await dropPhoto(db, "imgDup"); // same external id
  const n = await one(db, `SELECT count(*)::int n FROM inventory`);
  assert.equal((n as any).n, 1);
});

// ---------------------------------------------------------------------------
test("customer path: wrong token refused, valid token returns sanitized status only", async () => {
  const db = await freshDb();
  await db.query(`INSERT INTO inventory (id,item_type,name,tracking_no,status,lifecycle_state) VALUES ('c1','end_product','Noor abaya','TRK-0800','in_stock','in_transit')`);
  await db.query(`INSERT INTO inventory_sales (id,inventory_id,tracking_no,channel,customer,customer_token,price,currency) VALUES ('cs1','c1','TRK-0800','online','Mona','TOK-ABCDEF',900,'AED')`);
  assert.equal((await lookupOrderByToken(db, "WRONGTOKEN")).ok, false);
  assert.equal((await lookupOrderByToken(db, "")).ok, false);
  const good = await lookupOrderByToken(db, "TOK-ABCDEF");
  assert.equal(good.ok, true);
  assert.equal(good.detail!.status, "On its way");
  // sanitized: no price/maker/cost leaked
  assert.equal("price" in (good.detail || {}), false);
});

test("expense: tagged maisha_inventory, idempotent on batch_tag, appears as money-out", async () => {
  const db = await freshDb();
  const a = await logExpense(db, { payee: "Thread Co", amount: 320, currency: "AED", category: "procurement", by: "Nur" });
  const b = await logExpense(db, { payee: "Thread Co", amount: 320, currency: "AED", category: "procurement", by: "Nur" });
  assert.equal(a.ok, true);
  assert.equal(b.detail!.deduped, true);
  const rows = await q(db, `SELECT source FROM payments WHERE source='maisha_inventory'`);
  assert.equal(rows.length, 1);
});

test("summary: answerable counts for Sasa grounding", async () => {
  const db = await freshDb();
  await dropPhoto(db, "p1", "+1", "A", "TRK-900 Noor abaya, size M, made by A");
  await dropPhoto(db, "p2", "+1", "A", "TRK-901 Noor kaftan, size L, made by A");
  const s = await inventorySummary(db);
  assert.equal(s.byType.end_product, 2);
});
