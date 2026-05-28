-- Nisria Command Center · RLS policies (public)
-- Regenerated from live Supabase project ptvhqudonvvszupzhcfl on 2026-05-29
-- Source: HOW-WE-BUILD.md handoff Step 3. Generator: scripts/gen_schema.py

-- ===== enable row level security =====
ALTER TABLE public.action_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autonomy_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beneficiaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connector_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cortex_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cortex_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cortex_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extraction_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grant_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grant_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_payments ENABLE ROW LEVEL SECURITY;

-- ===== policies =====

-- policies on beneficiaries
CREATE POLICY "beneficiaries_admin_all" ON public.beneficiaries
  AS PERMISSIVE FOR ALL
  TO public
  USING ((app_role() = 'admin'::text))
  WITH CHECK ((app_role() = 'admin'::text));
CREATE POLICY "beneficiaries_editor_rw" ON public.beneficiaries
  AS PERMISSIVE FOR ALL
  TO public
  USING ((app_role() = ANY (ARRAY['admin'::text, 'editor'::text])))
  WITH CHECK ((app_role() = ANY (ARRAY['admin'::text, 'editor'::text])));

-- policies on campaigns
CREATE POLICY "campaigns_anon_read" ON public.campaigns
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((status = ANY (ARRAY['live'::text, 'closed'::text])));
CREATE POLICY "campaigns_staff_all" ON public.campaigns
  AS PERMISSIVE FOR ALL
  TO public
  USING ((app_role() = ANY (ARRAY['admin'::text, 'editor'::text])))
  WITH CHECK ((app_role() = ANY (ARRAY['admin'::text, 'editor'::text])));

-- policies on donations
CREATE POLICY "donations_admin_all" ON public.donations
  AS PERMISSIVE FOR ALL
  TO public
  USING ((app_role() = 'admin'::text))
  WITH CHECK ((app_role() = 'admin'::text));
CREATE POLICY "donations_editor_read" ON public.donations
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((app_role() = ANY (ARRAY['admin'::text, 'editor'::text])));

-- policies on donors
CREATE POLICY "donors_admin_all" ON public.donors
  AS PERMISSIVE FOR ALL
  TO public
  USING ((app_role() = 'admin'::text))
  WITH CHECK ((app_role() = 'admin'::text));
CREATE POLICY "donors_editor_read" ON public.donors
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((app_role() = ANY (ARRAY['admin'::text, 'editor'::text])));

-- policies on grant_applications
CREATE POLICY "grants_staff_all" ON public.grant_applications
  AS PERMISSIVE FOR ALL
  TO public
  USING ((app_role() = ANY (ARRAY['admin'::text, 'editor'::text])))
  WITH CHECK ((app_role() = ANY (ARRAY['admin'::text, 'editor'::text])));

-- policies on inventory
CREATE POLICY "inventory_staff_all" ON public.inventory
  AS PERMISSIVE FOR ALL
  TO public
  USING ((app_role() = ANY (ARRAY['admin'::text, 'editor'::text])))
  WITH CHECK ((app_role() = ANY (ARRAY['admin'::text, 'editor'::text])));

-- policies on outreach
CREATE POLICY "outreach_staff_all" ON public.outreach
  AS PERMISSIVE FOR ALL
  TO public
  USING ((app_role() = ANY (ARRAY['admin'::text, 'editor'::text])))
  WITH CHECK ((app_role() = ANY (ARRAY['admin'::text, 'editor'::text])));

-- policies on team_payments
CREATE POLICY "team_payments_admin_all" ON public.team_payments
  AS PERMISSIVE FOR ALL
  TO public
  USING ((app_role() = 'admin'::text))
  WITH CHECK ((app_role() = 'admin'::text));
CREATE POLICY "team_payments_editor_read" ON public.team_payments
  AS PERMISSIVE FOR SELECT
  TO public
  USING ((app_role() = ANY (ARRAY['admin'::text, 'editor'::text])));
