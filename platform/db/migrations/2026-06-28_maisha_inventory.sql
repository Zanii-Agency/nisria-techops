-- ============================================================================
-- Maisha Inventory — live migration (Phase 1 foundation)
-- Derived from specs/004-maisha-inventory/sandbox/schema.sql, rewritten for the
-- LIVE database (uuid PKs, RLS on, ALTER not CREATE on existing tables).
--
-- SAFETY: this migration is ADDITIVE. Every new inventory/payments/tasks/messages
-- column is nullable or defaulted, so existing rows are untouched (no backfill,
-- no NOT NULL added to populated tables). The only DROP/ADD are constraint
-- WIDENINGS (status gains 'draft', tasks.source gains 'inventory'), which can
-- never reject an existing valid row. New tables start empty with RLS enabled.
-- Wrapped in a transaction: it applies whole or not at all.
--
-- ROLLBACK is the mirror (DROP the added columns/tables/constraints); kept in the
-- companion file 2026-06-28_maisha_inventory_rollback.sql.
-- ============================================================================
BEGIN;

-- 1) INVENTORY: one table, three item types, a SEPARATE lifecycle_state column
--    (status stays stock-level), currency-correct money, provenance.
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS item_type                  text,
  ADD COLUMN IF NOT EXISTS tracking_no                text,
  ADD COLUMN IF NOT EXISTS style                      text,
  ADD COLUMN IF NOT EXISTS maker                      text,
  ADD COLUMN IF NOT EXISTS size                       text,
  ADD COLUMN IF NOT EXISTS cost_currency              text,
  ADD COLUMN IF NOT EXISTS price_currency             text,
  ADD COLUMN IF NOT EXISTS lifecycle_state            text,
  ADD COLUMN IF NOT EXISTS asset_ids                  text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS links                      jsonb  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source                     text   NOT NULL DEFAULT 'maisha_inventory',
  ADD COLUMN IF NOT EXISTS enriched                   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by                 text,
  ADD COLUMN IF NOT EXISTS source_message_external_id text,
  ADD COLUMN IF NOT EXISTS classification_score       numeric,
  ADD COLUMN IF NOT EXISTS classification_confidence  text,
  ADD COLUMN IF NOT EXISTS freight_cost_allocated     numeric(12,2),
  ADD COLUMN IF NOT EXISTS freight_cost_currency      text;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_tracking_no_key
  ON inventory(tracking_no) WHERE tracking_no IS NOT NULL;

-- TRAP 1: status stays stock-level, widened only to add 'draft'. Lifecycle words
-- are NOT allowed here; they live on lifecycle_state with its own check.
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_status_check;
ALTER TABLE inventory ADD  CONSTRAINT inventory_status_check
  CHECK (status IN ('in_stock','low','out','archived','draft'));

ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_item_type_check;
ALTER TABLE inventory ADD  CONSTRAINT inventory_item_type_check
  CHECK (item_type IS NULL OR item_type IN ('supply','textile','end_product'));

ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_quantity_nonneg;
ALTER TABLE inventory ADD  CONSTRAINT inventory_quantity_nonneg CHECK (quantity >= 0);

ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_lifecycle_state_check;
ALTER TABLE inventory ADD  CONSTRAINT inventory_lifecycle_state_check
  CHECK (lifecycle_state IS NULL OR lifecycle_state IN
    ('production','in_stock','reserved','sold','shipped','in_transit','delivered','returned','restock'));

CREATE INDEX IF NOT EXISTS idx_inventory_type      ON inventory(item_type);
CREATE INDEX IF NOT EXISTS idx_inventory_lifecycle ON inventory(lifecycle_state) WHERE lifecycle_state IS NOT NULL;

-- 2) PAYMENTS: tag + idempotency so Maisha cost outflows are filterable and
--    never double-logged (and never pollute the NGO operating view).
ALTER TABLE payments ADD COLUMN IF NOT EXISTS source    text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS batch_tag text;
CREATE UNIQUE INDEX IF NOT EXISTS payments_batch_tag_key
  ON payments(batch_tag) WHERE batch_tag IS NOT NULL;

-- 3) TASKS: source gains 'inventory' (TRAP 2); link a task back to its item.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_source_check;
ALTER TABLE tasks ADD  CONSTRAINT tasks_source_check CHECK (source IN ('manual','ai','inventory'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_kind      text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ref_inventory_id uuid REFERENCES inventory(id) ON DELETE SET NULL;

-- 4) MESSAGES: the storeMedia link the group path needs (external_id /
--    reply_to_external_id already exist live).
ALTER TABLE messages ADD COLUMN IF NOT EXISTS asset_id uuid;

-- 5) NEW TABLES (uuid PKs, RLS enabled; service-role only, no anon/authenticated
--    policy, so customer phones/tokens and finance never reach the client).
CREATE TABLE IF NOT EXISTS assets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type         text NOT NULL DEFAULT 'proof',
  storage_path text NOT NULL,
  mime         text,
  source       text NOT NULL DEFAULT 'whatsapp',
  source_ref   text UNIQUE,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_materials (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  end_product_id uuid NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  material_id    uuid NOT NULL REFERENCES inventory(id),
  qty            numeric(12,2) NOT NULL DEFAULT 1,
  unit_cost      numeric(12,2),
  currency       text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_lifecycle_events (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id               uuid NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  from_state                 text,
  to_state                   text NOT NULL,
  evidence                   text,
  source_message_external_id text,
  created_by                 text,
  created_at                 timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_inv ON inventory_lifecycle_events(inventory_id);

CREATE TABLE IF NOT EXISTS pending_enrichment (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_external_id text NOT NULL,
  inventory_id        uuid REFERENCES inventory(id) ON DELETE SET NULL,
  asset_id            uuid,
  sender_phone        text,
  sender_name         text,
  group_name          text,
  status              text NOT NULL DEFAULT 'pending',
  nudged_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pending_enrichment_status_check CHECK (status IN ('pending','enriched','nudged'))
);
CREATE INDEX IF NOT EXISTS idx_pending_enrichment_status ON pending_enrichment(status) WHERE status <> 'enriched';

CREATE TABLE IF NOT EXISTS inventory_sales (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id     uuid NOT NULL REFERENCES inventory(id),
  tracking_no      text,
  channel          text NOT NULL,
  customer         text,
  customer_phone   text,
  customer_token   text,
  token_expires_at timestamptz,
  price            numeric(12,2) NOT NULL,
  currency         text NOT NULL,
  channel_fee      numeric(12,2) NOT NULL DEFAULT 0,
  payment_status   text NOT NULL DEFAULT 'sold',
  payment_ref      text,
  source           text NOT NULL DEFAULT 'maisha_inventory',
  batch_tag        text UNIQUE,
  created_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- 'upaya' included (SPEC REQ-CHN2) alongside the sandbox channels, reconciling
  -- the spec/sandbox enum conflict the scoping pass flagged.
  CONSTRAINT inventory_sales_channel_check
    CHECK (channel IN ('online','folklore','jensen_shopify','upaya','other')),
  CONSTRAINT inventory_sales_payment_status_check
    CHECK (payment_status IN ('sold','paid','settled'))
);
CREATE INDEX IF NOT EXISTS idx_inventory_sales_inv ON inventory_sales(inventory_id);

-- RLS: lock every new table to server-side service-role access only.
ALTER TABLE assets                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_materials        ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_enrichment         ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_sales            ENABLE ROW LEVEL SECURITY;

COMMIT;
