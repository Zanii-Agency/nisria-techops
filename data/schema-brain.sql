-- =============================================================
-- Nisria Command Center — PHASE 2: "The Brain" (org onboarding profile)
-- Idempotent. Deploy via Supabase Management API.
--
-- org_profile   one row PER SECTION of the onboarding brain. Each section saves
--               independently and is re-editable from Settings. A free-text body
--               (content) plus optional structured items (data jsonb, e.g. a
--               timeline of key events). Mirrored into agent_memory (kind
--               'org_fact' / 'brand_voice') so the EXISTING recall() surfaces it.
--
-- Why a per-section table (not one big row / not only agent_memory rows):
--  - independent autosave per section + clean "completeness" query
--  - editing a section overwrites in place (no duplicate brain facts)
--  - agent_memory stays the retrieval index; org_profile is the editable source
-- =============================================================

create table if not exists org_profile (
  id          uuid primary key default gen_random_uuid(),
  section     text unique not null,             -- overview | programs | events | losses | assets | people | voice | other
  content     text default '',                  -- the warm free-text body Nur types
  data        jsonb default '{}'::jsonb,         -- optional structured items (e.g. {"items":[{"what":"","when":""}]})
  memory_id   uuid,                              -- link to the agent_memory row this section feeds
  updated_by  text,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists org_profile_section_idx on org_profile (section);

alter table org_profile enable row level security;

-- Let the embedder seam fill embeddings later without a schema change: the
-- agent_memory.embedding column already exists (vector(1536), nullable) in the
-- spine schema, so remember() can populate it the day a key is configured. No
-- DDL needed here for that; this comment documents the seam.
