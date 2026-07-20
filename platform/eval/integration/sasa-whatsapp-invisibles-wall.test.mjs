// WhatsApp invisibles wall (2026-07-01 Nur incident, root fix). WhatsApp injects
// zero-width invisibles (word-joiner U+2060, ZWSP/ZWNJ/ZWJ, bidi isolates, BOM)
// BETWEEN the bullet glyph and the text on bulleted lists ("•⁠  ⁠Java proposal").
// Every bullet regex that expects "• <space>" (parseTasks B/G, parsePayment,
// parseTaskOps) then fails to detect the list, and the message is mis-routed
// (Nur's "Set these tasks for today to me: ..." became a priority-change error).
// Fix: strip these code points ONCE at the worker's text seam so ALL downstream
// parsers + the brain see clean text. This wall pins (1) the seam strip exists,
// (2) it removes the invisibles, (3) a WhatsApp-bulleted list parses afterwards.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTasks } from "../../app/api/whatsapp/worker/parseTasks.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);

const ROUTE = readFileSync(resolve(HERE, "../../app/api/whatsapp/worker/route.ts"), "utf8");
// The exact strip used at the seam (mirror; kept in step with route.ts).
const strip = (s) => String(s || "").replace(/[​-‍⁠⁦-⁩﻿]/g, "");

// ---- I1: the worker strips invisibles at the text seam (anti-drift) ----
{
  // p.text is normalized where `const text` is declared. Assert a replace() runs
  // on p.text at that seam (byte-agnostic: we look for the shape, not the glyphs).
  if (!/const text:\s*string\s*=\s*String\(p\.text[^\n]*\)\.replace\(/.test(ROUTE))
    fail("I1 the worker must strip invisibles at the `const text` seam (String(p.text||'').replace(...))");
  else ok("I1 worker normalizes p.text at the seam");
}

// ---- I2: the strip removes the WhatsApp invisibles, keeps content ----
{
  const raw = "⁠Java​ proposal﻿";
  const clean = strip(raw);
  if (clean !== "Java proposal") fail(`I2 strip must remove invisibles only, got ${JSON.stringify(clean)}`);
  else ok("I2 strip removes invisibles, preserves visible text");
  // must NOT touch normal spaces, newlines, bullets, emoji
  const keep = "• a\n- b 🚀";
  if (strip(keep) !== keep) fail("I2b strip must not alter spaces/newlines/bullets/emoji");
  else ok("I2b strip leaves spaces, newlines, bullets, emoji intact");
}

// ---- I3: a WhatsApp-bulleted self list parses AFTER the seam strip ----
// (Nur's exact bytes; proves the class is fixed even via the generic self path.)
{
  const ROSTER = [{ id: "nur", name: "Nur M’nasria", phone: "971501622716", status: "active" }];
  const NUR_RAW = "Set these tasks for today to me:\n•⁠  ⁠Java proposal, this is urgent\n•⁠  ⁠⁠BHF proposal, this is urgent";
  const before = parseTasks({ body: NUR_RAW, team_members: ROSTER, sender_contact_id: "c", source_message_id: "m", sender_rank: "founder", sender_role: "admin", sender_team_member: ROSTER[0] });
  // With the seam strip applied (as the worker does), it must produce 2 clean tasks.
  const after = parseTasks({ body: strip(NUR_RAW), team_members: ROSTER, sender_contact_id: "c", source_message_id: "m", sender_rank: "founder", sender_role: "admin", sender_team_member: ROSTER[0] });
  const tAfter = (after && after.tasks) || [];
  if (tAfter.length !== 2) fail(`I3 a WhatsApp-bulleted list must create 2 tasks after the seam strip, got ${tAfter.length}`);
  else ok("I3 WhatsApp-bulleted self list -> 2 tasks after the seam strip");
  const titles = tAfter.map((t) => t.title);
  if (!titles.includes("Java proposal") || !titles.includes("BHF proposal"))
    fail(`I3b titles must be clean, got ${JSON.stringify(titles)}`);
  else ok("I3b titles are clean (no leading bullet glyph, no 'urgent' tail)");
}

if (process.exitCode) console.error("\nsasa-whatsapp-invisibles-wall: FAIL");
else console.log("\nsasa-whatsapp-invisibles-wall: ALL GREEN");
