-- Memory curation lifecycle + entity graph + librarian run log.
-- Foundation for: the librarian cron (dedup/consolidation), the entity graph,
-- the fact lifecycle (supersede/needs_review/archive), and the query-memory window.
-- Idempotent: safe to re-run.

-- 1) Curation lifecycle columns on agent_memory.
alter table public.agent_memory add column if not exists status text not null default 'active';      -- active | superseded | needs_review | archived
alter table public.agent_memory add column if not exists topic text;                                 -- consolidation key (e.g. 'bank-statements:stanbic')
alter table public.agent_memory add column if not exists superseded_by uuid;                         -- canonical row after a merge
alter table public.agent_memory add column if not exists review_note text;                           -- why it needs review (conflicting values)
alter table public.agent_memory add column if not exists curated_at timestamptz;                     -- last librarian pass that touched it
create index if not exists idx_agent_memory_status on public.agent_memory(status);
create index if not exists idx_agent_memory_topic on public.agent_memory(topic) where topic is not null;

-- 2) match_memory: never surface non-active rows (superseded / needs_review / archived).
create or replace function public.match_memory(query_embedding vector, match_count integer default 6, filter_kinds text[] default null, exclude_kinds text[] default null)
 returns table(kind text, brand text, title text, content text, similarity double precision)
 language sql stable as $$
  select m.kind, m.brand, m.title, m.content,
         1 - (m.embedding <=> query_embedding) as similarity
  from agent_memory m
  where m.embedding is not null
    and coalesce(m.status, 'active') = 'active'
    and (filter_kinds is null or m.kind = any(filter_kinds))
    and (exclude_kinds is null or not (m.kind = any(exclude_kinds)))
  order by m.embedding <=> query_embedding
  limit match_count;
$$;

-- 3) Entity graph: canonical people / orgs / accounts / programs the org knows.
create table if not exists public.memory_entities (
  id uuid primary key default gen_random_uuid(),
  type text not null,            -- person | org | account | program | place | thing
  name text not null,
  aliases text[] not null default '{}',
  summary text,                  -- one-line who/what
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_memory_entities on public.memory_entities(type, lower(name));

create table if not exists public.memory_entity_links (
  memory_id uuid not null references public.agent_memory(id) on delete cascade,
  entity_id uuid not null references public.memory_entities(id) on delete cascade,
  primary key (memory_id, entity_id)
);
create index if not exists idx_mel_entity on public.memory_entity_links(entity_id);

-- 4) Librarian run log (observability + idempotency).
create table if not exists public.memory_curation_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  clusters int not null default 0,
  merged int not null default 0,
  flagged int not null default 0,
  entities_upserted int not null default 0,
  links_made int not null default 0,
  note text
);

-- 5) RLS: service-role only (no anon policies) on the new tables.
alter table public.memory_entities enable row level security;
alter table public.memory_entity_links enable row level security;
alter table public.memory_curation_runs enable row level security;
