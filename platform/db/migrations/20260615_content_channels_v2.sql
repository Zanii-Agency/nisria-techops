-- 2026-06-15 — Content channels v2: TikTok (multi-handle) + LinkedIn.
-- Additive only. Existing IG/FB rows keep working unchanged.

-- Brand-level: which handles exist for this brand.
ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS tiktok_handles text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS linkedin_account text,
  ADD COLUMN IF NOT EXISTS instagram_account text,
  ADD COLUMN IF NOT EXISTS facebook_account text;

-- Post-level: which specific accounts this post fans out to.
-- Shape: { "tiktok": ["@nisria_official","@nisria_kids"], "linkedin": "company/nisria", "instagram": "@nisria", "facebook": "nisria.page" }
ALTER TABLE public.content_posts
  ADD COLUMN IF NOT EXISTS social_accounts jsonb DEFAULT '{}'::jsonb;

-- Cron / n8n consumer index. n8n polls scheduled rows with scheduled_for <= now().
CREATE INDEX IF NOT EXISTS idx_content_scheduled_due
  ON public.content_posts (scheduled_for)
  WHERE status = 'scheduled';

-- Seed default handles for Nisria brand if rows are empty (idempotent, no-op if already set).
UPDATE public.brands
   SET tiktok_handles = ARRAY['@nisria_official']
 WHERE slug = 'nisria'
   AND (tiktok_handles IS NULL OR tiktok_handles = '{}'::text[]);

UPDATE public.brands
   SET instagram_account = '@nisria_official'
 WHERE slug = 'nisria'
   AND instagram_account IS NULL;
