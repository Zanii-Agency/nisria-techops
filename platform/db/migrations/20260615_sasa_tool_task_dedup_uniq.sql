-- 2026-06-15 (KT #287, SCHEMA-2): partial UNIQUE INDEX for sasa_tool tasks.
-- The check-then-insert dedup in smart-tools.ts:create_task catches Postgres
-- code 23505 (unique_violation) for graceful no-op, but only the parsed_task
-- partial UNIQUE existed. Under concurrent webhooks the catch was dead code
-- for sasa_tool rows. This sibling index makes the wall real at the DB.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_sasa_tool_dedup
  ON public.tasks (source_kind, source_id, title)
  WHERE source_kind = 'sasa_tool' AND source_id IS NOT NULL;
