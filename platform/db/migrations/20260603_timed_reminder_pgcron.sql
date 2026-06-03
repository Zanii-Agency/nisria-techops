-- Fire the timed-reminder route every 5 minutes from inside Supabase (Vercel
-- Hobby only allows DAILY crons). Auth secret read from Vault, never in git.
do $$ begin perform cron.unschedule('timed-reminders'); exception when others then null; end $$;
select cron.schedule('timed-reminders', '*/5 * * * *', $job$
  select net.http_post(
    url := 'https://command.nisria.co/api/cron/timed',
    headers := jsonb_build_object(
      'x-agent-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'agent_tick_secret'),
      'Content-Type', 'application/json'),
    body := '{}'::jsonb); $job$);
