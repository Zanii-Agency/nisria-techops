// Law 12 dev-ping. Sends a test message through the chokepoint's dev branch:
// rerouted to the developer phone (DEV_PHONE env, fallback Taona +971 50 116
// 8462), not persisted to the `messages` table, no medic dispatch, no audit
// event. Use this instead of poking the WhatsApp Graph API directly so the
// test exercises the real chokepoint (sanitiser, send-helper) end-to-end.
//
// Usage:
//   node scripts/dev-ping.mjs "your test message here"
//
// Loads .env.local automatically. Exits non-zero if the send fails.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq < 0) continue;
  const k = line.slice(0, eq).trim();
  const v = line.slice(eq + 1).trim().replace(/^"|"$/g, "");
  if (!(k in process.env)) process.env[k] = v;
}

const body = process.argv.slice(2).join(" ") || `SMOKE TEST at ${new Date().toISOString()}.`;

const token = process.env.WHATSAPP_TOKEN || process.env.META_WABA_TOKEN;
const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.META_PHONE_NUMBER_ID;
if (!token || !phoneId) {
  console.error("missing WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID in .env.local");
  process.exit(2);
}

const dev = (process.env.DEV_PHONE || "971501168462").replace(/\D/g, "");

const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({
    messaging_product: "whatsapp",
    to: dev,
    type: "text",
    text: { body: `[DEV] ${body}` },
  }),
});
const j = await res.json();
console.log(JSON.stringify(j, null, 2));
if (!res.ok || !j?.messages?.[0]?.id) process.exit(1);
