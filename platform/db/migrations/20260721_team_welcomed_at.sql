-- Team-member welcome (2026-07-21). When a team member with bot_access messages the
-- bot for the first time, they get a one-time greeting naming what they can do. This
-- column marks who has already been welcomed so it fires exactly once per member.
-- Nullable + defaults NULL, backward compatible: apply first, then deploy the code.

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS welcomed_at timestamptz;
