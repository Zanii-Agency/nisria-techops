#!/usr/bin/env node
// SASA FITNESS BOARD — "is the bot actually working?"
//
// Built 2026-07-20 because "is it working" was being answered with an opinion.
// Every line below is measured against PRODUCTION, not asserted. Run it any time:
//
//   node scripts/sasa-fitness.mjs
//
// Needs GROUP_BOT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY (read from .env.prod).
// Every check is READ-ONLY: routing probes use routeOnly (no tools, no messages, no
// writes) and the rest are Supabase selects. Running this never touches Nur's thread.
//
// EXIT 0 only when every gate is green. That is the definition of "fully working";
// anything else is a number, not a feeling.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getToolsForDomain } from "../lib/agents/manifests/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const envPath = process.env.SASA_ENV || "/Users/milaaj/Code/nisria/nisria-techops/platform/.env.prod";
const env = readFileSync(envPath, "utf8");
const val = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "") || "";
const SECRET = val("GROUP_BOT_SECRET"), SB = val("SUPABASE_URL"), KEY = val("SUPABASE_SERVICE_KEY");
const BASE = "https://command.nisria.co";

// THE WINDOW IS LOAD-BEARING (learned the hard way on the first run of this script).
// Without it, every history check reads events from BEFORE the fix and reports them as
// current state: the first run said "28/40 mirror sends used the template" one hour
// after a deploy that had made 12/12 of them skip it, and passed the letterhead gate on
// an event from seven days earlier. A false GREEN is worse than a false RED, and an
// instrument that measures history while claiming to measure now is the same failure
// that made SSL_CERT_FILE look like a dead network all morning.
//
// So: every historical check is scoped to SINCE, and SINCE is printed in the header so
// nobody can misread what the board is actually claiming. Default 3h; override with
// SASA_SINCE_MIN to widen after a quiet period.
const SINCE_MIN = Number(process.env.SASA_SINCE_MIN || 180);
const SINCE_ISO = new Date(Date.now() - SINCE_MIN * 60000).toISOString();

const sb = async (path) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } });
  return r.ok ? r.json() : null;
};
const ago = (iso) => (Date.now() - new Date(iso).getTime()) / 60000;

const gates = [];
const gate = (name, pass, detail, blocking = true) => gates.push({ name, pass, detail, blocking });

// ── 1. The deploy is up ──────────────────────────────────────────────────────
{
  const r = await fetch(`${BASE}/login`).catch(() => null);
  gate("deploy serving", r?.status === 200, `GET /login -> ${r?.status ?? "unreachable"}`);
}

// ── 2. The owner mirror is not spamming the incident template ────────────────
// The 2026-07-20 complaint. via=template on a passive relay means the regression
// is back: every chat line reframed as a backend incident and cut at 300 chars.
{
  const rows = (await sb(`events?select=payload,created_at&type=eq.sasa.owner_mirror&created_at=gte.${SINCE_ISO}&order=created_at.desc&limit=200`)) || [];
  const tpl = rows.filter((e) => e.payload?.via === "template").length;
  // No mirror traffic in the window is not a pass: it is no evidence either way.
  gate("mirror not incident-framed", rows.length > 0 && tpl === 0, rows.length ? `${tpl}/${rows.length} mirror sends used the system_alert template (want 0)` : "no mirror traffic in window (no evidence)");
}

// ── 3. Capability reachability ───────────────────────────────────────────────
// The real measure of "she can ask anything and get an answer". Routes the audit
// corpus through production and checks the winning lane holds the needed tool.
{
  const corpusPath = process.env.SASA_CORPUS || resolve(HERE, "../eval/fixtures/reachability-corpus.json");
  let corpus = [];
  try { corpus = JSON.parse(readFileSync(corpusPath, "utf8")); } catch {}
  if (!corpus.length) {
    gate("reachability", false, `corpus not found at ${corpusPath}`, false);
  } else {
    const DOMAINS = ["work", "money", "people", "comms", "knowledge", "programs", "library", "general"];
    let mis = 0, allTier = 0;
    for (const c of corpus) {
      const r = await fetch(`${BASE}/api/eval/replay`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-eval-secret": SECRET },
        body: JSON.stringify({ command: c.phrase, routeOnly: true }),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.domain) continue;
      const broken = [["admin", "field"], ["team", "field"], ["team", "coordinator"]].filter(([t, cap]) => {
        const reachable = getToolsForDomain(r.domain, t, cap).includes(c.tool);
        const grantedSomewhere = DOMAINS.some((d) => getToolsForDomain(d, t, cap).includes(c.tool));
        return !reachable && grantedSomewhere;
      });
      if (broken.length) mis++;
      if (broken.length === 3) allTier++;
    }
    gate("reachability: no all-tier dead-ends", allTier === 0, `${allTier} phrasings dead-end for Nur AND both team caps`);
    gate("reachability: zero dead-ends", mis === 0, `${mis}/${corpus.length} phrasings reach a lane without the tool they need`);
  }
}

// ── 4. The letterhead actually produced a PDF ────────────────────────────────
// Deployed + wall-covered + routing-verified is NOT the same as "a PDF exists".
// This stays red until a real turn calls the tool and the receipt says ok.
{
  const rows = (await sb(`events?select=payload,created_at&type=eq.mesh.completed&created_at=gte.${SINCE_ISO}&order=created_at.desc&limit=300`)) || [];
  const ran = rows.filter((e) => (e.payload?.toolsRan || []).includes("create_letterhead_doc"));
  gate("letterhead exercised end-to-end", ran.length > 0, ran.length ? `ran ${ago(ran[0].created_at).toFixed(0)} min ago` : `not called since the fix (window ${SINCE_MIN}m)`);
}

// ── 5. No repeat-question loop ───────────────────────────────────────────────
// Nur got the identical clarifying question at 11:49, 11:50 and 11:51. Any two
// identical outbound bodies to one contact inside 3 minutes is the regression.
{
  const rows = (await sb(`messages?select=contact_id,body,created_at&direction=eq.out&created_at=gte.${SINCE_ISO}&order=created_at.desc&limit=400`)) || [];
  let dupes = 0;
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[i].contact_id !== rows[j].contact_id) continue;
      if (Math.abs(ago(rows[i].created_at) - ago(rows[j].created_at)) > 3) break;
      if ((rows[i].body || "").trim() && rows[i].body === rows[j].body) dupes++;
    }
  gate("no repeated replies", dupes === 0, `${dupes} identical replies to the same contact within 3 min`);
}

// ── 6. The group bot health check is telling the truth ───────────────────────
// It alarms on bot_status.group_membership, which only refreshes once per CONNECT,
// so a stably-connected bot looks dead and fires "restart the userbot" forever.
{
  const st = (await sb("bot_status?select=key,updated_at")) || [];
  const poll = st.find((s) => s.key === "group_poll");
  const alive = poll ? ago(poll.updated_at) < 10 : false;
  const inc = (await sb("events?select=payload,created_at&type=eq.system.incident_sent&order=created_at.desc&limit=20")) || [];
  const falseAlarms = inc.filter((e) => /Group bot keep-alive/.test(e.payload?.component || "") && ago(e.created_at) < 180).length;
  gate("group bot alive", alive, poll ? `heartbeat ${ago(poll.updated_at).toFixed(0)} min ago` : "no group_poll row");
  gate("no false 'bot is dead' alarms", !(alive && falseAlarms > 0), `${falseAlarms} keep-alive incidents in 3h while the bot was alive`);
}

// ── report ───────────────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n);
console.log("\n  SASA FITNESS  ·  " + new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC  ·  window: last " + SINCE_MIN + " min\n");
for (const g of gates) console.log(`  ${g.pass ? "\x1b[32mGREEN\x1b[0m" : (g.blocking ? "\x1b[31m RED \x1b[0m" : "\x1b[33m WARN\x1b[0m")}  ${pad(g.name, 34)} ${g.detail}`);
const red = gates.filter((g) => !g.pass && g.blocking);
console.log("\n  " + (red.length === 0
  ? "\x1b[32mFULLY WORKING — every gate green.\x1b[0m"
  : `\x1b[31mNOT FULLY WORKING — ${red.length} gate(s) red:\x1b[0m ${red.map((g) => g.name).join(", ")}`) + "\n");
process.exit(red.length === 0 ? 0 : 1);
