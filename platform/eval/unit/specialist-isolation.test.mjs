// Specialist isolation tests — verifies each specialist cannot call tools
// outside its domain. Pure local, no DB, no network, no Anthropic.

import { MANIFESTS, getToolsForDomain, TOOL_TO_DOMAIN, CROSS_CUTTING_TOOLS } from "../../lib/agents/manifests/index.ts";

const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);

console.log("\n=== SPECIALIST ISOLATION TESTS ===\n");

// ---- S1: Each domain's tools are a subset of its manifest ----
{
  for (const [domain, manifest] of Object.entries(MANIFESTS)) {
    if (domain === "general") continue; // General uses cross-cutting only

    const adminTools = new Set(getToolsForDomain(domain, "admin"));
    const teamTools = new Set(getToolsForDomain(domain, "team"));

    // Admin tools should include all manifest tools + cross-cutting
    for (const tool of manifest.tools) {
      if (!adminTools.has(tool)) fail(`S1a ${domain} admin missing ${tool}`);
    }
    ok(`S1a ${domain} admin has all manifest tools`);

    // Cross-cutting tools should be in admin set
    for (const tool of CROSS_CUTTING_TOOLS) {
      if (!adminTools.has(tool)) fail(`S1b ${domain} admin missing cross-cutting ${tool}`);
    }
    ok(`S1b ${domain} admin has cross-cutting tools`);

    // Team tools should be a subset of admin tools
    for (const tool of teamTools) {
      if (!adminTools.has(tool)) fail(`S1c ${domain} team has tool ${tool} not in admin`);
    }
    ok(`S1c ${domain} team tools are subset of admin`);
  }
}

// ---- S2: No tool appears in multiple domain manifests (except cross-cutting) ----
{
  const toolToDomains = {};
  for (const [domain, manifest] of Object.entries(MANIFESTS)) {
    if (domain === "general") continue;
    for (const tool of manifest.tools) {
      if (CROSS_CUTTING_TOOLS.has(tool)) continue; // Cross-cutting allowed everywhere
      if (!toolToDomains[tool]) toolToDomains[tool] = [];
      toolToDomains[tool].push(domain);
    }
  }

  for (const [tool, domains] of Object.entries(toolToDomains)) {
    if (domains.length > 1) fail(`S2 tool ${tool} appears in multiple domains: ${domains.join(", ")}`);
  }
  ok("S2 no tool overlaps between domains (except cross-cutting)");
}

// ---- S3: TOOL_TO_DOMAIN reverse index is consistent with manifests ----
{
  for (const [tool, domain] of Object.entries(TOOL_TO_DOMAIN)) {
    if (CROSS_CUTTING_TOOLS.has(tool)) continue;
    const manifest = MANIFESTS[domain];
    if (!manifest || !manifest.tools.includes(tool)) {
      fail(`S3 ${tool} in index but not in ${domain} manifest`);
    }
  }
  ok("S3 TOOL_TO_DOMAIN index matches manifests");

  // Check the reverse: every non-cross-cutting tool in manifests is in the index
  for (const [domain, manifest] of Object.entries(MANIFESTS)) {
    if (domain === "general") continue;
    for (const tool of manifest.tools) {
      if (CROSS_CUTTING_TOOLS.has(tool)) continue;
      if (!TOOL_TO_DOMAIN[tool]) fail(`S3b ${tool} in ${domain} manifest but not in index`);
    }
  }
  ok("S3b all manifest tools are in TOOL_TO_DOMAIN index");
}

// ---- S4: Money WRITES are admin-only (team may have read-only/cross-cutting, never a money write) ----
{
  const moneyTeamTools = getToolsForDomain("money", "team");
  const MONEY_WRITES = ["record_payment", "update_payment", "delete_payment", "schedule_payment", "mark_payment_paid", "log_payout", "log_team_payment", "set_beneficiary_funding", "set_monthly_goal", "ingest_bank_email", "add_donor", "update_donor", "add_campaign", "update_campaign"];
  const leaked = moneyTeamTools.filter((t) => MONEY_WRITES.includes(t));
  if (leaked.length > 0) fail(`S4 money team must not have any write/payment tool, got ${leaked.join(", ")}`);
  else ok("S4 money writes are admin-only (team has none)");
}

// ---- S5: Comms domain is admin-only (team cannot send) ----
{
  const commsTeamTools = getToolsForDomain("comms", "team");
  // Spec 003: a field member CAN relay, flag, and send a filed file, but NEVER
  // message an arbitrary person, post to a group, or send a donor-facing draft.
  const FORBIDDEN_SEND = new Set(["message_person", "post_to_group", "draft_email", "draft_thank_you", "draft_all_thank_yous", "draft_post"]);
  const leaked = commsTeamTools.filter((t) => FORBIDDEN_SEND.has(t));
  if (leaked.length > 0) fail(`S5 comms team must not have message/post/draft send tools, got ${leaked.join(", ")}`);
  else ok("S5 comms team cannot message_person / post_to_group / draft (field send is file-only)");
  if (!commsTeamTools.includes("send_file_to_person")) fail("S5b comms field must be able to send_file_to_person (spec 003)");
  else ok("S5b comms field can send_file_to_person");

  // Spec 003 coordinator: gains case/beneficiary edits, but no money/roster/merge/delete.
  const coordPeople = getToolsForDomain("people", "team", "coordinator");
  for (const t of ["update_beneficiary", "edit_case", "move_case", "approve_case", "decline_case"])
    if (!coordPeople.includes(t)) fail(`S5c coordinator/people must have ${t}`); else ok(`S5c coordinator/people has ${t}`);
  for (const t of ["list_beneficiaries", "merge_case", "delete_case", "delete_beneficiary", "set_public_profile", "set_beneficiary_funding"])
    if (coordPeople.includes(t)) fail(`S5d coordinator/people must NOT have ${t}`); else ok(`S5d coordinator/people blocked ${t}`);
  const coordMoney = getToolsForDomain("money", "team", "coordinator");
  for (const t of ["finance_summary", "query_donations", "lookup_donor", "list_payroll", "donor_activity"])
    if (coordMoney.includes(t)) fail(`S5e coordinator money wall breached: ${t}`); else ok(`S5e coordinator/money blocked ${t}`);
  // field people cannot edit cases/beneficiaries
  const fieldPeople = getToolsForDomain("people", "team", "field");
  for (const t of ["update_beneficiary", "edit_case", "approve_case"])
    if (fieldPeople.includes(t)) fail(`S5f field/people must NOT have ${t}`); else ok(`S5f field/people blocked ${t}`);
}

// ---- S6: People domain PII wall (team cannot see pay/beneficiary funding) ----
{
  const peopleTeamTools = getToolsForDomain("people", "team");
  // Team can lookup contacts and see team roster, but not beneficiary funding
  // The PII wall is enforced in the tool implementations, not the tool list
  // This test verifies the tools are available; PII enforcement is in sasa.ts
  if (!peopleTeamTools.includes("lookup_contact")) fail("S6a people team missing lookup_contact");
  else ok("S6a people team has lookup_contact");

  if (!peopleTeamTools.includes("team_detail")) fail("S6b people team missing team_detail");
  else ok("S6b people team has team_detail (PII stripped in implementation)");
}

// ---- S7: Work domain team can create/complete tasks but not delete ----
{
  const workTeamTools = getToolsForDomain("work", "team");
  if (!workTeamTools.includes("create_task")) fail("S7a work team missing create_task");
  else ok("S7a work team has create_task");

  if (!workTeamTools.includes("complete_task")) fail("S7b work team missing complete_task");
  else ok("S7b work team has complete_task");

  if (workTeamTools.includes("delete_task")) fail("S7c work team should not have delete_task");
  else ok("S7c work team cannot delete tasks");
}

if (process.exitCode) console.error("\nWALL RED."); else console.log("\nWALL GREEN.");
