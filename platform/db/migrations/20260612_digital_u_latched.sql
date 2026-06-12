-- Idempotency ledger for the Digital Nur Gmail sweep. Each row = one Gmail
-- message we have already processed (either dispatched the bot for it, or
-- evaluated and skipped it because it wasn't a real invite). Stops the cron
-- from re-firing on the same id forever.

create table if not exists digital_u_latched (
  gmail_id    text        primary key,
  outcome     text        not null,   -- 'dispatched' | 'skipped_past' | 'skipped_unparseable' | 'skipped_no_link'
  meeting_id  text                  default null,
  latched_at  timestamptz not null default now()
);

create index if not exists digital_u_latched_at_idx
  on digital_u_latched(latched_at desc);
