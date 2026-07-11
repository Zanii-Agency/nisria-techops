-- Finance restructure + Yalla Kenya project ledger (2026-07-09).
-- Adds a project dimension and first-class provenance to `payments` so every
-- expense can be scoped to a project (e.g. the Yalla Kenya film) and every
-- auto-ingested line carries proof: what kind of source it came from, when the
-- document/picture was uploaded, and a reference back to it. Evidence-binding
-- doctrine: no receipt, no valid line.
--
-- All columns are nullable / defaulted so existing rows and the existing
-- insert paths keep working unchanged (extend beside, do not rewire).

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS project             text,          -- e.g. 'yalla' | null (general operating)
  ADD COLUMN IF NOT EXISTS source_type         text,          -- 'pdf' | 'image' | 'screenshot' | 'receipt' | 'text' | 'voice' | 'whatsapp'
  ADD COLUMN IF NOT EXISTS source_uploaded_at  timestamptz,   -- when the doc/picture was uploaded (distinct from paid_at)
  ADD COLUMN IF NOT EXISTS source_ref          text,          -- storage path / message id / external ref to the proof
  ADD COLUMN IF NOT EXISTS confirmed_at        timestamptz,   -- set when Nur confirms an auto-booked line at day end
  ADD COLUMN IF NOT EXISTS needs_review        boolean NOT NULL DEFAULT false; -- auto-booked, awaiting day-end confirm

-- Fast filters for the Yalla tab and the day-end confirm digest.
CREATE INDEX IF NOT EXISTS payments_project_idx      ON public.payments (project) WHERE project IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_needs_review_idx ON public.payments (needs_review) WHERE needs_review = true;

COMMENT ON COLUMN public.payments.project IS 'Project scope for the expense (e.g. yalla). NULL = general operating spend.';
COMMENT ON COLUMN public.payments.source_uploaded_at IS 'When the proof document/picture was uploaded, distinct from paid_at.';
COMMENT ON COLUMN public.payments.needs_review IS 'Auto-booked from WhatsApp/vision and awaiting Nur day-end confirm.';
