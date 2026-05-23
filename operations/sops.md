# SOPs — Repeatable Operating Procedures

Step-by-step procedures so any delegate/VA can run the recurring work without re-asking. Live in Drive `09_OPERATIONS/SOPs/`. Each SOP = trigger, steps, done-when.

---

## SOP-1 · Weekly content cycle (Delegate, Mon–Fri)

1. **Mon** — open the editorial calendar (`content/social-calendar-template.csv` in Drive `07_CONTENT/`); fill the week (pillars × brands × platforms). Pick 2 hero ideas (Nisria + Maisha).
2. **Mon** — generate the 2 blog drafts with Claude (seed: topic + pillar + 1 fact + `brand-voice.md`). Save `_DRAFT` to `07_CONTENT/Blog Drafts/`.
3. **Tue** — human-edit blogs (fact-check, consent-check), publish to Squarespace.
4. **Tue** — atomize the 2 heroes into the week's social (captions + hashtags + alt text) via Claude.
5. **Wed** — design assets in Canva from the brand templates.
6. **Wed** — schedule social (Meta Business Suite for FB/IG; native for others).
7. **Thu** — assemble the Nisria newsletter (Claude) from the week's best; queue in Givebutter/Substack.
8. **Fri** — review + send newsletter; engage/respond all week.
**Done when:** 2 blogs published, week of social scheduled across 3 brands, newsletter sent.

## SOP-2 · Ad Grants weekly check (Delegate)

1. Open Google Ads (`tech@nisria.co`). Check account CTR ≥ 5%.
2. Pause low-CTR ads/keywords; pause any keyword with quality score 1–2.
3. Search-terms report → add negatives, harvest new keywords.
4. Confirm conversions firing (GA4). Check budget pacing toward $10k.
5. Ensure ≥2 active ads per ad group; add a fresh RSA if needed.
6. Log changes in Drive `06_FUNDRAISING/` (also satisfies the activity requirement).
**Done when:** CTR healthy, no QS 1–2 live, negatives added, changes logged.

## SOP-3 · Donor data hygiene (Delegate, weekly + monthly)

- Weekly: confirm Givebutter→Supabase sync ran (spot-check latest gifts present, no dupes). Tag new donors; flag any data gaps.
- Monthly: dedupe donors, refresh segments, recompute lapsed list, verify rollups (lifetime_value, last_gift_at).
**Done when:** Supabase matches Givebutter; segments current.

## SOP-4 · Beneficiary intake (Kenya team)

1. Meet beneficiary → fill the intake Google Form.
2. Assign `ref_code`; create Drive case folder `01_BENEFICIARIES/Case Files/<ref_code>`.
3. Consent conversation → signed form → upload to `_Consent Forms/` (link to record).
4. Confirm Supabase row created (consent_public=false by default).
5. If consent given → web manager fills public_name/story/photo. (See `data/beneficiary-intake.md`.)
**Done when:** private record + folder exist; public profile only if consented.

## SOP-5 · Folklore listing batch (Delegate + AI)

1. Export Supabase `inventory` where folklore_listed=false & in_stock → sheet in `08_INVENTORY & FOLKLORE/Listings/`.
2. Draft descriptions (Claude, story-led); confirm pricing with Nur; attach photo links.
3. Add products in the Folklore seller dashboard.
4. Write `folklore_url` + set `folklore_listed=true` back in Supabase.
**Done when:** batch live; Supabase mirrors listing state.

## SOP-6 · Weekly outreach (Delegate)

1. Refresh target list (10–20) for the active sequence (CSR/influencer/partner).
2. Send personalized first touches (human writes hook, Claude assists body) per `outreach-sequences.md`.
3. Advance everyone with a pending next_action; log all touches in Supabase `outreach`.
**Done when:** first touches sent, pipeline updated, next actions dated.

---

*New recurring task → write an SOP here, link it from the relevant pillar doc, and (if automatable) add it to `automation/automation-map.md`.*
