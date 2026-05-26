-- Vector-similarity retrieval for the brain. Used ONLY when embeddings exist
-- (embedder configured); otherwise recall() stays on tsvector full-text. Safe to
-- create now: with no embedded rows it simply returns nothing, and recall() has
-- a full-text fallback. An ivfflat index is added later once enough rows carry
-- embeddings (lists need data to train), so for now this does an exact scan,
-- which is fine at brain scale (hundreds of rows).
create or replace function match_memory(
  query_embedding vector(1536),
  match_count int default 6,
  filter_kinds text[] default null,
  exclude_kinds text[] default null
)
returns table (kind text, brand text, title text, content text, similarity float)
language sql stable
as $$
  select m.kind, m.brand, m.title, m.content,
         1 - (m.embedding <=> query_embedding) as similarity
  from agent_memory m
  where m.embedding is not null
    and (filter_kinds is null or m.kind = any(filter_kinds))
    and (exclude_kinds is null or not (m.kind = any(exclude_kinds)))
  order by m.embedding <=> query_embedding
  limit match_count;
$$;
