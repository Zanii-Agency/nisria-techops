-- Spec 004 / ADR-0019 — RLM grounding: pinned always-on core.
-- The wholesale grounding arm now loads only PINNED org_facts (+ non-fact grounding
-- kinds); non-pinned facts are reached by the query-relevance arm (90/92 embedded,
-- 92/92 tsv). Pins are the org-identity dossier, curated, not auto-inferred.
alter table agent_memory add column if not exists pinned boolean not null default false;

-- Seed: the org_profile-linked dossier rows + the stable identity facts. Transient
-- operational facts (petty cash, event pricing, a specific proposal) are NOT pinned.
update agent_memory set pinned = true
where id in (select memory_id from org_profile where memory_id is not null)
   or (kind = 'org_fact' and (content ilike '%EIN 92-2509133%' or content ilike '%501(c)(3)%'
       or content ilike '%Kenya legal status%' or content ilike '%public-facing name is always Nisria%'));
update agent_memory set pinned = false
where pinned = true and (content ilike '%UNSEEN charges%' or content ilike '%petty cash%'
   or content ilike '%Java House Africa Partnership%');
