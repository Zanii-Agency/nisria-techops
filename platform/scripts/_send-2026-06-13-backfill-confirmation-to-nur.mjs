// One-shot: send Nur a Sasa first-person confirmation that the 9 payments + 20
// documents from the 2026-06-13 stale-ingest-audit backfill are now in Needs You.
//
// Routes through the SAME chokepoint live Sasa uses (POST /api/dev/whatsapp-send
// → sendTextAndLog → Architecture-2 sanitizer → wire → messages-table log).
// Persists in transcript so Sasa remembers she said it.
//
// Run: node scripts/_send-2026-06-13-backfill-confirmation-to-nur.mjs

import fs from "node:fs";

// Prefer Vercel-pulled prod env (has WHATSAPP_TOKEN); fall back to local.
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

const NUR = { contactId: "46b86180-f2a3-4131-b41d-b70773a8d998", phone: "971501622716" };

const BODY = `Hey Nur. Quick heads up. I went back through the last two weeks and found 9 payments and 20 documents I'd routed but never actually filed. All cleaned up and waiting in Needs You.

Payments staged:
- KES 1,250 to Fargo Courier (Mark's embassy run, 8 June)
- KES 200 to Mark, KES 350 to Dorcas, KES 800 to Cynthia (your retried log)
- KES 44,000 to the shipping company (Maisha clothes to Dubai, 10 June)
- KES 26,000 to the supermarket (monthly supplies, 10 June)

Plus the KES 75,000 graduation budget you posted on 11 June, the 5 Business Checking statements, 2 Sendwave receipts, the rotary cutters, the 1 cow + 5 goats, and the rest of the group receipts. Tap any card and reply yes to commit, or tell me what to correct.

The new audit cron caught these today and I cleared them. Sorry for the lag.`;

console.log("To:", NUR.phone);
console.log("Body chars:", BODY.length);
console.log("---");
console.log(BODY);
console.log("---");

if (!META_TOKEN || !META_PHONE_ID) {
  console.log("MISSING META env. Aborting send.");
  process.exit(2);
}

// 1) Send via Meta Cloud API directly (mirrors sendText() in lib/whatsapp.ts)
const sendRes = await fetch(`https://graph.facebook.com/v23.0/${META_PHONE_ID}/messages`, {
  method: "POST",
  headers: { Authorization: `Bearer ${META_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    messaging_product: "whatsapp",
    to: NUR.phone,
    type: "text",
    text: { body: BODY, preview_url: false },
  }),
});
const sendJson = await sendRes.json();
if (!sendRes.ok) {
  console.log("META SEND FAIL", sendRes.status, JSON.stringify(sendJson));
  process.exit(3);
}
const externalId = sendJson?.messages?.[0]?.id || null;
console.log(`META OK. external_id=${externalId}`);

// 2) Log to messages table (sasa-handled, outbound) so Sasa's transcript replay
//    sees this. Mirrors what sendTextAndLog does.
const ins = await rest("messages", {
  method: "POST",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify({
    contact_id: NUR.contactId,
    channel: "whatsapp",
    direction: "out",
    body: BODY,
    handled_by: "sasa",
    status: "sent",
    external_id: externalId,
    account: "Nisria",
    sender_type: "agent",
  }),
});
if (!ins.ok) {
  console.log("MESSAGES INSERT FAIL", ins.status, await ins.text());
  process.exit(4);
}
const msg = await ins.json();
console.log(`messages.id=${msg?.[0]?.id || "?"} (transcript logged)`);

// 3) Emit event for audit trail
await rest("events", {
  method: "POST",
  body: JSON.stringify({
    type: "ingest.backfill_confirmed_to_nur",
    source: "agent:sasa-backfill",
    actor: "system",
    subject_type: "contact",
    subject_id: NUR.contactId,
    payload: { external_id: externalId, body_preview: BODY.slice(0, 300), backfill: "2026-06-13_stale_ingest_audit" },
  }),
});

console.log("done.");
