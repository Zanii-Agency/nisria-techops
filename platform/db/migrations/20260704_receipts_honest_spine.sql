-- Honest spine (ADR-0016, spec 002, Slice 1): the local receipt store = the diary.
-- Every proven action (starting with the relay) writes a re-checkable receipt here.
-- ledger.zanii.agency plugs in later behind lib/receipts.ts as an adapter; this
-- table is the reference shape. recordReceipt() is best-effort, so the feature is
-- safe even before this migration runs (the flag RELAY_HONEST_SPINE gates the gate,
-- and a missing table is swallowed). Run this to turn on the diary.

create table if not exists public.receipts (
  id               uuid primary key default gen_random_uuid(),
  turn_id          text,
  action           text not null,            -- e.g. 'relay'
  tool             text,                     -- e.g. 'relay_to_colleague', 'message_person'
  recipient_id     text,                     -- contact/team id when known
  recipient_last4  text,                     -- last 4 of the number (no full PII)
  provider         text not null,            -- 'whatsapp'
  provider_id      text not null,            -- the re-checkable receipt (wamid)
  meta             jsonb,
  created_at       timestamptz not null default now()
);

-- Fast lookup by turn (the gate) and by recipient/action (the diary / audits).
create index if not exists receipts_turn_idx     on public.receipts (turn_id);
create index if not exists receipts_action_idx   on public.receipts (action, created_at desc);
create index if not exists receipts_provider_idx on public.receipts (provider, provider_id);

-- Service-role only (server writes it; no client/anon access). RLS on, no policies.
alter table public.receipts enable row level security;
