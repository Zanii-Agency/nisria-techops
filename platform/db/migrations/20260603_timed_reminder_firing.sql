-- Timed-reminder firing needs an idempotency stamp so a 5-minute cron fires each
-- timed task/event exactly once (Real-action law: idempotent, fired-once).
alter table public.tasks add column if not exists reminded_at timestamptz;
alter table public.calendar_events add column if not exists reminded_at timestamptz;
comment on column public.tasks.reminded_at is 'When the timed (due_time) WhatsApp reminder was fired. Null = not yet fired. Set once by /api/cron/timed.';
comment on column public.calendar_events.reminded_at is 'When the at-the-time WhatsApp reminder for a timed event was fired. Null = not yet.';
