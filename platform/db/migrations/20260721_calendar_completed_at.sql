-- spec 007 §5 — calendar completion as real state, not a notes-prefix fiction.
--
-- BUG. complete_calendar_event marked an event "done" by prepending "[completed …]"
-- into calendar_events.notes. No read path (getCalendar, query_calendar, /calendar,
-- the home widget) ever inspected that marker, so a completed event stayed on every
-- view. Nur was told "Marked done" six times while the Bashir event never left the
-- board. This adds a real completion column every path can honor.
--
-- SAFE ORDERING. The column is nullable and defaults NULL, so it is backward
-- compatible: code that predates this migration simply ignores it. Apply this FIRST,
-- backfill, THEN deploy the code that reads/writes it.

ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Backfill: every event previously "completed" via the notes prefix becomes a real
-- completion. Use updated_at as the best available completion timestamp (the notes
-- write stamped updated_at at completion time). Idempotent: only fills NULLs.
UPDATE calendar_events
SET completed_at = COALESCE(updated_at, created_at, now())
WHERE completed_at IS NULL
  AND notes LIKE '[completed %';

-- Partial index: every read path filters "not completed", so index the open events.
CREATE INDEX IF NOT EXISTS calendar_events_open_idx
  ON calendar_events (starts_on)
  WHERE completed_at IS NULL;
