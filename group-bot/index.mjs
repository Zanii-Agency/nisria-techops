// Nisria WhatsApp GROUP userbot. A thin transport, not a brain.
//
// It links a dedicated WhatsApp number (QR scan, once), sits in the team groups,
// and for every group message: forwards {group, sender, text} to the platform's
// /api/group/ingest (the ONE brain, runSasa group mode), which stores it, updates
// the portal, and decides whether to reply. Any reply text returned is posted
// back to the group. No brain logic lives here on purpose, so this box stays
// replaceable and the brain stays single-sourced.
//
// Env:
//   PLATFORM_URL      e.g. https://command.nisria.co
//   GROUP_BOT_SECRET  shared secret, must match the platform env
//   AUTH_DIR          where the WhatsApp session persists (Railway volume, e.g. /data/auth)
//   GROUP_ALLOWLIST   optional comma-separated group-name substrings; empty = all groups
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import pino from "pino";

const PLATFORM_URL = (process.env.PLATFORM_URL || "").replace(/\/$/, "");
const SECRET = process.env.GROUP_BOT_SECRET || "";
const AUTH_DIR = process.env.AUTH_DIR || "./auth";
const ALLOW = (process.env.GROUP_ALLOWLIST || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const log = pino({ level: process.env.LOG_LEVEL || "info" });

if (!PLATFORM_URL || !SECRET) {
  log.error("PLATFORM_URL and GROUP_BOT_SECRET are required");
  process.exit(1);
}

const subjectCache = new Map(); // jid -> group subject

function textOf(m) {
  const mm = m.message || {};
  return (
    mm.conversation ||
    mm.extendedTextMessage?.text ||
    mm.imageMessage?.caption ||
    mm.videoMessage?.caption ||
    mm.documentMessage?.caption ||
    ""
  ).trim();
}

async function groupName(sock, jid) {
  if (subjectCache.has(jid)) return subjectCache.get(jid);
  try {
    const meta = await sock.groupMetadata(jid);
    subjectCache.set(jid, meta.subject || jid);
    return meta.subject || jid;
  } catch {
    return jid;
  }
}

async function ingest(payload) {
  try {
    const r = await fetch(`${PLATFORM_URL}/api/group/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-group-secret": SECRET },
      body: JSON.stringify(payload),
    });
    if (!r.ok) { log.warn({ status: r.status }, "ingest non-200"); return { reply: "" }; }
    return await r.json();
  } catch (e) {
    log.error({ err: e?.message }, "ingest failed");
    return { reply: "" };
  }
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({ version, auth: state, logger: pino({ level: "silent" }), printQRInTerminal: false, markOnlineOnConnect: false });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) {
      log.info("Scan this QR with the Nisria GROUP WhatsApp number (Linked Devices):");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "open") log.info("connected. listening to team groups.");
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      log.warn({ code, loggedOut }, "connection closed");
      if (!loggedOut) setTimeout(start, 3000); // reconnect unless the session was revoked
      else log.error("logged out. delete AUTH_DIR and re-scan the QR.");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const m of messages) {
      try {
        const jid = m.key?.remoteJid || "";
        if (!jid.endsWith("@g.us")) continue;        // groups only (1:1 belongs to the Cloud API number)
        if (m.key?.fromMe) continue;                 // ignore our own posts
        const text = textOf(m);
        if (!text) continue;

        const name = await groupName(sock, jid);
        if (ALLOW.length && !ALLOW.some((a) => name.toLowerCase().includes(a))) continue; // not an allowed group

        const participant = (m.key?.participant || "").split("@")[0]; // sender phone in a group
        if (!participant) continue;

        const { reply } = await ingest({
          group: name,
          sender_phone: participant,
          sender_name: m.pushName || null,
          text,
          message_id: m.key?.id || "",
        });

        if (reply && reply.trim()) {
          await sock.sendMessage(jid, { text: reply.trim() });
          log.info({ group: name }, "replied");
        }
      } catch (e) {
        log.error({ err: e?.message }, "message handler error");
      }
    }
  });
}

start().catch((e) => { log.error({ err: e?.message }, "fatal"); process.exit(1); });
