// sasa-memory-window-wall — Stage 3 anti-hallucination.
// Locks the widened memory window + the lookup-on-name rule so they cannot
// silently regress to the old 12/8 that made the bot guess named records from
// recall(). Source-seam string assertions (same style as the other seam walls);
// exit 0 iff every seam holds.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLATFORM = resolve(HERE, "..", "..");
const worker = readFileSync(resolve(PLATFORM, "app/api/whatsapp/worker/route.ts"), "utf8");
const sasa = readFileSync(resolve(PLATFORM, "lib/agents/sasa.ts"), "utf8");

let bad = 0;
const ok = (m) => console.log(`PASS: ${m}`);
const fail = (m) => { console.log(`FAIL: ${m}`); bad++; };

// M1: historyFor's DB pull is widened to 28 and the old 12 is gone. The
// `.select("direction,body,created_at")` line uniquely anchors the historyFor
// query, so we assert the .limit right after it.
const histQuery = worker.match(/select\("direction,body,created_at"\)[\s\S]{0,300}?\.limit\((\d+)\)/);
if (histQuery && Number(histQuery[1]) >= 24) ok(`M1 historyFor DB pull is ${histQuery[1]} (>=24)`);
else fail(`M1 historyFor must pull >=24 recent messages (found ${histQuery?.[1] ?? "none"})`);

// M2: the runSasa MODEL window keeps >=16 turns. The `let convo:` line is the
// unique anchor (resolveContact's own slice(-6) lookback is separate + fine).
const convoSlice = sasa.match(/let convo[\s\S]{0,120}?\.slice\(-(\d+)\)/);
if (convoSlice && Number(convoSlice[1]) >= 16) ok(`M2 runSasa convo window is -${convoSlice[1]} (>=16)`);
else fail(`M2 runSasa must keep >=16 turns in view (found -${convoSlice?.[1] ?? "none"})`);

// M3: the lookup-on-name hard rule is present in the system prompt.
if (/LOOK IT UP, DON'T GUESS/.test(sasa)) ok("M3 lookup-on-name rule present");
else fail("M3 system prompt must carry the LOOK IT UP, DON'T GUESS rule");

// M4: the rule names the concrete lookup tools, not just a vague 'search'.
if (/LOOK IT UP[\s\S]{0,600}?lookup_contact[\s\S]{0,200}?find_beneficiary/.test(sasa)) ok("M4 rule routes to lookup_contact + find_beneficiary");
else fail("M4 lookup rule must route named records to their concrete read tools");

console.log(`\nsasa-memory-window-wall: ${bad === 0 ? "PASS" : "FAIL"}`);
process.exit(bad === 0 ? 0 : 1);
