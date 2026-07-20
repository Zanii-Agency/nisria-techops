# Spec 003 — Team Capability Tiers (field / coordinator)

**Status:** building · **Owner:** Taona (owner sign-off, per sasa.ts:1186 wall) · **Date:** 2026-07-14

## Problem
The bot has two permission tiers: `admin` (Nur/Taona) and `team` (any roster member with
`bot_access`). The team tier is a single flat allowlist. Nur's field team needs to actually
operate from WhatsApp (direct 727 line + the group), but the current team tier cannot:
send files, update inventory, or update beneficiary/case records. Opening all of that to
every access-holder (including tailors) over-exposes child-safeguarding PII. We need a
middle tier that is scoped by role.

## Outcome (measurable)
- A `field` member can: message a colleague + Nur (already wired), **send a file** to a
  colleague or Nur, **add + update inventory** (from direct line AND the group), add an
  intake, manage their tasks/calendar/contacts.
- A `coordinator` (manager-level: Cynthia, Linda, Dorcas) can additionally: **update a
  beneficiary**, **edit / move / approve / decline a case**.
- Neither tier can EVER see or set a money/donor/pay figure, list the full beneficiary
  roster, merge/delete a case or beneficiary, set public profile, or set funding. The
  audit's money/donor/pay walls stay exactly as verified.
- Success = re-running the team-wall audit shows: field gains exactly {send_file_to_person,
  update_inventory_item, list_inventory}; coordinator additionally gains exactly
  {update_beneficiary, edit_case, move_case, approve_case, decline_case}; admin unchanged;
  every forbidden money/donor/pay/roster/merge/delete tool still BLOCKED at both gates and
  at the internal guard for both new tiers.

## Design
`coordinator` is NOT a new top-level tier. It is `team` tier **plus** extra tools. All PII
walls key on `tier === "team"` (money/donor/pay grounding-strip, specialist walls); keeping
coordinators as `team` means every existing money wall protects them for free. Only the tool
allowlist widens.

Single source of truth: `teamSafeTools(cap)` in `lib/agents/manifests/index.ts`. Both live
gates consume it so they cannot drift:
- `getToolsForDomain(domain, tier, cap)` (mesh `allowedToolNames`).
- the engine `roleBase` filter in `sasa.ts` (1438/2038/2112).
Effective team scope = `roleBase ∩ allowedToolNames`; both now cap-aware.

Per-member grant: new column `team_members.bot_tier` ('field' default | 'coordinator').
`operatorOf()` returns it; worker + group ingress thread it as `teamCap` into the agent.
Admin-only tool `set_bot_tier` lets Nur promote/demote ("make Linda a coordinator").

Defense in depth: the internal guards on update_beneficiary (3316), the edit_case group
(3490), and the approve_case group (3571) are relaxed to allow ONLY coordinator, and ONLY
for the named-safe tools — merge_case, delete_case, set_public_profile, set_beneficiary_funding
stay `team`-blocked even for coordinators, regardless of allowlist.

## Scope
IN: the two new tiers, the column, `set_bot_tier`, both gates cap-aware, internal guard
carve-outs, system-prompt rewrite (727 block + specialist team wall) so the model knows what
each tier can do, group ingress cap resolution.
OUT (non-goals): message_person to outside contacts (still admin), post_to_group (admin),
any finance/donor/pay tool (admin), list_beneficiaries bulk roster (admin), merge/delete of
any record (admin), a UI for tier management.

## User flow
1. Nur (admin): "make Cynthia a coordinator" → set_bot_tier → bot_tier='coordinator'.
2. Cynthia (727 or group): "update Amina's case, needs updated to school fees" → edit_case runs.
3. Mark (field, 727 or group): "send the registration cert to Nur" → send_file_to_person runs;
   Nur receives on WhatsApp. "add 5 to the tote bag stock" → update_inventory_item runs.
4. A tailor (field): "approve the Mwangi case" → refused, flagged to Nur.

## Golden test cases (EVAL)
Structural (getToolsForDomain + teamSafeTools):
1. field/comms WIRED send_file_to_person; BLOCKED message_person, post_to_group.
2. field/programs WIRED update_inventory_item, list_inventory, add_inventory_item.
3. field/people BLOCKED update_beneficiary, edit_case, approve_case.
4. coordinator/people WIRED update_beneficiary, edit_case, move_case, approve_case, decline_case.
5. coordinator/people BLOCKED list_beneficiaries, merge_case, delete_case, delete_beneficiary,
   set_public_profile, set_beneficiary_funding.
6. coordinator/money BLOCKED finance_summary, query_donations, lookup_donor, list_payroll,
   donor_activity (money wall holds for coordinator).
7. admin/* unchanged from pre-change snapshot.
Internal guard (runSmartTool):
8. update_beneficiary with tier team + cap field → ok:false "team tier".
9. update_beneficiary with tier team + cap coordinator → passes the guard (proceeds to lookup).
10. edit_case cap coordinator → passes; merge_case cap coordinator → blocked; set_beneficiary_funding
    cap coordinator → blocked.
Behavioral (offline runOrchestrated, reads/inventory only — never messaging real people):
11. team+coordinator "update the tote bag stock to 12" → update_inventory_item fires (tag SOAKTEST, revert).
12. team+field "approve the X case" → refused, no case tool.
