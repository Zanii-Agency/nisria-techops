-- Stage the 2 routed-finance PDFs Violet sent in Nisria • Finances 💵 on 2026-06-12
-- into surfaces Nur can actually see, idempotently:
--   1. assets row (Library Finance shelf)
--   2. documents row (search_documents)
--   3. approvals row, kind='finance_review', intent_id=null (Needs You on /)
--   4. ingest_items status flipped to applied (no longer orphaned)
--
-- Reason: status=routed + applied=false items have NO portal surface today.
-- IngestDock at /settings only renders a batch held in client state (batchId).
-- ZERO outbound messages to Nur fire from this script.

BEGIN;

-- ───────────────────────────────────────────────────────────────────────
-- PDF #1: Delight technical college .pdf (Sanara payment for trainer)
-- ───────────────────────────────────────────────────────────────────────

-- 1a. asset (idempotent: insert only if no row exists at this storage_path)
INSERT INTO assets (type, title, description, storage_path, mime, source, created_by, tags, brand)
SELECT
  'document',
  'Delight technical college .pdf',
  'Sanara payment for trainer. Payment to Sanara for trainer services.',
  'group-ingest/27aeb7ed-cda4-4e0b-bd53-607d333d72f3/mqaxtczg-Delight_technical_college_.pdf',
  'application/pdf',
  'ingest',
  'Violet',
  ARRAY['finance'],
  'nisria'
WHERE NOT EXISTS (
  SELECT 1 FROM assets WHERE storage_path = 'group-ingest/27aeb7ed-cda4-4e0b-bd53-607d333d72f3/mqaxtczg-Delight_technical_college_.pdf'
);

-- 1b. ingest_items.asset_id linkage + mark applied
UPDATE ingest_items SET
  status = 'applied',
  applied = true,
  asset_id = (SELECT id FROM assets WHERE storage_path = 'group-ingest/27aeb7ed-cda4-4e0b-bd53-607d333d72f3/mqaxtczg-Delight_technical_college_.pdf' LIMIT 1),
  updated_at = now()
WHERE id = '738059fc-6d94-41d5-a254-cb39c58754dd';

-- 1c. document mirror (searchable)
INSERT INTO documents (drive_file_id, title, folder, doc_type, brand, mime, summary, source, updated_at)
VALUES (
  'ingest:group-ingest/27aeb7ed-cda4-4e0b-bd53-607d333d72f3/mqaxtczg-Delight_technical_college_.pdf',
  'Delight technical college .pdf',
  'finance',
  'document',
  'nisria',
  'application/pdf',
  'Sanara payment for trainer. Payment to Sanara for trainer services.',
  'whatsapp',
  now()
)
ON CONFLICT (drive_file_id) DO UPDATE SET
  title = EXCLUDED.title,
  folder = EXCLUDED.folder,
  doc_type = EXCLUDED.doc_type,
  brand = EXCLUDED.brand,
  summary = EXCLUDED.summary,
  updated_at = now();

-- 1d. approval (Needs You). Idempotent via the JSONB context ingest_item_id.
INSERT INTO approvals (kind, title, summary, agent, lane, status, proposed, context, related_contact_id)
SELECT
  'finance_review',
  'Sanara payment for trainer',
  'Violet sent a PDF in Nisria • Finances 💵 on 2026-06-12 at 13:03 UAE. Routed as Sanara payment for trainer. Nur followed at 13:13 with the text Sanara trainer Ksh 25,000 + Transport for trainer Ksh 1,500 in the same group. The PDF is likely the receipt for that payment. Open the library to confirm the amount and log the payment.',
  'agent:ingest',
  'approve',
  'pending',
  jsonb_build_object(
    'storage_path', 'group-ingest/27aeb7ed-cda4-4e0b-bd53-607d333d72f3/mqaxtczg-Delight_technical_college_.pdf',
    'asset_id', (SELECT id FROM assets WHERE storage_path = 'group-ingest/27aeb7ed-cda4-4e0b-bd53-607d333d72f3/mqaxtczg-Delight_technical_college_.pdf' LIMIT 1),
    'filename', 'Delight technical college .pdf',
    'attribution', 'Violet',
    'currency_hint', 'KES'
  ),
  jsonb_build_object(
    'ingest_item_id', '738059fc-6d94-41d5-a254-cb39c58754dd',
    'message_id', 'ff23e91e-4952-4366-8103-0f4f3985483f',
    'related_text_message_id', 'f87aecb6-e479-4482-8d44-1f73fbc3d94a',
    'related_contact_id', '27aeb7ed-cda4-4e0b-bd53-607d333d72f3',
    'source_group', 'Nisria • Finances 💵',
    'sent_at', '2026-06-12T13:03:30.640934Z',
    'storage_path', 'group-ingest/27aeb7ed-cda4-4e0b-bd53-607d333d72f3/mqaxtczg-Delight_technical_college_.pdf',
    'filename', 'Delight technical college .pdf'
  ),
  '27aeb7ed-cda4-4e0b-bd53-607d333d72f3'
WHERE NOT EXISTS (
  SELECT 1 FROM approvals
  WHERE kind = 'finance_review'
    AND context->>'ingest_item_id' = '738059fc-6d94-41d5-a254-cb39c58754dd'
);

-- ───────────────────────────────────────────────────────────────────────
-- PDF #2: Content creation -ksh 30,000.pdf
-- ───────────────────────────────────────────────────────────────────────

INSERT INTO assets (type, title, description, storage_path, mime, source, created_by, tags, brand)
SELECT
  'document',
  'Content creation -ksh 30,000.pdf',
  'Content Creation Expense. Content creation service or expense, amount 30,000 KSH.',
  'group-ingest/27aeb7ed-cda4-4e0b-bd53-607d333d72f3/mqb32t4b-Content_creation_-ksh_30_000.pdf',
  'application/pdf',
  'ingest',
  'Violet',
  ARRAY['finance'],
  'nisria'
WHERE NOT EXISTS (
  SELECT 1 FROM assets WHERE storage_path = 'group-ingest/27aeb7ed-cda4-4e0b-bd53-607d333d72f3/mqb32t4b-Content_creation_-ksh_30_000.pdf'
);

UPDATE ingest_items SET
  status = 'applied',
  applied = true,
  asset_id = (SELECT id FROM assets WHERE storage_path = 'group-ingest/27aeb7ed-cda4-4e0b-bd53-607d333d72f3/mqb32t4b-Content_creation_-ksh_30_000.pdf' LIMIT 1),
  updated_at = now()
WHERE id = 'f9cae52f-125d-4612-9b94-360bca108a36';

INSERT INTO documents (drive_file_id, title, folder, doc_type, brand, mime, summary, source, updated_at)
VALUES (
  'ingest:group-ingest/27aeb7ed-cda4-4e0b-bd53-607d333d72f3/mqb32t4b-Content_creation_-ksh_30_000.pdf',
  'Content creation -ksh 30,000.pdf',
  'finance',
  'document',
  'nisria',
  'application/pdf',
  'Content Creation Expense. Content creation service or expense, amount 30,000 KSH.',
  'whatsapp',
  now()
)
ON CONFLICT (drive_file_id) DO UPDATE SET
  title = EXCLUDED.title,
  folder = EXCLUDED.folder,
  doc_type = EXCLUDED.doc_type,
  brand = EXCLUDED.brand,
  summary = EXCLUDED.summary,
  updated_at = now();

INSERT INTO approvals (kind, title, summary, agent, lane, status, proposed, context, related_contact_id)
SELECT
  'finance_review',
  'Content Creation Expense',
  'Violet sent a PDF in Nisria • Finances 💵 on 2026-06-12 at 19:30 UAE. Routed as a content creation expense for Ksh 30,000. Open the library to confirm the vendor and log the payment.',
  'agent:ingest',
  'approve',
  'pending',
  jsonb_build_object(
    'storage_path', 'group-ingest/27aeb7ed-cda4-4e0b-bd53-607d333d72f3/mqb32t4b-Content_creation_-ksh_30_000.pdf',
    'asset_id', (SELECT id FROM assets WHERE storage_path = 'group-ingest/27aeb7ed-cda4-4e0b-bd53-607d333d72f3/mqb32t4b-Content_creation_-ksh_30_000.pdf' LIMIT 1),
    'filename', 'Content creation -ksh 30,000.pdf',
    'attribution', 'Violet',
    'currency_hint', 'KES'
  ),
  jsonb_build_object(
    'ingest_item_id', 'f9cae52f-125d-4612-9b94-360bca108a36',
    'message_id', '4e67505d-3fd0-4d21-80aa-921360273e64',
    'related_contact_id', '27aeb7ed-cda4-4e0b-bd53-607d333d72f3',
    'source_group', 'Nisria • Finances 💵',
    'sent_at', '2026-06-12T15:30:50.006427Z',
    'storage_path', 'group-ingest/27aeb7ed-cda4-4e0b-bd53-607d333d72f3/mqb32t4b-Content_creation_-ksh_30_000.pdf',
    'filename', 'Content creation -ksh 30,000.pdf'
  ),
  '27aeb7ed-cda4-4e0b-bd53-607d333d72f3'
WHERE NOT EXISTS (
  SELECT 1 FROM approvals
  WHERE kind = 'finance_review'
    AND context->>'ingest_item_id' = 'f9cae52f-125d-4612-9b94-360bca108a36'
);

COMMIT;

-- Verify
SELECT id, kind, title, status, agent, context->>'ingest_item_id' AS item_id, created_at
FROM approvals
WHERE kind = 'finance_review'
ORDER BY created_at DESC;

SELECT id, status, applied, asset_id, routed_to FROM ingest_items
WHERE id IN ('738059fc-6d94-41d5-a254-cb39c58754dd', 'f9cae52f-125d-4612-9b94-360bca108a36');

SELECT id, type, title, storage_path, source, tags FROM assets
WHERE storage_path LIKE 'group-ingest/27aeb7ed-cda4-4e0b-bd53-607d333d72f3/mqaxtczg-%'
   OR storage_path LIKE 'group-ingest/27aeb7ed-cda4-4e0b-bd53-607d333d72f3/mqb32t4b-%';

SELECT drive_file_id, title, folder, source, updated_at FROM documents
WHERE drive_file_id LIKE 'ingest:group-ingest/27aeb7ed-cda4-4e0b-bd53-607d333d72f3/%';
