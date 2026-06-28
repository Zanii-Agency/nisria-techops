-- Rollback for 2026-06-28_maisha_inventory.sql. Drops the new tables and the
-- added columns, and restores the original (narrower) constraints. Safe because
-- the forward migration was additive: dropping the new columns/tables loses only
-- Maisha-inventory data, never pre-existing inventory/payments/tasks/messages data.
BEGIN;

DROP TABLE IF EXISTS inventory_sales;
DROP TABLE IF EXISTS pending_enrichment;
DROP TABLE IF EXISTS inventory_lifecycle_events;
DROP TABLE IF EXISTS inventory_materials;
DROP TABLE IF EXISTS assets;

ALTER TABLE messages DROP COLUMN IF EXISTS asset_id;

ALTER TABLE tasks DROP COLUMN IF EXISTS ref_inventory_id;
ALTER TABLE tasks DROP COLUMN IF EXISTS source_kind;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_source_check;
ALTER TABLE tasks ADD  CONSTRAINT tasks_source_check CHECK (source IN ('manual','ai'));

DROP INDEX IF EXISTS payments_batch_tag_key;
ALTER TABLE payments DROP COLUMN IF EXISTS batch_tag;
ALTER TABLE payments DROP COLUMN IF EXISTS source;

DROP INDEX IF EXISTS idx_inventory_lifecycle;
DROP INDEX IF EXISTS idx_inventory_type;
DROP INDEX IF EXISTS inventory_tracking_no_key;
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_lifecycle_state_check;
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_quantity_nonneg;
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_item_type_check;
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_status_check;
ALTER TABLE inventory ADD  CONSTRAINT inventory_status_check
  CHECK (status IN ('in_stock','low','out','archived'));
ALTER TABLE inventory
  DROP COLUMN IF EXISTS freight_cost_currency,
  DROP COLUMN IF EXISTS freight_cost_allocated,
  DROP COLUMN IF EXISTS classification_confidence,
  DROP COLUMN IF EXISTS classification_score,
  DROP COLUMN IF EXISTS source_message_external_id,
  DROP COLUMN IF EXISTS created_by,
  DROP COLUMN IF EXISTS enriched,
  DROP COLUMN IF EXISTS source,
  DROP COLUMN IF EXISTS links,
  DROP COLUMN IF EXISTS asset_ids,
  DROP COLUMN IF EXISTS lifecycle_state,
  DROP COLUMN IF EXISTS price_currency,
  DROP COLUMN IF EXISTS cost_currency,
  DROP COLUMN IF EXISTS size,
  DROP COLUMN IF EXISTS maker,
  DROP COLUMN IF EXISTS style,
  DROP COLUMN IF EXISTS tracking_no,
  DROP COLUMN IF EXISTS item_type;

COMMIT;
