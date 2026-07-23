"use server";
import { admin } from "../../lib/supabase-admin";
import { claudeJSON } from "../../lib/anthropic";
import { emit } from "../../lib/events";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";

const CCY = new Set(["KES", "USD", "AED"]);
const STATUSES = new Set(["in_stock", "low", "out", "archived"]);
const LIFECYCLE = new Set(["production", "in_stock", "reserved", "sold", "shipped", "in_transit", "delivered", "returned", "restock"]);
const ITEM_TYPES = new Set(["end_product", "textile", "supply"]);

// MANUAL EDIT (2026-07-23). Owner data is forever the owner's to edit (KT #122): Nur can correct
// any inventory item on the portal, not only via the bot. Text fields set/clear; the links jsonb
// carries measurements + every extra labelled attribute (weight, fabrics, ...) so a manual edit can
// change them too. Cost/price are founder-only (same gate as the detail page) and Currency-law bound
// (a figure only becomes money with a currency). Nothing here is destructive: it updates in place.
export async function updateItem(fd: FormData) {
  const id = String(fd.get("id") || "").trim();
  if (!id) return;
  const user = getCurrentUser();
  const isFounder = user?.role === "founder";
  const db = admin();
  const { data: cur } = await db.from("inventory").select("id,name,links").eq("id", id).single();
  if (!cur) return;

  const str = (k: string) => String(fd.get(k) ?? "").trim();
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };

  // free-text columns: a value sets it, an empty box clears it (owner control)
  for (const f of ["tracking_no", "collection", "category", "style", "maker", "size", "location"]) {
    patch[f] = str(f) || null;
  }
  patch.name = str("name") || cur.name || "Item"; // name is NOT NULL, never blank it
  const it = str("item_type"); if (ITEM_TYPES.has(it)) patch.item_type = it;
  const st = str("status"); if (STATUSES.has(st)) patch.status = st;
  const lc = str("lifecycle_state"); if (LIFECYCLE.has(lc)) patch.lifecycle_state = lc;
  const qRaw = fd.get("quantity");
  patch.quantity = qRaw != null && String(qRaw) !== "" ? Math.max(0, Math.round(Number(qRaw)) || 0) : 0;

  // links jsonb: measurements + every extra attribute (posted as attr__<label>), plus one add-row
  const links: Record<string, any> = { ...((cur.links as any) || {}) };
  const meas = str("measurements"); if (meas) links.measurements = meas; else delete links.measurements;
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("attr__")) continue;
    const label = k.slice(6).trim();
    if (!label) continue;
    const val = String(v).trim();
    if (val) links[label] = val; else delete links[label];
  }
  const nl = str("attr_new_label"), nv = str("attr_new_value");
  if (nl && nv) links[nl.slice(0, 40)] = nv.slice(0, 200);
  patch.links = links;

  // cost / price — founder only, Currency law: only a currency-carrying figure becomes money
  if (isFounder) {
    const uc = fd.get("unit_cost"), cc = str("cost_currency");
    if (String(uc) === "") { patch.unit_cost = null; patch.cost_currency = null; }
    else if (uc != null && CCY.has(cc) && isFinite(Number(uc))) { patch.unit_cost = Number(uc); patch.cost_currency = cc; }
    const up = fd.get("unit_price"), pc = str("price_currency");
    if (String(up) === "") { patch.unit_price = null; patch.price_currency = null; }
    else if (up != null && CCY.has(pc) && isFinite(Number(up))) { patch.unit_price = Number(up); patch.price_currency = pc; }
  }

  const { error } = await db.from("inventory").update(patch).eq("id", id);
  if (error) { await emit({ type: "inventory.item_edit_failed", source: "inventory", actor: user?.name || "operator", subject_type: "inventory", subject_id: id, payload: { error: error.message } }); return; }
  await emit({ type: "inventory.item_edited", source: "inventory", actor: user?.name || "Nur", subject_type: "inventory", subject_id: id, payload: { name: patch.name } });
  revalidatePath(`/inventory/${id}`);
  revalidatePath("/inventory");
  redirect(`/inventory/${id}`);
}

// DELETE (owner CRUD). A deliberate remove from the edit surface. Owner's data, owner's call. The
// lifecycle ledger rows are left as history; the item row is removed and the list revalidated.
export async function deleteItem(fd: FormData) {
  const id = String(fd.get("id") || "").trim();
  if (!id) return;
  const user = getCurrentUser();
  const db = admin();
  const { data: cur } = await db.from("inventory").select("id,name").eq("id", id).single();
  if (!cur) redirect("/inventory");
  const { error } = await db.from("inventory").delete().eq("id", id);
  if (error) { await emit({ type: "inventory.item_delete_failed", source: "inventory", actor: user?.name || "operator", subject_type: "inventory", subject_id: id, payload: { error: error.message } }); return; }
  await emit({ type: "inventory.item_deleted", source: "inventory", actor: user?.name || "Nur", subject_type: "inventory", subject_id: id, payload: { name: cur?.name } });
  revalidatePath("/inventory");
  redirect("/inventory");
}

// Add an inventory item with the real schema columns. The free-text "story"
// is NOT persisted on the item (inventory has no notes column) — it's only
// used at generation time and lives on in the generated Folklore listing.
export async function addItem(fd: FormData) {
  const name = String(fd.get("name") || "").trim();
  if (!name) return;
  const collection = String(fd.get("collection") || "").trim() || null;
  const category = String(fd.get("category") || "").trim() || null;
  const quantity = Number(fd.get("quantity") || 0) || 0;
  const unit_price = fd.get("unit_price") ? Number(fd.get("unit_price")) : null;

  await admin().from("inventory").insert({
    name,
    collection,
    category,
    quantity,
    unit_price,
    status: "in_stock",
    folklore_listed: false,
  });

  await emit({
    type: "inventory.item_added",
    source: "inventory",
    actor: "Nur",
    payload: { name, collection, category },
  });
  revalidatePath("/inventory");
}

// Generate a The-Folklore-marketplace listing for an item in Maisha's voice,
// then save the copy to the Library (assets) and mark the item as listed.
export async function generateListing(fd: FormData) {
  const id = String(fd.get("id"));
  if (!id) return;
  const story = String(fd.get("story") || "").trim();
  const db = admin();

  const { data: item } = await db.from("inventory").select("*").eq("id", id).single();
  if (!item) return;

  const draft = await claudeJSON<{ title: string; description: string; tags: string[] }>(
    `You are the brand copywriter for Maisha, the handmade-goods sister brand of Nisria Inc (a US/Florida nonprofit helping children and families in Kenya). You write product listings for The Folklore — a curated marketplace for African and diaspora brands. Voice: warm, dignified, culturally rooted, never poverty-porn or charity-pity. Celebrate the craft and the maker. Return a JSON object with: "title" (a refined product title), "description" (2-3 short evocative paragraphs covering the piece, its making, materials and the maker community, ending with a soft note that purchases support Nisria's work in Kenya), and "tags" (an array of 5-8 lowercase marketplace keywords).`,
    `Product: ${item.name}
Collection: ${item.collection || "—"}
Category: ${item.category || "—"}
Price: ${item.unit_price ? `$${item.unit_price}` : "—"}${story ? `\nMaker story / notes: ${story}` : ""}`,
    900
  );

  if (!draft || !draft.description) {
    await emit({
      type: "inventory.listing_failed",
      source: "inventory",
      actor: "AI",
      subject_type: "inventory",
      subject_id: id,
      payload: { name: item.name },
    });
    return;
  }

  const tags = Array.isArray(draft.tags) ? draft.tags : [];
  const fullCopy = `${draft.title || item.name}\n\n${draft.description}${
    tags.length ? `\n\nTags: ${tags.join(", ")}` : ""
  }${story ? `\n\n— maker story —\n${story}` : ""}`;

  // Save the generated copy into the Library so the agents + Nur can reuse it.
  const { data: asset } = await db
    .from("assets")
    .insert({
      brand: "maisha",
      type: "document",
      title: `Folklore listing — ${item.name}`,
      description: fullCopy,
      tags,
      source: "inventory",
      created_by: "AI",
    })
    .select()
    .single();

  // Mark the item as listed. (folklore_url is left for the human to paste once
  // the listing is live on The Folklore.) Stock status is left untouched —
  // listing a piece does not change whether it is in_stock; folklore_listed
  // is the listing flag. Writing status:'active' previously violated the
  // inventory_status_check constraint (in_stock|low|out|archived) and threw.
  await db.from("inventory").update({ folklore_listed: true }).eq("id", id);

  await emit({
    type: "inventory.listing_generated",
    source: "inventory",
    actor: "AI",
    subject_type: "inventory",
    subject_id: id,
    payload: { name: item.name, asset_id: asset?.id, title: draft.title },
  });
  revalidatePath("/inventory");
}
