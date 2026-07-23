// MAISHA INVENTORY CAPTURE FROM THE WHATSAPP GROUP (spec 004, Phase 2).
//
// "Data capture from the team and the group" for Maisha stock. Two surfaces,
// both driven from /api/group/ingest when the message is in a Maisha inventory
// group (isInventoryGroup):
//
//   persistPendingInventory(): a PHOTO (or a clear new-product note) becomes an
//     inventory DRAFT row (item_type NULL, enriched=false, status='draft',
//     source='maisha_inventory', source_message_external_id set, asset stored +
//     asset_ids), plus a pending_enrichment row (status='pending'). IDEMPOTENT on
//     the message external id (wamid): a re-ingest of the same wa message never
//     duplicates the draft, the asset, or the pending row.
//
//   bindEnrichment(): the typing step. If the photo carried a CAPTION (Mode 2),
//     or a loose follow-up text from the SAME sender in the SAME group arrives
//     shortly after a pending draft (Mode 3), route the text through the existing
//     classify_and_enrich tool to set item_type and fill the stated fields, then
//     mark the matching pending_enrichment row 'enriched'.
//
// Extend-beside discipline: this never rewires the group route's existing media /
// brain flow. It is a new, additive lane that returns a small status object and
// is best-effort at the call site (its own writes are still VERIFIED: it never
// reports a draft/enrich it did not actually land).
//
// Mode 1 (swipe/quoted-reply binding) is DELIBERATELY not implemented here: it
// requires the inbound userbot to pass the quoted message's wa id so a reply can
// be anchored to the exact draft. The live group route receives quoted_id, but
// the Phase 1 capture writes the draft against THIS message's external id; a
// reliable Mode-1 bind needs the userbot to surface reply_to_external_id the same
// way the 727 webhook does. Until that lands, Mode 1 is reported blocked, never
// faked. Modes 2 and 3 cover caption + loose follow-up, which is the common case.

import { runSmartTool } from "./smart-tools";
import { parseProductCaption } from "./inventory-parse";

// A short window (minutes) after a pending draft in which a bare follow-up text
// from the same sender is treated as that draft's enrichment details. Kept tight
// so unrelated later chatter never gets stamped onto a stale draft.
const FOLLOWUP_WINDOW_MIN = Number(process.env.MAISHA_FOLLOWUP_WINDOW_MIN || 30);

// Does a free-text message clearly describe a NEW product worth a draft, with no
// photo? Conservative: only obvious product/stock language wakes a text-only
// draft, so ordinary group chatter never spawns inventory rows. A photo always
// drafts (handled at the call site); this gate is for the no-photo case.
// 2026-07-01 (junk-draft incident): a FINANCE/greeting message "Good morning
// everyone, 3300 was deposited ... from a tote BAG order" drafted a junk inventory
// item because a lone product noun ("bag") tripped the gate. Fix: (1) hard-reject
// finance/greeting/sale/order language outright, and (2) for a text-only draft
// require a product noun PLUS an inventory-ADD action (or an explicit tracking
// code) — a bare noun in conversation is not new stock. A photo still always
// drafts at the call site; this gate only governs the no-photo case.
const NOT_PRODUCT_RE = /\b(good\s*(?:morning|afternoon|evening|day)|deposit(?:ed)?|payment|paid|invoice|receipt|sold|\bsale\b|\border\s+(?:for|from)\b|customer|balance|owe[sd]?|thank(?:s|\s+you)|\bksh?\b|\bkes\b|\busd\b)\b/i;
const INVENTORY_ACTION_RE = /\b(new|add(?:ed|ing)?|finish(?:ed)?|complet(?:e|ed)|ready|received|made|produced|restock(?:ed)?|in\s+stock|log(?:ged)?\s+(?:to\s+)?(?:inventory|stock)|tracking|trk[-\s]?\d)\b/i;
const PRODUCT_NOUN_RE = /\b(abaya|dress(?:es)?|kaftan|caftan|gown|bag|tote|scarf|shawl|kimono|jacket|kikoy|ankara|fabric|textile|silk|cotton|linen|garment|piece|product|item|stock|collection)\b/i;
const TRACKING_RE = /\b(?:trk[-\s]?\d|tracking\s*(?:no|number|#)?\s*[:#]?\s*\w)/i;
export function describesNewProduct(text: string): boolean {
  const t = (text || "").trim();
  if (t.length < 4) return false;
  if (NOT_PRODUCT_RE.test(t)) return false;            // finance / greeting / sale / order → never inventory
  if (TRACKING_RE.test(t)) return true;                // explicit tracking code → it's stock
  return PRODUCT_NOUN_RE.test(t) && INVENTORY_ACTION_RE.test(t); // noun + add-action, not a bare noun
}

// A best-effort, human draft name from a caption / note. Falls back to a dated
// placeholder so the draft is always findable (and re-typable) even with no text.
function draftNameFrom(text: string | null, hasPhoto: boolean): string {
  const t = (text || "").trim().replace(/\s+/g, " ");
  // Clean PRODUCT NAME only, never the whole caption in the title (FADHILI fix 2026-07-22). If the
  // caption has NO leading product name (details-only), fall back to the placeholder, not the dump.
  if (t) { const nm = parseProductCaption(t).name; if (nm && nm.length >= 2) return nm.slice(0, 80); }
  return hasPhoto ? `Maisha photo ${new Date().toISOString().slice(0, 10)}` : "Maisha item";
}

export type PersistResult =
  | { ok: true; deduped: true; inventoryId: string; pendingId: string | null }
  | { ok: true; deduped: false; inventoryId: string; pendingId: string | null; assetId: string | null }
  | { ok: false; error: string };

// Create (or reuse, idempotent on wamid) a pending inventory draft + its asset +
// its pending_enrichment row. `assetBuf`/`assetMime` are the photo bytes if any.
export async function persistPendingInventory(db: any, opts: {
  messageExternalId: string;
  group: string;
  senderPhone: string | null;
  senderName: string | null;
  text: string | null;
  assetBuf?: Buffer | null;
  assetMime?: string | null;
  assetName?: string | null;
}): Promise<PersistResult> {
  const wamid = String(opts.messageExternalId || "").trim();
  if (!wamid) return { ok: false, error: "no message external id" };
  const hasPhoto = !!(opts.assetBuf && opts.assetBuf.length > 0 && opts.assetMime);

  // IDEMPOTENCY: a draft for this exact wa message must exist at most once. The
  // source_message_external_id is the natural key (Phase 1 writes it on the row).
  // A re-delivery on reconnect/backfill returns the existing draft, never a second.
  const { data: existing } = await db.from("inventory")
    .select("id").eq("source", "maisha_inventory").eq("source_message_external_id", wamid).limit(1);
  if (existing?.[0]) {
    const { data: pe } = await db.from("pending_enrichment").select("id").eq("message_external_id", wamid).limit(1);
    return { ok: true, deduped: true, inventoryId: existing[0].id, pendingId: pe?.[0]?.id || null };
  }
  // Also idempotent on a BARE photo that MERGED into an anchor (it has a pending row keyed to this
  // wamid but NO inventory row of its own). A redelivery must return the anchor, never re-merge.
  const { data: mergedPe } = await db.from("pending_enrichment").select("id,inventory_id").eq("message_external_id", wamid).limit(1);
  if (mergedPe?.[0]?.inventory_id) return { ok: true, deduped: true, inventoryId: mergedPe[0].inventory_id, pendingId: mergedPe[0].id };

  // Store the photo as an asset first (so asset_ids can reference it). Reuses the
  // assets-bucket pattern the rest of the group path uses; idempotent on a
  // per-message source_ref so a re-ingest reuses the same object + row.
  let assetId: string | null = null;
  if (hasPhoto) {
    const sourceRef = `maisha-inventory:${wamid}`;
    const { data: prevAsset } = await db.from("assets").select("id").eq("source_ref", sourceRef).limit(1);
    if (prevAsset?.[0]) {
      assetId = prevAsset[0].id;
    } else {
      const ext = (opts.assetMime || "").includes("png") ? "png" : (opts.assetMime || "").includes("webp") ? "webp" : "jpg";
      const path = `maisha-inventory/${opts.senderPhone || "group"}/${wamid}.${ext}`;
      const { error: upErr } = await db.storage.from("assets").upload(path, opts.assetBuf as Buffer, { contentType: opts.assetMime as string, upsert: true });
      if (upErr) return { ok: false, error: `asset upload failed: ${upErr.message || upErr}` };
      const { data: asset, error: aErr } = await db.from("assets")
        .insert({ type: "inventory_photo", storage_path: path, mime: opts.assetMime, source: "maisha_inventory", source_ref: sourceRef, created_by: opts.senderName || opts.senderPhone || "group" })
        .select("id").single();
      // VERIFIED WRITE: do not pretend an asset exists if its row did not land.
      if (aErr || !asset) return { ok: false, error: `asset row insert failed: ${(aErr as any)?.message || "no row"}` };
      assetId = asset.id;
    }
  }

  // PHOTO-MERGE (2026-07-22 FADHILI): a burst of photos of ONE product arrives as SEPARATE wa
  // messages. A BARE photo (no caption) attaches to the freshest still-pending draft from the
  // SAME sender in the SAME group inside a tight window, instead of spawning its own one-photo
  // draft. The captioned photo (below) absorbs bare placeholder drafts sent just before it.
  const hasCaption = !!(opts.text && opts.text.trim());
  const MERGE_WINDOW_MIN = Number(process.env.MAISHA_PHOTO_MERGE_WINDOW_MIN || 4);
  const mergeSinceISO = new Date(Date.now() - MERGE_WINDOW_MIN * 60 * 1000).toISOString();
  // A BARE photo (no caption) attaches to the freshest CAPTIONED product draft from the SAME sender
  // in the SAME group inside the window. SAFE anchor: only a draft with a REAL product name (NOT a
  // bare "Maisha photo…" placeholder) is an anchor, so two bare bursts of DIFFERENT products never
  // chain together, and NOTHING is ever deleted. No captioned anchor -> it becomes its own draft.
  if (hasPhoto && !hasCaption && assetId && opts.senderPhone) {
    // Anchor status: pending OR enriched OR merged. The BUG (2026-07-23, the FADHILI Kimono): the
    // caption enriches the anchor within the same burst, flipping its pending_enrichment row to
    // 'enriched', so every bare photo that arrived after the caption processed could NOT find a
    // 'pending' anchor and orphaned into its own "Maisha photo" draft. A burst of an album (caption
    // on the first image, the rest bare) only kept the caption's photo. Matching enriched/merged
    // anchors too lets all the album photos land on the product, whatever the enrich race timing.
    const { data: recent } = await db.from("pending_enrichment")
      .select("inventory_id,created_at").in("status", ["pending", "enriched", "merged"]).eq("group_name", opts.group)
      .eq("sender_phone", opts.senderPhone).gte("created_at", mergeSinceISO)
      .order("created_at", { ascending: false }).limit(8);
    for (const r of ((recent || []) as any[])) {
      if (!r.inventory_id) continue;
      const { data: anc } = await db.from("inventory").select("id,asset_ids,name").eq("id", r.inventory_id).limit(1);
      const a = (anc as any)?.[0];
      if (!a || /^Maisha photo/i.test(String(a.name || ""))) continue; // require a CAPTIONED anchor
      const ids: string[] = Array.isArray(a.asset_ids) ? a.asset_ids : [];
      if (!ids.includes(assetId)) await db.from("inventory").update({ asset_ids: [...ids, assetId], updated_at: new Date().toISOString() }).eq("id", a.id);
      // Idempotency: the merged bare photo gets its OWN pending row keyed to its wamid (status
      // 'merged', never enriched), so a redelivery is caught at the top of the function.
      await db.from("pending_enrichment").insert({ message_external_id: wamid, inventory_id: a.id, asset_id: assetId, sender_phone: opts.senderPhone || null, sender_name: opts.senderName || null, group_name: opts.group || null, status: "merged" });
      return { ok: true, deduped: false, inventoryId: a.id, pendingId: null, assetId };
    }
  }

  // The DRAFT. item_type NULL (un-typed until enriched), enriched=false,
  // status='draft' (the migration widened the status check to allow 'draft'),
  // source + provenance set, the photo linked via asset_ids.
  const row: Record<string, any> = {
    item_type: null,
    name: draftNameFrom(opts.text, hasPhoto),
    status: "draft",
    enriched: false,
    source: "maisha_inventory",
    source_message_external_id: wamid,
    asset_ids: assetId ? [assetId] : [],
    created_by: opts.senderName || opts.senderPhone || "group",
  };
  const { data: inv, error: invErr } = await db.from("inventory").insert(row).select("id").single();
  // VERIFIED WRITE (Real-action law): never claim a draft we did not persist.
  if (invErr || !inv) return { ok: false, error: `inventory draft insert failed: ${(invErr as any)?.message || "no row"}` };

  // The pending_enrichment ledger row. Idempotent: a unique-ish (wamid) lookup
  // first so a race that slipped past the inventory check above still won't
  // double-stage the pending row.
  let pendingId: string | null = null;
  const { data: pePrev } = await db.from("pending_enrichment").select("id").eq("message_external_id", wamid).limit(1);
  if (pePrev?.[0]) {
    pendingId = pePrev[0].id;
  } else {
    const { data: pe } = await db.from("pending_enrichment").insert({
      message_external_id: wamid,
      inventory_id: inv.id,
      asset_id: assetId,
      sender_phone: opts.senderPhone || null,
      sender_name: opts.senderName || null,
      group_name: opts.group || null,
      status: "pending",
    }).select("id").single();
    pendingId = pe?.id || null;
  }

  // ABSORB PRIOR BARE ORPHANS (2026-07-23, caption-LAST albums). If THIS message is a captioned
  // PRODUCT (a real name, not the "Maisha photo" placeholder), pull in the bare photos this sender
  // dropped just BEFORE the caption (which had no anchor yet, so each became its own placeholder
  // draft). Together with the bare-photo merge above, the burst lands on the product whatever the
  // order. SAFE: only "Maisha photo" placeholders (never a real product), archived not deleted.
  if (hasCaption && hasPhoto && opts.senderPhone && !/^Maisha photo/i.test(String(row.name))) {
    const { data: orphans } = await db.from("pending_enrichment")
      .select("id,inventory_id").eq("status", "pending").eq("group_name", opts.group)
      .eq("sender_phone", opts.senderPhone).gte("created_at", mergeSinceISO)
      .order("created_at", { ascending: false }).limit(8);
    const merged: string[] = Array.isArray(row.asset_ids) ? [...row.asset_ids] : [];
    let absorbed = 0;
    for (const o of ((orphans || []) as any[])) {
      if (!o.inventory_id || o.inventory_id === inv.id) continue;
      const { data: od } = await db.from("inventory").select("id,asset_ids,name,enriched").eq("id", o.inventory_id).limit(1);
      const d = (od as any)?.[0];
      if (!d || d.enriched || !/^Maisha photo/i.test(String(d.name || ""))) continue; // only bare placeholders
      for (const aId of (Array.isArray(d.asset_ids) ? d.asset_ids : [])) if (aId && !merged.includes(aId)) merged.push(aId);
      await db.from("inventory").update({ asset_ids: [], enriched: true, status: "archived", name: "[merged into product]", updated_at: new Date().toISOString() }).eq("id", d.id);
      await db.from("pending_enrichment").update({ status: "merged", inventory_id: inv.id }).eq("id", o.id);
      absorbed++;
    }
    if (absorbed) await db.from("inventory").update({ asset_ids: merged, updated_at: new Date().toISOString() }).eq("id", inv.id);
  }

  return { ok: true, deduped: false, inventoryId: inv.id, pendingId, assetId };
}

export type BindResult =
  | { ok: true; bound: true; mode: "caption" | "followup"; inventoryId: string; summary: string }
  | { ok: true; bound: false; reason: string }
  | { ok: false; error: string };

// MODE 2 — caption bind. The same message that carried the photo also carried
// text. Type the just-created draft from that caption via classify_and_enrich.
export async function bindCaption(db: any, opts: {
  inventoryId: string; pendingId: string | null; caption: string; operatorName?: string | null;
}): Promise<BindResult> {
  const caption = String(opts.caption || "").trim();
  if (!caption) return { ok: true, bound: false, reason: "no caption" };
  return runEnrich(db, opts.inventoryId, opts.pendingId, caption, "caption", opts.operatorName || null);
}

// MODE 3 — loose follow-up bind. A text-only message from the same sender in the
// same group, shortly after a pending draft with no enrichment yet. Find the most
// recent such draft and type it from this message. Returns bound:false (not an
// error) when there is no fresh pending draft to bind to, so the caller falls
// through to the normal brain flow.
export async function bindFollowup(db: any, opts: {
  group: string; senderPhone: string | null; text: string; operatorName?: string | null;
}): Promise<BindResult> {
  const text = String(opts.text || "").trim();
  if (!text) return { ok: true, bound: false, reason: "no text" };
  if (!opts.senderPhone) return { ok: true, bound: false, reason: "no sender" };
  const sinceISO = new Date(Date.now() - FOLLOWUP_WINDOW_MIN * 60 * 1000).toISOString();
  // The freshest still-pending draft from THIS sender in THIS group within the
  // window. sender_phone is normalized digits on write, so match the same way.
  const { data: pend } = await db.from("pending_enrichment")
    .select("id,inventory_id,sender_phone,group_name,created_at")
    .eq("status", "pending")
    .eq("group_name", opts.group)
    .eq("sender_phone", opts.senderPhone)
    .gte("created_at", sinceISO)
    .order("created_at", { ascending: false })
    .limit(1);
  const slot = pend?.[0];
  if (!slot || !slot.inventory_id) return { ok: true, bound: false, reason: "no fresh pending draft" };
  // Only bind to a draft that is still un-typed (enriched=false), so a second
  // follow-up does not re-type an already-enriched item.
  const { data: invRow } = await db.from("inventory").select("id,enriched").eq("id", slot.inventory_id).limit(1);
  if (!invRow?.[0] || invRow[0].enriched === true) return { ok: true, bound: false, reason: "draft already enriched" };
  return runEnrich(db, slot.inventory_id, slot.id, text, "followup", opts.operatorName || null);
}

// Shared: drive classify_and_enrich against a specific draft row, then flip its
// pending_enrichment row to 'enriched' only on a verified enrich. The smart tool
// resolves the draft by name/tracking fragment among enriched=false rows; we feed
// the draft's own name so it targets exactly this row.
async function runEnrich(db: any, inventoryId: string, pendingId: string | null, text: string, mode: "caption" | "followup", operatorName: string | null): Promise<BindResult> {
  const { data: invRow } = await db.from("inventory").select("id,name,tracking_no,enriched").eq("id", inventoryId).limit(1);
  if (!invRow?.[0]) return { ok: false, error: "draft not found" };
  if (invRow[0].enriched === true) return { ok: true, bound: false, reason: "already enriched" };
  const query = String(invRow[0].tracking_no || invRow[0].name || "").trim();
  if (!query) return { ok: false, error: "draft has no name/tracking to match on" };
  const res: any = await runSmartTool("classify_and_enrich", { inventory_id: inventoryId, query, text }, {
    tier: "admin", operatorName: operatorName || undefined, userText: text,
  });
  if (!res?.ok) {
    // The tool refused (ambiguous type, no type signal, write failed). The draft
    // stays pending so a clearer follow-up can still type it. Honest, not a lie.
    return { ok: true, bound: false, reason: res?.error || res?.summary || "enrich declined" };
  }
  // VERIFIED: confirm the row is now actually enriched before flipping the ledger.
  const { data: after } = await db.from("inventory").select("enriched").eq("id", inventoryId).limit(1);
  if (after?.[0]?.enriched === true && pendingId) {
    await db.from("pending_enrichment").update({ status: "enriched" }).eq("id", pendingId);
  }
  return { ok: true, bound: true, mode, inventoryId, summary: String(res.summary || "Typed the draft.") };
}
