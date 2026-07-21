// Perpetual people-memory wall (2026-07-22). Operator: the bot asked "who is Jensen" when Nur
// works with Jensen and has mentioned him — the bot must have perpetual memory of the people it
// works with. Root cause: add_contact REQUIRES a phone/email, so a name-only person Nur only
// MENTIONS (Jensen) could never be saved, and the bot re-asked every time. remember_person saves
// a name-only lightweight contact (findable by lookup_contact) + who-they-are to the Brain.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
let failed = 0;
const ok = (m) => console.log("PASS:", m);
const fail = (m) => { failed++; console.log("FAIL:", m); };
const st = readFileSync(resolve(HERE, "../../lib/smart-tools.ts"), "utf8");
const mf = readFileSync(resolve(HERE, "../../lib/agents/manifests/index.ts"), "utf8");
const sasa = readFileSync(resolve(HERE, "../../lib/agents/sasa.ts"), "utf8");

// P1: the handler saves a NAME-ONLY contact (no phone/email needed) so a mentioned person is
// findable by lookup_contact next time — the exact thing add_contact could not do.
if (/name === "remember_person"/.test(st)
    && /from\("contacts"\)\.insert\(\{ name: pname, channel: "mentioned" \}\)/.test(st))
  ok("P1 remember_person saves a name-only lightweight contact (no phone required)");
else fail("P1 remember_person must save a name-only contact so lookup_contact finds them");
// P2: idempotent — never duplicates someone already on file (contacts/team/beneficiaries).
if (/db\.from\("beneficiaries"\)\.select\("id,full_name"\)\.ilike\("full_name", like\)/.test(st)
    && /const existing = \(\(c as any\)\.data\?\.\[0\]\) \|\| \(\(t as any\)\.data\?\.\[0\]\) \|\| \(\(b as any\)\.data\?\.\[0\]\)/.test(st)
    && /if \(existing\) return \{ ok: true/.test(st))
  ok("P2 remember_person is idempotent (dedups against contacts/team/beneficiaries)");
else fail("P2 remember_person must not duplicate a person already on file");
// P3: who-they-are is written to the Brain so grounding knows them next time.
if (/remember\(\{ kind: "person", title: pname/.test(st))
  ok("P3 the relationship is stored in the Brain (grounding recalls who they are)");
else fail("P3 remember_person must save the relationship to the Brain");
// P4: reachable everywhere + by team — cross-cutting AND field-safe.
if (/CROSS_CUTTING_TOOLS[\s\S]*?"remember_person"/.test(mf) && /FIELD_SAFE_TOOLS[\s\S]*?"remember_person"/.test(mf))
  ok("P4 remember_person is cross-cutting + field-safe (every lane and team can capture)");
else fail("P4 remember_person must be in CROSS_CUTTING_TOOLS and FIELD_SAFE_TOOLS");
// P5: the prompt tells the bot to remember unresolved people and ask 'who is X' at most once.
if (/PERPETUAL PEOPLE-MEMORY/.test(sasa) && /call remember_person to save them/.test(sasa) && /at MOST once/.test(sasa))
  ok("P5 the roster prompt instructs remember_person + ask 'who is X' at most once");
else fail("P5 the prompt must instruct the bot to remember_person unresolved people, ask once");

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
