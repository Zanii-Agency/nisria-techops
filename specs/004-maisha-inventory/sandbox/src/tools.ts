// The Maisha Inventory smart-tools, against PGlite. Each returns the platform
// tool shape { ok, summary, detail } so porting into runAction is mechanical.
// Money math NEVER blends currency. Tasks use source:'inventory'. Lifecycle is
// guarded + idempotent. Cost outflows tag payments.source='maisha_inventory'.

import { DB, id, now, q, one } from "./db.ts";
import { evaluateTransition, LifecycleState } from "./lifecycle.ts";
import { classifyItem, parseFields, ParsedFields, ItemType } from "./classify.ts";
import { Currency, sumByCurrency, formatCurrencyMap, money, CurrencyMap } from "./money.ts";

export type ToolResult = {
  ok: boolean;
  summary: string;
  detail?: Record<string, any>;
  refused?: boolean;
  needs?: string; // an "ask once" prompt when ambiguous
};

// --- assets / media (storeMedia equivalent — idempotent on source_ref=wamid) ---
export async function storeMedia(db: DB, opts: { wamid: string; path: string; mime?: string; createdBy?: string }): Promise<string> {
  const existing = await one<{ id: string }>(db, `SELECT id FROM assets WHERE source_ref = $1`, [opts.wamid]);
  if (existing) return existing.id; // idempotent re-ingest
  const aid = id("asset");
  await db.query(
    `INSERT INTO assets (id, type, storage_path, mime, source, source_ref, created_by, created_at)
     VALUES ($1,'proof',$2,$3,'whatsapp',$4,$5,$6)`,
    [aid, opts.path, opts.mime ?? "image/jpeg", opts.wamid, opts.createdBy ?? null, now()]
  );
  return aid;
}

// --- persist_pending_image: an image lands with no/thin context. Store it,
// create a pending un-enriched inventory row, queue enrichment. Runs on INGEST
// (i.e. under listen-only too). ---
export async function persistPendingImage(db: DB, msg: {
  externalId: string; wamid: string; group: string; sender: string; senderName?: string; role?: string;
  mediaPath: string; mime?: string; caption?: string | null;
}): Promise<ToolResult> {
  const assetId = await storeMedia(db, { wamid: msg.wamid, path: msg.mediaPath, mime: msg.mime, createdBy: msg.senderName });
  // dedupe: same wamid already ingested?
  const dupe = await one(db, `SELECT id FROM messages WHERE external_id = $1`, [msg.externalId]);
  if (dupe) return { ok: true, summary: "already captured (dedupe)", detail: { deduped: true } };

  await db.query(
    `INSERT INTO messages (id, external_id, asset_id, group_name, sender_phone, sender_name, sender_role, body, has_image, media_path, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,$9,$10)`,
    [id("msg"), msg.externalId, assetId, msg.group, msg.sender, msg.senderName ?? null, msg.role ?? "team", msg.caption ?? null, msg.mediaPath, now()]
  );

  const invId = id("inv");
  await db.query(
    `INSERT INTO inventory (id, item_type, name, status, lifecycle_state, asset_ids, enriched, created_by, source_message_external_id, created_at, updated_at)
     VALUES ($1,'end_product',$2,'draft',NULL,ARRAY[$3],FALSE,$4,$5,$6,$6)`,
    [invId, msg.caption?.slice(0, 60) || "(pending photo)", assetId, msg.senderName ?? null, msg.externalId, now()]
  );
  await db.query(
    `INSERT INTO pending_enrichment (id, message_external_id, inventory_id, asset_id, sender_phone, sender_name, group_name, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8)`,
    [id("pend"), msg.externalId, invId, assetId, msg.sender, msg.senderName ?? null, msg.group, now()]
  );
  // If the caption already carries context, enrich immediately.
  if (msg.caption && parseFields(msg.caption).trackingNo) {
    return enrichRecord(db, { inventoryId: invId, text: msg.caption, sourceExternalId: msg.externalId, by: msg.senderName });
  }
  return { ok: true, summary: "logged pending photo, awaiting details", detail: { inventory_id: invId, asset_id: assetId, pending: true } };
}

// --- classify + enrich a pending record from free-text context ---
export async function enrichRecord(db: DB, opts: {
  inventoryId: string; text: string; sourceExternalId?: string; by?: string;
}): Promise<ToolResult> {
  const row = await one<any>(db, `SELECT * FROM inventory WHERE id = $1`, [opts.inventoryId]);
  if (!row) return { ok: false, refused: true, summary: `no pending record ${opts.inventoryId}` };

  const fields = parseFields(opts.text);
  const cls = classifyItem({ text: opts.text, hasImage: true, trackingNo: fields.trackingNo, maker: fields.maker });
  if (!cls.itemType || cls.confidence < 0.55) {
    return { ok: false, needs: `Couldn't tell the type of this item (${cls.reason}). Is it a supply, textile, or finished product?`, summary: "ambiguous — asked once" };
  }

  const itemType = cls.itemType;
  const lifecycle = itemType === "end_product" ? "in_stock" : null;
  await db.query(
    `UPDATE inventory SET item_type=$1, name=COALESCE($2,name), tracking_no=COALESCE($3,tracking_no),
       collection=COALESCE($4,collection), style=COALESCE($5,style), size=COALESCE($6,size),
       maker=COALESCE($7,maker), status='in_stock', lifecycle_state=$8, enriched=TRUE, updated_at=$9
     WHERE id=$10`,
    [itemType, fields.name ?? null, fields.trackingNo ?? null, fields.collection ?? null, fields.style ?? null,
     fields.size ?? null, fields.maker ?? null, lifecycle, now(), opts.inventoryId]
  );
  if (fields.price) {
    await db.query(`UPDATE inventory SET unit_price=$1, price_currency=$2 WHERE id=$3`, [fields.price.amount, fields.price.currency, opts.inventoryId]);
  }
  await db.query(`UPDATE pending_enrichment SET status='enriched' WHERE inventory_id=$1`, [opts.inventoryId]);

  // state change in the same message ("sold")?
  if (fields.stateChange) {
    await transitionState(db, { inventoryId: opts.inventoryId, to: fields.stateChange, by: opts.by, evidence: opts.text });
  }
  const enriched = await one<any>(db, `SELECT * FROM inventory WHERE id=$1`, [opts.inventoryId]);
  return {
    ok: true,
    summary: `enriched ${itemType} ${enriched.tracking_no ?? enriched.name}`,
    detail: { inventory_id: opts.inventoryId, item_type: itemType, tracking_no: enriched.tracking_no, fields },
  };
}

// --- guarded, idempotent lifecycle transition ---
export async function transitionState(db: DB, opts: {
  inventoryId: string; to: string; by?: string; evidence?: string; sourceExternalId?: string;
}): Promise<ToolResult> {
  const row = await one<any>(db, `SELECT id, lifecycle_state, tracking_no FROM inventory WHERE id=$1`, [opts.inventoryId]);
  if (!row) return { ok: false, refused: true, summary: `no record ${opts.inventoryId}` };
  const from = (row.lifecycle_state ?? null) as LifecycleState | null;
  const verdict = evaluateTransition(from, opts.to);
  if (!verdict.ok) {
    return { ok: false, refused: true, summary: `refused: ${verdict.reason}`, detail: { from, to: opts.to } };
  }
  if (verdict.idempotent) {
    return { ok: true, summary: `already ${opts.to} (no-op)`, detail: { idempotent: true, inventory_id: opts.inventoryId, state: opts.to } };
  }
  await db.query(`UPDATE inventory SET lifecycle_state=$1, updated_at=$2 WHERE id=$3`, [verdict.to, now(), opts.inventoryId]);
  await db.query(
    `INSERT INTO inventory_lifecycle_events (id, inventory_id, from_state, to_state, evidence, source_message_external_id, created_by, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id("evt"), opts.inventoryId, from, verdict.to, opts.evidence ?? null, opts.sourceExternalId ?? null, opts.by ?? null, now()]
  );
  return { ok: true, summary: `moved ${row.tracking_no ?? opts.inventoryId} ${from ?? "∅"} → ${verdict.to}`, detail: { inventory_id: opts.inventoryId, from, to: verdict.to } };
}

// --- consume materials (link + stock decrement) for COGS ---
export async function consumeMaterials(db: DB, opts: {
  endProductId: string; materials: { materialId: string; qty: number }[];
}): Promise<ToolResult> {
  for (const m of opts.materials) {
    const mat = await one<any>(db, `SELECT unit_cost, cost_currency, quantity FROM inventory WHERE id=$1`, [m.materialId]);
    if (!mat) return { ok: false, refused: true, summary: `unknown material ${m.materialId}` };
    await db.query(
      `INSERT INTO inventory_materials (id, end_product_id, material_id, qty, unit_cost, currency, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id("mat"), opts.endProductId, m.materialId, m.qty, mat.unit_cost, mat.cost_currency, now()]
    );
    await db.query(`UPDATE inventory SET quantity = quantity - $1, updated_at=$2 WHERE id=$3`, [m.qty, now(), m.materialId]);
  }
  return { ok: true, summary: `consumed ${opts.materials.length} material(s)`, detail: { end_product_id: opts.endProductId, count: opts.materials.length } };
}

// --- record_sale: revenue (own table) + auto ship-task to Nur. Idempotent on batch_tag. ---
export async function recordSale(db: DB, opts: {
  inventoryId: string; channel: string; customer: string; price: number; currency: Currency;
  channelFee?: number; by?: string; customerToken?: string;
}): Promise<ToolResult> {
  const inv = await one<any>(db, `SELECT id, tracking_no, lifecycle_state FROM inventory WHERE id=$1`, [opts.inventoryId]);
  if (!inv) return { ok: false, refused: true, summary: `no product ${opts.inventoryId}` };
  const batch = `inv:${inv.tracking_no ?? opts.inventoryId}:sale`;
  const dupe = await one(db, `SELECT id FROM inventory_sales WHERE batch_tag=$1`, [batch]);
  if (dupe) return { ok: true, summary: "sale already recorded (idempotent)", detail: { deduped: true, batch_tag: batch } };

  const saleId = id("sale");
  await db.query(
    `INSERT INTO inventory_sales (id, inventory_id, tracking_no, channel, customer, customer_token, price, currency, channel_fee, payment_status, batch_tag, created_by, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'sold',$10,$11,$12)`,
    [saleId, opts.inventoryId, inv.tracking_no, opts.channel, opts.customer, opts.customerToken ?? null, opts.price, opts.currency, opts.channelFee ?? 0, batch, opts.by ?? null, now()]
  );
  // lifecycle → reserved/sold (guarded)
  await transitionState(db, { inventoryId: opts.inventoryId, to: "sold", by: opts.by, evidence: `sold via ${opts.channel}` });
  // spawn ship task to Nur (source:'inventory')
  const task = await assignShipTask(db, { inventoryId: opts.inventoryId, customer: opts.customer, channel: opts.channel });
  return {
    ok: true,
    summary: `recorded sale of ${inv.tracking_no ?? opts.inventoryId} for ${money(opts.price, opts.currency)} via ${opts.channel}`,
    detail: { sale_id: saleId, batch_tag: batch, ship_task: task.detail?.task_id },
  };
}

export async function recordShipment(db: DB, opts: {
  inventoryId: string; courier: string; trackingUrl?: string; destination?: string; by?: string;
}): Promise<ToolResult> {
  const inv = await one<any>(db, `SELECT id, tracking_no, links FROM inventory WHERE id=$1`, [opts.inventoryId]);
  if (!inv) return { ok: false, refused: true, summary: `no product ${opts.inventoryId}` };
  const links = { ...(inv.links || {}), courier_url: opts.trackingUrl ?? null };
  await db.query(`UPDATE inventory SET links=$1, updated_at=$2 WHERE id=$3`, [JSON.stringify(links), now(), opts.inventoryId]);
  const t = await transitionState(db, { inventoryId: opts.inventoryId, to: "shipped", by: opts.by, evidence: `shipped via ${opts.courier}` });
  if (!t.ok) return t;
  return { ok: true, summary: `shipped ${inv.tracking_no ?? opts.inventoryId} via ${opts.courier}`, detail: { inventory_id: opts.inventoryId, courier: opts.courier } };
}

// --- tasks (source:'inventory') ---
async function createTask(db: DB, t: { title: string; assignee?: string; kind: string; ref?: string; priority?: string }): Promise<ToolResult> {
  const tid = id("task");
  await db.query(
    `INSERT INTO tasks (id, title, assignee, status, priority, source, source_kind, ref_inventory_id, created_by, created_at)
     VALUES ($1,$2,$3,'todo',$4,'inventory',$5,$6,'sasa',$7)`,
    [tid, t.title, t.assignee ?? null, t.priority ?? "medium", t.kind, t.ref ?? null, now()]
  );
  return { ok: true, summary: `created task: ${t.title}`, detail: { task_id: tid, kind: t.kind } };
}
export async function assignMakeTask(db: DB, opts: { maker: string; productName: string; qty?: number; ref?: string }): Promise<ToolResult> {
  return createTask(db, { title: `Make ${opts.qty ?? 1}× ${opts.productName}`, assignee: opts.maker, kind: "make", ref: opts.ref });
}
export async function assignShipTask(db: DB, opts: { inventoryId: string; customer: string; channel: string }): Promise<ToolResult> {
  const inv = await one<any>(db, `SELECT tracking_no FROM inventory WHERE id=$1`, [opts.inventoryId]);
  return createTask(db, { title: `Ship ${inv?.tracking_no ?? opts.inventoryId} to ${opts.customer} (${opts.channel})`, assignee: "Nur", kind: "ship", ref: opts.inventoryId, priority: "high" });
}
export async function raiseProcurementTask(db: DB, opts: { itemName: string; ref?: string }): Promise<ToolResult> {
  return createTask(db, { title: `Restock ${opts.itemName} (below threshold)`, assignee: "Nur", kind: "procurement", ref: opts.ref });
}

// --- finance: cost outflow tags payments.source='maisha_inventory' (idempotent) ---
export async function logExpense(db: DB, opts: {
  payee: string; amount: number; currency: Currency; category: string; batchTag?: string; by?: string; proof?: string;
}): Promise<ToolResult> {
  const batch = opts.batchTag ?? `inv:exp:${opts.payee}:${opts.amount}:${opts.currency}`;
  const dupe = await one(db, `SELECT id FROM payments WHERE batch_tag=$1`, [batch]);
  if (dupe) return { ok: true, summary: "expense already logged (idempotent)", detail: { deduped: true } };
  const pid = id("pay");
  await db.query(
    `INSERT INTO payments (id, direction, payee, amount, currency, category, status, screenshot_path, source, batch_tag, created_by, created_at)
     VALUES ($1,'out',$2,$3,$4,$5,'paid',$6,'maisha_inventory',$7,$8,$9)`,
    [pid, opts.payee, opts.amount, opts.currency, opts.category, opts.proof ?? null, batch, opts.by ?? "Nur", now()]
  );
  return { ok: true, summary: `logged ${money(opts.amount, opts.currency)} expense (${opts.category})`, detail: { payment_id: pid, batch_tag: batch } };
}

// --- COGS / margin / P&L — per-currency, never blended ---
export async function computeCost(db: DB, endProductId: string): Promise<{ byCurrency: CurrencyMap; lines: any[] }> {
  const mats = await q<any>(db, `SELECT qty, unit_cost, currency FROM inventory_materials WHERE end_product_id=$1`, [endProductId]);
  const lines = mats.filter((m) => m.unit_cost != null && m.currency).map((m) => ({ amount: Number(m.qty) * Number(m.unit_cost), currency: m.currency }));
  return { byCurrency: sumByCurrency(lines), lines };
}

export async function collectionPnl(db: DB, collection: string): Promise<ToolResult> {
  const sales = await q<any>(db, `SELECT s.price, s.currency, s.channel_fee FROM inventory_sales s JOIN inventory i ON i.id = s.inventory_id WHERE i.collection=$1`, [collection]);
  const revenue = sumByCurrency(sales.map((s) => ({ amount: Number(s.price) - Number(s.channel_fee), currency: s.currency })));
  const prods = await q<any>(db, `SELECT id FROM inventory WHERE collection=$1 AND item_type='end_product'`, [collection]);
  let cost: CurrencyMap = {};
  for (const p of prods) {
    const c = await computeCost(db, p.id);
    for (const [k, v] of Object.entries(c.byCurrency)) cost[k as Currency] = (cost[k as Currency] ?? 0) + (v ?? 0);
  }
  return {
    ok: true,
    summary: `${collection}: revenue ${formatCurrencyMap(revenue) || "—"}, COGS ${formatCurrencyMap(cost) || "—"}`,
    detail: { collection, revenue, cogs: cost },
  };
}

// --- reads ---
export async function queryInventory(db: DB, filters: { itemType?: ItemType; collection?: string; lifecycleState?: string } = {}): Promise<any[]> {
  const where: string[] = ["enriched = TRUE"];
  const params: any[] = [];
  if (filters.itemType) { params.push(filters.itemType); where.push(`item_type = $${params.length}`); }
  if (filters.collection) { params.push(filters.collection); where.push(`collection = $${params.length}`); }
  if (filters.lifecycleState) { params.push(filters.lifecycleState); where.push(`lifecycle_state = $${params.length}`); }
  return q(db, `SELECT id, item_type, tracking_no, name, collection, style, maker, size, lifecycle_state, status FROM inventory WHERE ${where.join(" AND ")} ORDER BY created_at`, params);
}

export async function inventorySummary(db: DB): Promise<Record<string, any>> {
  const counts = await q<any>(db, `SELECT item_type, count(*)::int n FROM inventory WHERE enriched=TRUE GROUP BY item_type`);
  const byState = await q<any>(db, `SELECT lifecycle_state, count(*)::int n FROM inventory WHERE item_type='end_product' AND enriched=TRUE GROUP BY lifecycle_state`);
  const pending = await one<any>(db, `SELECT count(*)::int n FROM pending_enrichment WHERE status='pending'`);
  return { byType: Object.fromEntries(counts.map((c) => [c.item_type, c.n])), byLifecycle: Object.fromEntries(byState.map((s) => [s.lifecycle_state ?? "none", s.n])), pendingImages: pending?.n ?? 0 };
}

// --- customer gated read: only by scoped token, only own order, no internal fields ---
export async function lookupOrderByToken(db: DB, token: string): Promise<ToolResult> {
  if (!token || token.length < 6) return { ok: false, refused: true, summary: "no valid order token" };
  const sale = await one<any>(db, `SELECT s.tracking_no, s.payment_status, i.lifecycle_state FROM inventory_sales s JOIN inventory i ON i.id=s.inventory_id WHERE s.customer_token=$1`, [token]);
  if (!sale) return { ok: false, refused: true, summary: "no order for that token" };
  // sanitized: only shipping status, nothing internal (no price, no maker, no cost)
  const status = sale.lifecycle_state === "delivered" ? "Delivered"
    : sale.lifecycle_state === "in_transit" ? "On its way"
    : sale.lifecycle_state === "shipped" ? "Shipped"
    : "Preparing your order";
  return { ok: true, summary: status, detail: { tracking_no: sale.tracking_no, status } };
}
