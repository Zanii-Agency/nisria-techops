// Backfill triggered by the 2026-06-13 16:15 stale-ingest-audit ping.
//
// TWO classes of orphan get repaired in one pass:
//
//  A) 20 ingest_items with status='routed', applied=false, older than 24h.
//     For each: ensure an asset row (Library), mirror into documents (search),
//     create a finance_review or record_review approval (Needs You), flip the
//     ingest_item to applied. Idempotent on (storage_path, ingest_item_id).
//
//  B) 9 inbound chat messages with expense-shape but no anchor in
//     pending_actions or action_intents. For each:
//       - run parsePaymentAll on the current parser (v1.3.13)
//       - parseable matches insert into pending_actions (record_payment,
//         awaiting_confirm). Idempotent on (source_message_id, amount).
//       - unparseable (lowercase-article payee or budget plan): hand-stage
//         a pending_action or approval matching the worker's shape.
//
// Companion message to Nur is sent SEPARATELY in step C (not this script)
// after the human confirms the backfill landed clean.
//
// Run: node scripts/_backfill-2026-06-13-stale-ingest-and-dropped-expenses.mjs
// Re-run safe.

import fs from "node:fs";

const ENV = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => {
  const m = ENV.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^"|"$/g, "").replace(/\\n$/, "") : "";
};
const URL_ = get("SUPABASE_URL");
const KEY = get("SUPABASE_SERVICE_KEY");

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = (p, init = {}) => fetch(`${URL_}/rest/v1/${p}`, { ...init, headers: { ...H, ...(init.headers || {}) } });

const NUR_CONTACT_ID = "46b86180-f2a3-4131-b41d-b70773a8d998";
const NOW_ISO = "2026-06-13T11:30:00.000Z"; // pinned for determinism

// ─────────────────────────────────────────────────────────────────────────
// PART A: backfill the 20 stale ingest_items
// ─────────────────────────────────────────────────────────────────────────

async function fetchStaleIngests() {
  const cutoff = new Date(new Date(NOW_ISO).getTime() - 24 * 3600_000).toISOString();
  const r = await rest(
    `ingest_items?select=id,batch_id,channel,attribution,filename,mime,storage_path,asset_id,routed_to,route,created_at&status=eq.routed&applied=eq.false&created_at=lt.${encodeURIComponent(cutoff)}&order=created_at.asc`,
  );
  return await r.json();
}

async function ensureAsset(it) {
  if (it.asset_id) return it.asset_id;
  if (!it.storage_path) return null;
  // dedupe by storage_path
  const probe = await (
    await rest(`assets?select=id&storage_path=eq.${encodeURIComponent(it.storage_path)}&limit=1`)
  ).json();
  if (probe?.[0]?.id) return probe[0].id;

  const route = it.route || {};
  const title = (route.title || it.filename || "Imported file").slice(0, 200);
  const description = (route.content || route.caption || route.reason || route.title || "Imported file").slice(0, 600);
  const brand = (route.brand && ["nisria", "maisha", "ahadi"].includes(route.brand)) ? route.brand : "nisria";
  const tags = Array.from(new Set([it.routed_to, route.category].filter(Boolean)));
  const type = String(it.mime || "").startsWith("image/") ? "image" : "document";

  const r = await rest("assets", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      type,
      title,
      description,
      storage_path: it.storage_path,
      mime: it.mime,
      source: "ingest",
      created_by: it.attribution || "Nur",
      tags,
      brand,
    }),
  });
  if (!r.ok) throw new Error(`asset insert failed: ${r.status} ${await r.text()}`);
  const out = await r.json();
  return out?.[0]?.id || out?.id || null;
}

async function ensureDocument(it, route) {
  if (!it.storage_path) return;
  const driveFileId = `ingest:${it.storage_path}`;
  const inlineText = String(route?._text || "").trim();
  const docType = String(it.mime || "").startsWith("image/") ? "image" : "document";
  const folder = it.routed_to === "finance" ? "finance"
    : it.routed_to === "record" ? "record"
    : "general";
  const summary = (route?.content || route?.caption || route?.title || route?.reason || "").slice(0, 600);
  const body = {
    drive_file_id: driveFileId,
    title: (route?.title || it.filename || "Imported document").slice(0, 200),
    folder,
    doc_type: docType,
    brand: route?.brand && ["nisria", "maisha", "ahadi"].includes(route.brand) ? route.brand : "nisria",
    mime: it.mime,
    extracted_text: inlineText ? inlineText.slice(0, 200000) : null,
    summary: summary || null,
    source: it.channel === "whatsapp" ? "whatsapp" : "ingest",
    updated_at: NOW_ISO,
  };
  // upsert via Prefer: resolution=merge-duplicates on drive_file_id
  const r = await rest("documents?on_conflict=drive_file_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`documents upsert failed: ${r.status} ${await r.text()}`);
}

async function ensureApproval(it, route, assetId) {
  // skip class never needs an approval
  if (it.routed_to === "skip") return null;
  const kind = it.routed_to === "finance" ? "finance_review"
    : it.routed_to === "record" ? "record_review"
    : "review";
  // idempotency: ONE approval per ingest_item_id
  const probe = await (
    await rest(`approvals?select=id&context->>ingest_item_id=eq.${it.id}&kind=eq.${kind}&limit=1`)
  ).json();
  if (probe?.[0]?.id) return probe[0].id;

  const titleSrc = route?.title || it.filename || "Imported item";
  const reason = route?.reason || "Routed but never applied. Sasa surfacing for your review.";
  const inlineText = (route?._text || "").trim();
  const sender = it.attribution || "Nur";
  const summary = (route?.content || route?.caption || reason || titleSrc).slice(0, 600);
  const longSummary = [
    `${sender} sent this ${it.channel === "whatsapp" ? "in WhatsApp" : "via upload"} on ${(it.created_at || "").slice(0, 16)}.`,
    `Routed as ${kind === "finance_review" ? "finance" : "record"}: ${titleSrc}.`,
    summary,
    inlineText ? `Note: ${inlineText.slice(0, 280)}` : null,
  ].filter(Boolean).join(" ");

  const row = {
    kind,
    title: titleSrc.slice(0, 160),
    summary: longSummary.slice(0, 800),
    agent: "agent:ingest",
    lane: "approve",
    status: "pending",
    proposed: "pending",
    context: {
      ingest_item_id: it.id,
      storage_path: it.storage_path,
      asset_id: assetId,
      filename: it.filename,
      attribution: sender,
      routed_to: it.routed_to,
      currency_hint: it.routed_to === "finance" ? "KES" : null,
      backfill_reason: "stale_ingest_audit_2026_06_13",
    },
    related_contact_id: it.attribution && /nur/i.test(it.attribution) ? NUR_CONTACT_ID : null,
  };
  const r = await rest("approvals", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`approval insert failed: ${r.status} ${await r.text()}`);
  const out = await r.json();
  return out?.[0]?.id || null;
}

async function flipApplied(it, assetId) {
  const r = await rest(`ingest_items?id=eq.${it.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "applied",
      applied: true,
      asset_id: assetId || it.asset_id || null,
      updated_at: NOW_ISO,
    }),
  });
  if (!r.ok) throw new Error(`ingest_items flip failed: ${r.status} ${await r.text()}`);
}

async function backfillIngests() {
  const stale = await fetchStaleIngests();
  console.log(`PART A: ${stale.length} stale ingest_items`);
  const proof = [];
  for (const it of stale) {
    try {
      const route = it.route || {};
      const assetId = await ensureAsset(it);
      await ensureDocument(it, route);
      const approvalId = await ensureApproval(it, route, assetId);
      await flipApplied(it, assetId);
      proof.push({
        ingest_item_id: it.id,
        routed_to: it.routed_to,
        filename: it.filename,
        asset_id: assetId,
        approval_id: approvalId,
      });
      console.log(`  ✓ ${it.routed_to.padEnd(8)} ${it.id.slice(0, 8)} ${(it.filename || "").slice(0, 50)} (asset=${assetId?.slice(0,8) || "-"} approval=${approvalId?.slice(0,8) || "-"})`);
    } catch (e) {
      console.log(`  ✗ ${it.id.slice(0, 8)} ${it.filename}: ${e.message}`);
      proof.push({ ingest_item_id: it.id, error: e.message });
    }
  }
  return proof;
}

// ─────────────────────────────────────────────────────────────────────────
// PART B: backfill the 9 truly-dropped expense messages
// ─────────────────────────────────────────────────────────────────────────

const DROPPED = [
  // 1 M-Pesa SMS (parser will catch via parseMpesaSent)
  { id: "86cff050-3fc0-460c-9f23-fd6f8e7a5ef2", parse: true, contact: "c16ff282-10ae-437a-a741-1e4ae8ec0e02", account: "team group", body: "UEPK7XYZ Confirmed. Ksh 1,250 sent to Fargo Courier 0712345678 on 8/6/26 at 7:42 PM. New M-PESA balance is Ksh 0\nTransport for the embassy run, handled by Mark." },
  // 5x identical "log three payments" — DEDUPED to FIRST only; parser yields 3 staged actions each
  { id: "64ad39da-ddc8-4f06-baa6-25b1a3e9b8f2", parse: true, contact: "c16ff282-10ae-437a-a741-1e4ae8ec0e02", account: "whatsapp", body: "log three payments: KES 200 to Mark for matatu, KES 350 to Dorcas for shop, KES 800 to Cynthia for supplies" },
  // remaining 4 duplicates: skip-record (audit anchor only, no new pending_actions)
  { id: "1c1029b1-a6dd-4ed9-b8a4-0e1a52e83cb1", parse: false, dupOf: "64ad39da", contact: "c16ff282-10ae-437a-a741-1e4ae8ec0e02", account: "whatsapp", body: null },
  { id: "d262b46b-c08e-4a72-8c87-d1f7d8be95ed", parse: false, dupOf: "64ad39da", contact: "c16ff282-10ae-437a-a741-1e4ae8ec0e02", account: "whatsapp", body: null },
  { id: "40c84ed2-6e57-4836-bfa5-83a9da2b2db8", parse: false, dupOf: "64ad39da", contact: "c16ff282-10ae-437a-a741-1e4ae8ec0e02", account: "whatsapp", body: null },
  { id: "d300d5db-d54e-4e8f-9648-83b3b8df0e93", parse: false, dupOf: "64ad39da", contact: "c16ff282-10ae-437a-a741-1e4ae8ec0e02", account: "whatsapp", body: null },
  // 2 hyphen-lowercase-article ("Sent to the X") — won't parse; hand-stage
  {
    id: "352935e3-bff1-4ec5-bf9c-2dc02da81d5e", parse: false, contact: "ea3f55bd-ea06-44ef-8277-99208b52c25d", account: "Nisria • Finances 💵",
    body: "KSH 44,000 - Sent to the shipping company to ship 34KGs of clothes of Maisha from Nairobi to Dubai",
    hand: { payee: "the shipping company", amount: 44000, currency: "KES", method: "mpesa", purpose: "ship 34KG Maisha clothes Nairobi to Dubai" },
  },
  {
    id: "8b4785a0-67c4-43cb-bbf0-2e0f57bd66f2", parse: false, contact: "ea3f55bd-ea06-44ef-8277-99208b52c25d", account: "Nisria • Finances 💵",
    body: "KSH 26,000 - Sent to the supermarket - Nisria monthly supplies.",
    hand: { payee: "the supermarket", amount: 26000, currency: "KES", method: "mpesa", purpose: "Nisria monthly supplies" },
  },
  // 1 graduation budget — NOT a payment; create a planning-review approval
  {
    id: "840da527-3b97-4f61-bbe0-7a3a35bfa0fc", parse: false, contact: "36155839-3c84-4d22-bbe1-69b27ff95e7c", account: "Nisria • (Admin)",
    body: "Greetings,\n*GRADUATION BUDGET*\nTENTS AND SEATS-8000/=\nPA/MC/DJ-30,000/=\nREFRESHMENTS-7,500/=\nCAKE-8,800/=\nPROGRAMME/INVITATIONS/CERTIFICATE-11,000/=\nGOWN FABRICS 4500/=\n*Total ksh 75,000/=*",
    budget: true,
  },
];

async function stagePaymentRow(msg, payeeAmt, sourceTag) {
  // sourceTag: "parser" | "hand" — for audit
  const payload = {
    payee: payeeAmt.payee,
    amount: payeeAmt.amount,
    currency: payeeAmt.currency,
    method: payeeAmt.method || (payeeAmt.currency === "KES" ? "mpesa" : null),
    paid_at: payeeAmt.paid_at || msg.created_at || NOW_ISO,
    purpose: payeeAmt.purpose || null,
    screenshot_path: null,
    source_message_id: msg.id,
    source_group: msg.account,
    source_sender: "Nur M’nasria",
    idempotency_key: `group_payment__${msg.id}__${payeeAmt.amount}`,
    backfill_reason: "stale_ingest_audit_2026_06_13_dropped_expense",
    backfill_source: sourceTag,
  };
  // idempotency: same source_message_id + amount already? skip
  const probe = await (
    await rest(`pending_actions?select=id&kind=eq.record_payment&payload->>source_message_id=eq.${msg.id}`)
  ).json();
  const dupe = (probe || []).find((r) => true) && (await (
    await rest(`pending_actions?select=id,payload&kind=eq.record_payment&payload->>source_message_id=eq.${msg.id}`)
  ).json()).find((r) => Number(r.payload?.amount) === Number(payeeAmt.amount));
  if (dupe) return { id: dupe.id, skipped: true };
  const summary = `${payeeAmt.currency} ${payeeAmt.amount.toLocaleString()} to ${payeeAmt.payee}${payeeAmt.purpose ? ` for ${payeeAmt.purpose}` : ""} (from ${msg.account}, backfilled)`;
  const r = await rest("pending_actions", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      contact_id: msg.contact,
      kind: "record_payment",
      payload,
      summary,
      status: "awaiting_confirm",
    }),
  });
  if (!r.ok) throw new Error(`pending_action insert failed: ${r.status} ${await r.text()}`);
  const out = await r.json();
  return { id: out?.[0]?.id, skipped: false };
}

async function stageBudgetApproval(msg) {
  // single approval kind='budget_review' so Nur sees one card, not seven
  const probe = await (
    await rest(`approvals?select=id&context->>source_message_id=eq.${msg.id}&kind=eq.budget_review&limit=1`)
  ).json();
  if (probe?.[0]?.id) return { id: probe[0].id, skipped: true };
  const row = {
    kind: "budget_review",
    title: "Graduation budget plan, KES 75,000",
    summary: "Nur posted a graduation budget plan in Nisria • (Admin) on 2026-06-11. Seven categories totalling KES 75,000. Confirm to log as a planned-expense bucket, or correct the line items.",
    agent: "agent:ingest",
    lane: "approve",
    status: "pending",
    proposed: "pending",
    context: {
      source_message_id: msg.id,
      source_group: msg.account,
      total: 75000,
      currency: "KES",
      line_items: [
        { label: "Tents and seats", amount: 8000 },
        { label: "PA / MC / DJ", amount: 30000 },
        { label: "Refreshments", amount: 7500 },
        { label: "Cake", amount: 8800 },
        { label: "Programme / Invitations / Certificate", amount: 11000 },
        { label: "Gown fabrics", amount: 4500 },
      ],
      backfill_reason: "stale_ingest_audit_2026_06_13_budget",
    },
    related_contact_id: msg.contact,
  };
  const r = await rest("approvals", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`budget approval insert failed: ${r.status} ${await r.text()}`);
  const out = await r.json();
  return { id: out?.[0]?.id, skipped: false };
}

async function backfillDropped() {
  console.log(`\nPART B: ${DROPPED.length} dropped expense messages`);
  const proof = [];
  // import the LIVE parser
  const { parsePaymentAll } = await import("../app/api/whatsapp/worker/parsePayment.mjs");
  for (const msg of DROPPED) {
    if (msg.dupOf) {
      proof.push({ msg: msg.id, action: "skip_dup", of: msg.dupOf });
      console.log(`  - ${msg.id.slice(0, 8)} skip (duplicate retry of ${msg.dupOf})`);
      continue;
    }
    if (msg.budget) {
      const res = await stageBudgetApproval(msg);
      proof.push({ msg: msg.id, action: "budget_approval", approval_id: res.id, skipped: res.skipped });
      console.log(`  ${res.skipped ? "↻" : "✓"} ${msg.id.slice(0, 8)} budget approval ${res.id?.slice(0, 8) || "-"}`);
      continue;
    }
    if (msg.hand) {
      const res = await stagePaymentRow(msg, { ...msg.hand, paid_at: null }, "hand");
      proof.push({ msg: msg.id, action: "hand_stage", pa_id: res.id, skipped: res.skipped });
      console.log(`  ${res.skipped ? "↻" : "✓"} ${msg.id.slice(0, 8)} hand-staged ${msg.hand.currency} ${msg.hand.amount} to ${msg.hand.payee}`);
      continue;
    }
    if (msg.parse) {
      const parsed = (parsePaymentAll(msg.body) || []).filter((p) => p && p.intent === "stage_payment");
      if (!parsed.length) {
        proof.push({ msg: msg.id, action: "parse_miss", body: msg.body.slice(0, 80) });
        console.log(`  ! ${msg.id.slice(0, 8)} parser returned 0 matches: ${msg.body.slice(0, 60)}`);
        continue;
      }
      for (const p of parsed) {
        const res = await stagePaymentRow(msg, p.payload, "parser");
        proof.push({ msg: msg.id, action: "parser_stage", pa_id: res.id, skipped: res.skipped, payee: p.payload.payee, amount: p.payload.amount });
        console.log(`  ${res.skipped ? "↻" : "✓"} ${msg.id.slice(0, 8)} parser-staged ${p.payload.currency} ${p.payload.amount} to ${p.payload.payee}`);
      }
    }
  }
  return proof;
}

// ─────────────────────────────────────────────────────────────────────────

const partA = await backfillIngests();
const partB = await backfillDropped();

console.log("\n== PROOF ==");
console.log(JSON.stringify({ partA, partB }, null, 2));
