// Capability reachability wall (2026-07-20, second pass of the same incident).
//
// THE MEASUREMENT THIS PINS. A 91-phrase corpus of real operator phrasings was
// routed through PRODUCTION routeMessage (routeOnly, no side effects) and each
// result checked against the tools the winning lane actually holds. 32 of 91
// (35%) dead-ended: the request landed in a lane that did not carry the tool
// needed to answer, so the bot deflected while the tool sat one lane over.
//
// Broken for EVERY tier (Nur, field, coordinator) were exactly the two things the
// operator reported:
//   create_task  "tell dorcas to send me the report by friday"   -> comms (1.00)
//   team_detail  "who all can actually use this bot now"          -> general
//   team_detail  "who's handling the ahadi delivery"              -> work
//   list_tasks   "sort out the eunice thing pls"                  -> people
//
// The confusion spanned 23 distinct lane pairs with no dominant pair, which is why
// the fix is NOT a pile of router patterns. Two structural moves instead:
//   1. READS are cross-cutting. A question is not a domain action, and a read
//      cannot corrupt state, so it should be answerable from whichever lane
//      catches the turn.
//   2. WRITES stay domain-scoped. Exactly one write pattern was added, for the
//      delegation class, which is high-frequency and unambiguous.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
let failed = 0;
const ok = (m) => console.log(`PASS: ${m}`);
const fail = (m) => { failed++; console.log(`FAIL: ${m}`); };

const { CROSS_CUTTING_TOOLS, getToolsForDomain, TOOL_TO_DOMAIN } = await import("../../lib/agents/manifests/index.ts");
const { scoreDomains } = await import("../../lib/agents/router-patterns.ts");
const manifestsSrc = readFileSync(resolve(HERE, "../../lib/agents/manifests/index.ts"), "utf8");

const DOMAINS = ["work", "money", "people", "comms", "knowledge", "programs", "library", "general"];
const fastLane = (t) => {
  const [a, b] = scoreDomains(t);
  return a && a.score >= 1.5 && (!b || a.score - b.score >= 0.8) ? a.domain : null;
};

// ---- R1: the reads that dead-ended are now reachable from EVERY lane ----
{
  const MUST = ["team_detail", "list_team", "list_tasks", "member_activity", "group_activity",
                "inbox_status", "show_draft", "read_document", "list_grants", "query_memory",
                "list_learned", "list_wishlist", "newest_donor"];
  const missing = MUST.filter((t) => !CROSS_CUTTING_TOOLS.has(t));
  if (!missing.length) ok(`R1 all ${MUST.length} audited read tools are cross-cutting`);
  else fail(`R1 not cross-cutting: ${missing.join(", ")}`);
}

// ---- R2: BEHAVIOURAL. Every admin lane can answer the roster question ----
// This is the exact question Nur was refused on 2026-07-20, in four phrasings that
// landed in four different lanes. Whichever lane catches it must be able to answer.
{
  const bad = DOMAINS.filter((d) => !getToolsForDomain(d, "admin", "field").includes("team_detail"));
  if (!bad.length) ok("R2 every admin lane can answer 'who has access to the bot'");
  else fail(`R2 lanes that still cannot answer the roster question: ${bad.join(", ")}`);
}

// ---- R3: BEHAVIOURAL. Team tiers keep the same reachability ----
// The operator's requirement was explicitly "for selected team members, and her as
// well". team_detail and list_tasks are team-safe, so a coordinator asking the same
// question must not dead-end either.
{
  const bad = [];
  for (const tier of [["team", "field"], ["team", "coordinator"]])
    for (const d of DOMAINS)
      for (const t of ["team_detail", "list_tasks"])
        if (!getToolsForDomain(d, tier[0], tier[1]).includes(t)) bad.push(`${tier[1]}/${d}/${t}`);
  if (!bad.length) ok("R3 team field + coordinator reach team_detail and list_tasks from every lane");
  else fail(`R3 team-tier dead-ends remain: ${bad.slice(0, 6).join(", ")}`);
}

// ---- R4: THE DURABLE INVARIANT. Cross-cutting stays READ-ONLY ----
// This is the check that matters in six months. Widening a read is safe; widening a
// WRITE hands every lane the ability to mutate another domain's state and quietly
// dissolves the isolation model the S2 walls exist to protect. Four non-reads are
// blessed by name; anything else joining the set must fail here and be argued for.
{
  const BLESSED = new Set(["remember_fact", "remember_person", "flag_for_clarity", "create_letterhead_doc", "lookup_contact", "agent_activity", "search_history"]);
  const READ = /^(list_|read_|search_|query_|find_|get_|show_|lookup_|team_detail$|member_activity$|group_activity$|inbox_status$|newest_donor$)/;
  const offenders = [...CROSS_CUTTING_TOOLS].filter((t) => !BLESSED.has(t) && !READ.test(t));
  if (!offenders.length) ok("R4 CROSS_CUTTING_TOOLS contains only reads plus the blessed exceptions");
  else fail(`R4 non-read tool(s) added to CROSS_CUTTING_TOOLS: ${offenders.join(", ")} — a write must not be cross-cutting`);
}

// ---- R5: the deliberate exclusion holds ----
// get_credential also misrouted in the audit and was deliberately NOT widened: it
// reveals vault secrets and emits resource.secret_revealed. Where a secret can be
// requested is a security decision, not a routing fix.
{
  if (!CROSS_CUTTING_TOOLS.has("get_credential")) ok("R5 get_credential is still NOT cross-cutting (deliberate)");
  else fail("R5 get_credential must not be cross-cutting: widening secret retrieval needs its own decision");
  if (/DELIBERATELY EXCLUDED: get_credential/.test(manifestsSrc)) ok("R5b the exclusion is documented at the source");
  else fail("R5b the get_credential exclusion must stay documented so it is not silently reversed");
}

// ---- R6: delegation routes to work, not comms ----
{
  const cases = [
    "tell dorcas to send me the report by friday",
    "can you just let linda know the feeding programme numbers are due monday",
    "ask cynthia to sort the october receipts by tomorrow",
  ];
  const bad = cases.filter((c) => fastLane(c) !== "work");
  if (!bad.length) ok("R6 delegation with a deadline fast-lanes to work (a task, not a message)");
  else fail(`R6 delegation still not routed to work: ${bad.join(" | ")}`);
}

// ---- R7: genuine messaging is NOT dragged into work ----
// The delegation patterns require a person-directed instruction AND a deadline.
// A plain relay must be untouched, or the fix trades one misroute for another.
{
  const cases = ["tell dorcas the meeting moved", "message Cynthia and tell her the meeting moved", "tell taona the payment thing is still broken"];
  const bad = cases.filter((c) => fastLane(c) === "work");
  if (!bad.length) ok("R7 plain messaging is not captured by the delegation patterns");
  else fail(`R7 genuine messaging wrongly routed to work: ${bad.join(" | ")}`);
}

// ---- R8: no duplicate tool names handed to the model ----
// A tool may sit in both its owning manifest and the cross-cutting set. Sending the
// same name twice is noise the model has to reconcile.
{
  const dupes = [];
  for (const d of DOMAINS) {
    const t = getToolsForDomain(d, "admin", "field");
    if (t.length !== new Set(t).size) dupes.push(d);
  }
  if (!dupes.length) ok("R8 no lane hands the model a duplicated tool name");
  else fail(`R8 duplicate tool names in: ${dupes.join(", ")}`);
}

// ---- R9: widening did not break the leakage index ----
// TOOL_TO_DOMAIN must exclude cross-cutting tools, or the runtime guard will start
// reporting a legitimate cross-lane read as domain leakage.
{
  const leaked = [...CROSS_CUTTING_TOOLS].filter((t) => TOOL_TO_DOMAIN[t]);
  if (!leaked.length) ok("R9 cross-cutting tools stay out of TOOL_TO_DOMAIN (no false leakage alerts)");
  else fail(`R9 cross-cutting tool(s) present in TOOL_TO_DOMAIN: ${leaked.join(", ")}`);
}

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
