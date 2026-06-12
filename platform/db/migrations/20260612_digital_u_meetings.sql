-- Digital Nur capture ledger. One row per meeting the bot recorded.
-- The Meetings tab on the portal reads from this. Tasks created by an ingest
-- callback carry source_kind='meeting' and source_id = this id so the task
-- → meeting backlink already works without a join table.

create table if not exists digital_u_meetings (
  id            text primary key,
  title         text        not null default 'Untitled meeting',
  source        text        not null default 'other',           -- meet/zoom/teams/other
  duration_sec  integer     not null default 0,
  transcript    text                 default '',
  summary       text                 default '',
  decisions     jsonb       not null default '[]'::jsonb,
  status        text        not null default 'captured',        -- captured/failed
  failed_reason text                 default null,
  created_at    timestamptz not null default now()
);

create index if not exists digital_u_meetings_created_idx
  on digital_u_meetings(created_at desc);

create index if not exists digital_u_meetings_status_idx
  on digital_u_meetings(status);

-- Status check guard. Future states (transcribing, etc) can be added with
-- another migration; the table starts narrow on purpose.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'digital_u_meetings_status_check'
  ) then
    alter table digital_u_meetings
      add constraint digital_u_meetings_status_check
      check (status in ('captured','failed','transcribing','queued'));
  end if;
end
$$;
