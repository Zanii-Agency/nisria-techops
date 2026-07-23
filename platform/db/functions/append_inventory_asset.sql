-- Atomic asset append for inventory.asset_ids (2026-07-23).
--
-- Kills the concurrent-album photo-drop race: a burst of album photos hits the serverless webhook at
-- the same instant, and the old read-modify-write on asset_ids lost updates (two photos read the same
-- array, both write it back, one is silently dropped). This is a SINGLE row-locked UPDATE, so
-- concurrent calls serialize on the row and every photo lands. Idempotent: the guard never adds a
-- duplicate. Additive and non-destructive (no table or column is created, altered, or dropped).
--
-- Apply ONCE in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> paste -> Run).
-- The app calls it via db.rpc("append_inventory_asset", { inv_id, new_asset }); until it exists the
-- app falls back to the old path, so this can be applied before or after the code deploy.

create or replace function public.append_inventory_asset(inv_id uuid, new_asset text)
returns void
language sql
as $$
  update public.inventory
     set asset_ids  = array_append(coalesce(asset_ids, '{}'::text[]), new_asset),
         updated_at = now()
   where id = inv_id
     and not (new_asset = any(coalesce(asset_ids, '{}'::text[])));
$$;

grant execute on function public.append_inventory_asset(uuid, text) to service_role;
