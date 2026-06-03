-- WhatsApp worker drain heartbeat. Vercel Hobby caps crons at DAILY, too slow to
-- drain queued reply jobs promptly. Drive it from Supabase pg_cron + pg_net instead
-- (managed, always-on, in-infra — no external box, no Pro plan). The auth secret
-- lives in Supabase Vault (name 'agent_tick_secret'), so it is never committed to git.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin perform cron.unschedule('whatsapp-worker-drain'); exception when others then null; end $$;

select cron.schedule('whatsapp-worker-drain', '*/2 * * * *', $job$
  select net.http_post(
    url := 'https://command.nisria.co/api/whatsapp/worker',
    headers := jsonb_build_object(
      'x-agent-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'agent_tick_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
$job$);
