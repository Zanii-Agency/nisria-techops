import { readFileSync, writeFileSync } from "node:fs";
const FILE = new URL("../lib/agents/sasa.ts", import.meta.url).pathname;
let src = readFileSync(FILE, "utf8");
const NAMES = ["claimsCompletionWithoutSuccess","_SASA_COMPLETION_GUARD","claimsSingularEditWithoutSuccess","extractPluralClaimCount","claimsPluralCompletionMismatch","claimedPeople","deniesSendThatHappened","claimsSendWithoutSend","claimsUnverifiedSendState","recentlySentTo","extractPluralSendClaim","claimsPluralSendMismatch","claimsSequentialSendMismatch","claimsToolResultMismatch","completedButOnlyStaged","extractClaimedRecipients","sentRecipientNames","postedGroupsThisTurn","readMatchesPerson","joinNames"];
const codeRefs = (name) => src.split("\n").filter((l) => {
  const c = l.replace(/\/\/.*$/, ""); // strip trailing comments
  return new RegExp(`\\b${name}\\b`).test(c) && !new RegExp(`^\\s*(export )?(async )?function ${name}\\(`).test(c);
}).length;
function removeFn(name) {
  const m = src.match(new RegExp(`^(export )?(async )?function ${name}\\(`, "m"));
  if (!m) return "no-def";
  if (codeRefs(name) > 0) return `KEPT ${codeRefs(name)} code refs`;
  const defIdx = src.indexOf(m[0]);
  const lines = src.slice(0, defIdx).split("\n");
  let k = lines.length - 1;
  while (k > 0 && /^\s*\/\//.test(lines[k - 1])) k--;
  const start = lines.slice(0, k).join("\n").length + (k > 0 ? 1 : 0);
  const braceStart = src.indexOf("{", defIdx);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) { if (src[i] === "{") depth++; else if (src[i] === "}") { depth--; if (!depth) { i++; break; } } }
  while (src[i] === "\n") i++;
  src = src.slice(0, start) + src.slice(i);
  return "removed";
}
for (let p = 0; p < 6; p++) { let ch = false; for (const n of NAMES) { const r = removeFn(n); if (r === "removed") { console.log(`${n}: removed`); ch = true; } else if (!p) console.log(`${n}: ${r}`); } if (!ch) break; }
writeFileSync(FILE, src);
console.log("chars now:", src.length);
