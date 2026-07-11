-- Canonical payment identity (2026-07-11). An M-Pesa transaction carries ONE
-- unique reference (e.g. UG4EJ9WXT5) printed on the SMS, the PDF receipt and the
-- app screenshot. Making that ref a first-class column turns duplicate detection
-- from a heuristic (sender + amount + same day) into identity matching: the same
-- payment posted as SMS today and PDF tomorrow still collapses to one row, while
-- two REAL same-amount purchases (different refs) both book. Evidence-binding:
-- the receipt's own reference is the payment's identity.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS txn_ref text;

CREATE INDEX IF NOT EXISTS payments_txn_ref_idx ON public.payments (txn_ref) WHERE txn_ref IS NOT NULL;

COMMENT ON COLUMN public.payments.txn_ref IS 'Canonical transaction reference from the payment rail (M-Pesa code etc.). Dedup anchor: one ref = one payment.';
