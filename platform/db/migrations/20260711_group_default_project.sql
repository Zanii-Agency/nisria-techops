-- Group-level default project (2026-07-11).
-- A group can be "about" one project for a period (e.g. the Finances group is
-- all Yalla Kenya expenses right now). Setting a default_project makes every
-- expense-bearing message in that group — text OR receipt image/PDF — book to
-- that project without needing a keyword per message. Change it with one UPDATE
-- when the period ends (set to NULL for general operating). No redeploy needed.

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS default_project text;

COMMENT ON COLUMN public.groups.default_project IS 'Project every expense in this group books to (e.g. yalla). NULL = general operating.';

-- The Finances group is the Yalla expense stream for the current period.
UPDATE public.groups SET default_project = 'yalla'
WHERE name = 'Nisria • Finances 💵';
