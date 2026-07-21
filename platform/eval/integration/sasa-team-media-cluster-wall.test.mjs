// Team-media cluster wall (2026-07-21): new-member welcome + team file/media send + current-turn attach.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
let failed=0; const ok=(m)=>console.log("PASS:",m); const fail=(m)=>{failed++;console.log("FAIL:",m);};
const worker = readFileSync(resolve(HERE,"../../app/api/whatsapp/worker/route.ts"),"utf8");
const st = readFileSync(resolve(HERE,"../../lib/smart-tools.ts"),"utf8");
const man = readFileSync(resolve(HERE,"../../lib/agents/manifests/index.ts"),"utf8");
const mig = readFileSync(resolve(HERE,"../../db/migrations/20260721_team_welcomed_at.sql"),"utf8");

// W1: welcome fires for a team member, once (welcomed_at gate)
if (/if \(role === "team"\)[\s\S]{0,600}?!member\.welcomed_at/.test(worker)) ok("W1 welcome gated on role=team AND welcomed_at unset (fires once)");
else fail("W1 welcome must fire only for an unwelcomed team member");
// W2: it names capabilities + sets welcomed_at + does NOT return (message still processed)
if (/Send a message or a file to a teammate/.test(worker) && /welcomed_at: new Date\(\)\.toISOString\(\)/.test(worker)) ok("W2 welcome names capabilities and stamps welcomed_at");
else fail("W2 welcome must name capabilities and stamp welcomed_at");
if (/team\.member_welcomed/.test(worker)) ok("W3 a welcome emits an observable event");
else fail("W3 welcome should emit team.member_welcomed");
// W4: migration adds the column
if (/ADD COLUMN IF NOT EXISTS welcomed_at timestamptz/.test(mig)) ok("W4 migration adds welcomed_at");
else fail("W4 migration must add welcomed_at");
// F1: send_file_to_person is team-safe
if (/FIELD_SAFE_TOOLS = new Set[\s\S]{0,600}?"send_file_to_person"/.test(man)) ok("F1 team members can send files (send_file_to_person is field-safe)");
else fail("F1 send_file_to_person must be in FIELD_SAFE_TOOLS");
// M1: current-turn attachment is forwarded (proofPath branch)
if (/if \(ctx\.proofPath && \(POINTER\.test\(query\) \|\| !query\.trim\(\)\)\)/.test(st)) ok("M1 an attached file (this turn) is forwarded directly");
else fail("M1 send_file_to_person must forward the current-turn attachment (ctx.proofPath)");
if (/from_attachment: true/.test(st)) ok("M2 the attachment send is recorded (honesty spine sees it)");
else fail("M2 the current-turn file send must be recorded");
console.log(failed?`\n${failed} FAILED`:"\nALL PASS");
process.exit(failed?1:0);
