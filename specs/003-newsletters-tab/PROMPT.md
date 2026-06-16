# 003 — Newsletters Tab (Givebutter Replacement)

> Fire-able spec brief for the Nisria command portal. Paste this into a fresh session at `~/Code/nisria-techops` to kick off SPEC → ADR → SCHEMA → EVAL → CODE → SOAK.

---

## GOAL

Add a **Newsletters** tab to `command.nisria.co` that replaces **Givebutter** as Nur's donor-outreach + bulk-email tool. Nur drafts campaigns with **Sasa-assisted compose** (copy + visual blocks), reviews, sends. All contacts imported from **Gmail + Givebutter export** so day-one she has her full list.

## OPERATOR — NUR

- Dubai-based, runs Nisria Community Development Foundation (NOT "Acme Foundation" — see existing org-fact wall)
- WhatsApp-first management — newsletters are her first sustained non-WhatsApp surface on the portal
- Currently on Givebutter for: donor list, email blasts, donation/event pages. She wants out.
- Portal already has: `donors / beneficiaries / cases / contacts / team_members / payments / events / tasks / notes`, M-Pesa receipts, today-calendar wall, brain captures, Sasa LLM-tools layer

## VOICE DOCTRINE — TWO VOICES, NOT ONE (KT #292)

This is the load-bearing architectural call. Do not collapse.

- **Compose-side (Sasa → Nur):** first-person Sasa. "I drafted this — want me to soften the ask?" Same voice as the rest of the portal.
- **Rendered-side (Nisria → donor):** organizational voice, signed by Nur. **Never** Sasa introducing herself.

Sasa is the **ghostwriter**, not the author. Same shape as Jensen mail autopilot (KT #196). A donor opening the email reads Nisria. The compose UI reads Sasa.

EVAL rubric MUST grade both shapes separately.

## DECIDED STACK

| Concern | Pick | Why |
|---|---|---|
| Email provider | **Resend** (broadcasts API + React Email) | At ~5K/mo cost spread is $0–$20; decider is fit. RE components map 1:1 to block editor (hero/paragraph/CTA/divider), preview pane uses same JSX as send pipeline. SES = save $0.50, write own stack. Postmark = transactional-biased + pricier. |
| Sending domain | `nisria.co` with SPF/DKIM/DMARC | Pre-flight: WHOIS check. Likely Name.com via `taonac96` account (matches pattern across Taona's other domains). |
| Contacts source | Gmail People API + Givebutter CSV | OAuth on Nur's Gmail; CSV upload from Givebutter admin (Contacts → Export, Transactions → Export). Fallback if locked: Givebutter REST API with org key. |
| Voice | Sasa ghostwriter + Nisria author | See doctrine above. |

## SCHEMA ADDITIONS

```sql
-- contacts: extend
ALTER TABLE contacts ADD COLUMN source TEXT;        -- 'gmail' | 'givebutter' | 'manual' | 'portal'
ALTER TABLE contacts ADD COLUMN subscribed BOOLEAN DEFAULT TRUE;
ALTER TABLE contacts ADD COLUMN unsubscribed_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN tags TEXT[] DEFAULT '{}';
CREATE INDEX contacts_tags_gin ON contacts USING GIN (tags);

-- campaigns
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,
  body_blocks JSONB NOT NULL,         -- ordered array of {type, props}
  segment_query JSONB NOT NULL,       -- tag filter spec
  status TEXT NOT NULL,               -- 'draft' | 'queued' | 'sending' | 'sent' | 'failed'
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,           -- 'nur' | 'sasa-draft'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- campaign_sends — one row per (campaign, contact)
CREATE TABLE campaign_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id),
  contact_id UUID REFERENCES contacts(id),
  resend_id TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  last_click_at TIMESTAMPTZ,
  bounced BOOLEAN DEFAULT FALSE,
  complained BOOLEAN DEFAULT FALSE,
  UNIQUE (campaign_id, contact_id)
);

-- campaign_events — raw Resend webhook audit log
CREATE TABLE campaign_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  send_id UUID REFERENCES campaign_sends(id),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- suppression list — shared across campaigns
CREATE TABLE email_suppressions (
  email CITEXT PRIMARY KEY,
  reason TEXT NOT NULL,                -- 'unsubscribe' | 'bounce' | 'complaint' | 'manual'
  added_at TIMESTAMPTZ DEFAULT NOW()
);
```

Migration delivery: `cat <migration.sql> | pbcopy` → Nur runs in Supabase SQL editor.

## BUILD ORDER — TIER 1 PIPELINE

1. **SPEC** → `specs/003-newsletters-tab/spec.md` (this PROMPT becomes the seed)
2. **ADR** → `docs/decisions/ADR-NNNN-newsletter-provider.md` — Resend chosen, Postmark + SES documented as rejected with $/MENA-deliverability reasoning
3. **SCHEMA** → migration above, `pbcopy` to Nur
4. **Resend domain setup** — WHOIS `nisria.co` first; SPF/DKIM/DMARC records via registrar
5. **Contacts ingest worker**
   - Gmail People API OAuth flow on Nur's account
   - Givebutter CSV uploader (drag-drop, dedupe by email)
   - Source tagging + tag inference (donor/board/volunteer/press) from existing portal rows where overlapping
6. **Compose UI**
   - Block editor: hero / paragraph / CTA / divider / image
   - Sasa-chat sidebar (first-person to Nur, edits the blocks she's looking at)
   - Live preview pane (React Email JSX → HTML)
   - Segment picker pulling from `tags[]` + existing portal records
7. **EVAL** — rubric Sasa drafts get graded against BEFORE Nur sees them:
   - Does the rendered email read as Nisria-org (not as AI)?
   - Does the Sasa-chat sidebar read as Sasa-to-Nur (first-person, peer)?
   - Single CTA? Mobile-readable? Donor-appropriate ask amount?
8. **Send pipeline**
   - Suppression-list check (unsub + bounce + complaint)
   - Resend broadcast API
   - Idempotency on `(campaign_id, contact_id)` so re-runs don't double-send
9. **Resend webhook handler**
   - Open / click / bounce / complaint events → `campaign_sends` + `campaign_events`
   - Bounce/complaint → flip `subscribed=false` + add to `email_suppressions`
10. **History view** — sent / open / click rates per campaign; one-click "re-send to non-openers"
11. **SOAK** — first send goes to small board segment (5–10 contacts) Nur curates. 48h observation window. Donor list opens after that.

## OUT OF SCOPE — V1

- Donation pages / payment forms (Givebutter's other half) → v2 after v1 soaks
- SMS / WhatsApp broadcasts (separate rail; WhatsApp Business templates need their own approval flow)
- A/B testing
- Drip sequences / automations
- Designed-from-scratch templates beyond the 3 starters (announcement / donor-update / event-invite)

## PRE-BUILD CHECKS — RESOLVE BEFORE SPEC

- [ ] Givebutter org-admin access for CSV export (or fall back to API key)
- [ ] Gmail account for People API OAuth scope (likely Nur's primary)
- [ ] `nisria.co` DNS access — WHOIS first; assume Name.com via `taonac96` unless WHOIS says otherwise
- [ ] Confirm Resend account exists under zanii agency org (or create)

## KICKOFF COMMAND

When ready:

```
/spec 003-newsletters-tab
```

Then walk: Problem → Outcome with metrics → Scope → User flow → Non-goals → Open questions → 10+ golden-set test cases. The voice doctrine above is the hardest test-case shape — golden set must include "rendered email reads as Nisria, not Sasa."

---

**Related knowledge-tree nodes:**
- KT #292 — AI-assistant voice ≠ output-artifact voice (this brief's load-bearing call)
- KT #196 / #197 — Jensen mail autopilot (same voice-separation shape, mail edition)
- KT #229 — Wall-at-primitive (apply to suppression list: enforce at send-pipeline primitive, not at each campaign)
- KT #274 — Port to sibling primitives (when send pipeline lands, mirror suppression check to any future SMS/WhatsApp rail)

**Existing feedback governing this work:**
- `feedback_sasa_always_first_person.md` — Sasa is first-person to Nur (governs compose-side)
- `feedback_supabase_to_clipboard.md` — migrations `pbcopy` to Nur, never file paths
- `feedback_shipped_means_live_url.md` — "shipped" only after a live send curls green to a real inbox
- `feedback_no_time_estimates.md` — sequence, no durations
