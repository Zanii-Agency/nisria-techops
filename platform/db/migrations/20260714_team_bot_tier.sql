-- Spec 003 / ADR-0018 — team capability tiers.
-- bot_tier widens the team allowlist for manager-level members. 'field' is the
-- default (fail-closed: any unresolved member is field). 'coordinator' additionally
-- unlocks update_beneficiary + edit/move/approve/decline_case. It NEVER unlocks any
-- money/donor/pay/roster/merge/delete tool (those stay admin at both gates + guard).
alter table team_members add column if not exists bot_tier text not null default 'field';

-- Seed the manager-level coordinators (owner decision 2026-07-14).
update team_members set bot_tier = 'coordinator'
where name in ('Cynthia Mwangi', 'Linda Ojuok', 'Dorcas Njambi');
