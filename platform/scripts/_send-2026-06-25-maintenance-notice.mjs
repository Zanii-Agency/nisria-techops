// One-shot: notify all 8 individual DM interactors that Sasa is entering a
// maintenance window. DM only, NO groups. First-person Sasa, no em-dashes.
// Reminders are DEFERRED (held until maintenance lifts), so the wording does
// not promise live delivery during the window.
//
// Sends via Meta Cloud API directly (mirrors sendText in lib/whatsapp.ts) and
// logs each to the messages table for the transcript. Captures per-recipient
// success/failure honestly (no fake zeros).
//
// Run: node scripts/_send-2026-06-25-maintenance-notice.mjs

import fs from "node:fs";

const PROD_ENV = "/tmp/vercel-prod.env";
const ENV = fs.existsSync(PROD_ENV)
  ? fs.readFileSync(PROD_ENV, "utf8") + "\n" + fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  : fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => {
  const m = ENV.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^"|"$/g, "").replace(/\\n$/, "") : "";
};
const URL_ = get("SUPABASE_URL");
const KEY = get("SUPABASE_SERVICE_KEY");
const META_TOKEN = get("WHATSAPP_TOKEN");
const META_PHONE_ID = get("WHATSAPP_PHONE_NUMBER_ID");

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = (p, init = {}) => fetch(`${URL_}/rest/v1/${p}`, { ...init, headers: { ...H, ...(init.headers || {}) } });

// The 8 individual DM interactors (no groups), by phone.
const RECIPIENTS = [
  { phone: "971501622716", first: "Nur" },
  { phone: "971501168462", first: "Taona" },
  { phone: "254111741123", first: "Cynthia" },
  { phone: "254796210538", first: "Eliza" },
  { phone: "254718686515", first: "Malieng" },
  { phone: "254703119486", first: "Mark" },
  { phone: "254719342752", first: "Violet" },
  { phone: "254706298128", first: "Wahome" },
];

const bodyFor = (first) => `Hi ${first}, it's Sasa. I'm going into a short maintenance window for an upgrade, so I won't be able to take new requests for a little while. Anything you've already scheduled with me will still reach you once I'm back up. I'll message you the moment maintenance is done. Thanks for your patience.`;

if (!META_TOKEN || !META_PHONE_ID || !URL_ || !KEY) {
  console.log("MISSING env (META or SUPABASE). Aborting.");
  process.exit(2);
}

const results = [];
for (const r of RECIPIENTS) {
  const BODY = bodyFor(r.first);
  // Resolve contact_id by phone (+ prefixed in contacts table)
  let contactId = null;
  try {
    const cr = await rest(`contacts?select=id,name&phone=eq.${encodeURIComponent("+" + r.phone)}`);
    const cj = await cr.json();
    contactId = cj?.[0]?.id || null;
  } catch {}

  // Send via Meta Cloud API
  let externalId = null, status = "sent", err = null;
  try {
    const sendRes = await fetch(`https://graph.facebook.com/v23.0/${META_PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${META_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: r.phone, type: "text", text: { body: BODY, preview_url: false } }),
    });
    const sj = await sendRes.json();
    if (!sendRes.ok) {
      status = "failed";
      err = `${sendRes.status}:${sj?.error?.code || ""}:${sj?.error?.message || JSON.stringify(sj)}`;
    } else {
      externalId = sj?.messages?.[0]?.id || null;
    }
  } catch (e) {
    status = "failed";
    err = String(e?.message || e);
  }

  // Log to messages table (only if we have a contact + it sent)
  if (contactId && status === "sent") {
    try {
      await rest("messages", {
        method: "POST",
        body: JSON.stringify({
          contact_id: contactId, channel: "whatsapp", direction: "out", body: BODY,
          handled_by: "sasa", status: "sent", external_id: externalId, account: "Nisria", sender_type: "agent",
        }),
      });
    } catch {}
  }

  results.push({ first: r.first, phone: r.phone, contactId: contactId || "(none)", status, externalId, err });
  console.log(`${r.first.padEnd(8)} ${r.phone.padEnd(13)} ${status.toUpperCase()}${externalId ? " id=" + externalId : ""}${err ? " ERR=" + err : ""}`);
}

// Audit event with the full result set
await rest("events", {
  method: "POST",
  body: JSON.stringify({
    type: "sasa.maintenance_notice_sent",
    source: "ops:maintenance",
    actor: "system",
    subject_type: "broadcast",
    subject_id: "dm_interactors",
    payload: { date: "2026-06-25", sent: results.filter(r => r.status === "sent").length, failed: results.filter(r => r.status === "failed").length, results },
  }),
});

const ok = results.filter(r => r.status === "sent").length;
const bad = results.filter(r => r.status === "failed").length;
console.log("---");
console.log(`SENT ${ok}/8   FAILED ${bad}/8`);
if (bad) console.log("Failures:", results.filter(r => r.status === "failed").map(r => `${r.first}(${r.err})`).join(", "));
console.log("done.");
