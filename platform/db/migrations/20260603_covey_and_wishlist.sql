-- Stephen Covey 4-quadrant prioritization on tasks + general/specific typing.
alter table public.tasks add column if not exists important boolean not null default false;
alter table public.tasks add column if not exists task_type text not null default 'specific';
comment on column public.tasks.important is 'Covey importance axis. Urgency derives from priority=high OR due_on within ~2 days. Quadrant = important x urgent (Q1 do-now, Q2 schedule, Q3 delegate, Q4 drop).';
comment on column public.tasks.task_type is 'general (org/personal catch-all) | specific (a concrete assigned action).';
do $$ begin
  if not exists (select 1 from pg_constraint where conname='tasks_task_type_check') then
    alter table public.tasks add constraint tasks_task_type_check check (task_type in ('general','specific'));
  end if;
end $$;

-- Wishlist: a donor-facing needs list (managed in the command center, wired to Sasa).
create table if not exists public.wishlist_items (
  "id"           uuid default gen_random_uuid() not null,
  "title"        text not null,
  "description"  text,
  "category"     text,
  "qty_needed"   integer default 1 not null,
  "qty_funded"   integer default 0 not null,
  "unit_cost"    numeric(12,2),
  "currency"     text default 'USD' not null,
  "status"       text default 'open' not null,
  "brand"        text default 'nisria',
  "created_by"   text default 'Nur',
  "created_at"   timestamp with time zone default now() not null,
  "updated_at"   timestamp with time zone default now() not null,
  constraint "wishlist_items_pkey" primary key (id),
  constraint "wishlist_items_status_check" check (status in ('open','partial','fulfilled','archived')),
  constraint "wishlist_items_currency_check" check (currency in ('KES','USD'))
);
