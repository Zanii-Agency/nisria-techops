-- Sasa 727 v1: task delegation hardening.
-- Adds in_review + abandoned status values, watcher_ids, source_text/kind/id,
-- reason, reassigned_from on tasks. Creates task_comments + task_dependencies.
-- See FROZEN-MIGRATION reference in ~/Desktop/sasa-727-handoff/FROZEN-SPEC.md.

BEGIN;

-- 1. Status enum extension.
-- in_review is the sign-off step (e.g. Cynthia drafts a grant doc, marks
-- in_review, Nur reviews, marks done). abandoned is the peer-declined terminus,
-- distinct from blocked (which the system sets when work is structurally stuck).
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check
  CHECK (status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'in_review'::text, 'done'::text, 'blocked'::text, 'abandoned'::text]));

-- 2. New columns on tasks.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS watcher_ids uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_text text,
  ADD COLUMN IF NOT EXISTS source_kind text,
  ADD COLUMN IF NOT EXISTS source_id text,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS reassigned_from uuid REFERENCES public.team_members(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tasks.created_by_id IS 'team_members.id of the creator. Null means principal (Nur or Taona); see created_by text column for legacy label.';
COMMENT ON COLUMN public.tasks.watcher_ids IS 'Additional team_members CC list (e.g. mentioned besides the assignee). Notified on status changes and comments.';
COMMENT ON COLUMN public.tasks.source_text IS 'The raw inbound message body that produced this task. Audit and replay.';
COMMENT ON COLUMN public.tasks.source_kind IS 'parsed_task | parsed_task_from_group | model_create_task | portal_manual | portal_ai. Distinguishes deterministic vs model writes.';
COMMENT ON COLUMN public.tasks.source_id IS 'messages.id (uuid as text) when the task came from a message. Used for idempotency on retries.';
COMMENT ON COLUMN public.tasks.reason IS 'Free-form reason text for decline, reassign, or reopen events.';
COMMENT ON COLUMN public.tasks.reassigned_from IS 'Original assignee on a one-hop reassign. Pings the original creator.';

CREATE INDEX IF NOT EXISTS idx_tasks_source ON public.tasks(source_kind, source_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by_id ON public.tasks(created_by_id);

-- Hard dedup guard for parsed_task rows. Two concurrent webhook deliveries on
-- the SAME source_message_id can both pass a check-then-insert race; this
-- partial UNIQUE index closes that race at the database. The parseTasks
-- worker catches the duplicate-key error and treats it as already-written.
-- (qwen review #2, #3.)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_parsed_task_dedup
  ON public.tasks (source_kind, source_id, title)
  WHERE source_kind = 'parsed_task';

-- 3. Task comments (multi-thread discussion).
-- Visible to assignee, creator, watchers. The bot tool add_task_comment writes
-- here; the portal will read here in v1.5.
CREATE TABLE IF NOT EXISTS public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  author_name text,
  body text NOT NULL,
  source text NOT NULL DEFAULT 'bot' CHECK (source = ANY (ARRAY['bot'::text, 'portal'::text, 'system'::text])),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON public.task_comments(task_id, created_at);

COMMENT ON TABLE public.task_comments IS 'Per-task discussion thread. Bot tool add_task_comment writes from WhatsApp; portal reads.';

-- 4. Task dependencies (Linear-style blocks). task_id is the dependent, blocks_task_id is the upstream.
CREATE TABLE IF NOT EXISTS public.task_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  blocks_task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  created_by_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_dep_no_self CHECK (task_id <> blocks_task_id),
  CONSTRAINT task_dep_unique UNIQUE (task_id, blocks_task_id)
);
CREATE INDEX IF NOT EXISTS idx_task_deps_task ON public.task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_blocks ON public.task_dependencies(blocks_task_id);

COMMENT ON TABLE public.task_dependencies IS 'task_id depends on blocks_task_id. Used by list_tasks to surface blocked-by state in the bot.';

-- 5. pending_actions kind extension (no schema change; documentation only).
-- New kind value: 'parsed_task_from_group' — group-bot stage to Nur queue when
-- parseTasks fires on a group message. Existing kinds: record_payment, bank_import.

COMMIT;
