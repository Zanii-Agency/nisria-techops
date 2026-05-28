# Beneficiaries Module Rules

Governs /platform/app/beneficiaries/ and any code that touches beneficiary PII. Read before any change.

## Laws governing this surface

- **Law 1 (Source-of-truth).** Every beneficiary record traces to its source: the Kwetu Database, Microfund Database, or HM Sponsored Students sheet.
- **Law 5 (Drill-to-core).** This is the reference profile. Other entity profiles are built to this standard.
- **Law 3 (Local-first).** Photos and IDs open in FocusSheet image viewers. Never external.

See /NISRIA-DOCTRINE.md and /docs/decisions/0001, 0003, 0005.

## The skills that apply

- `drive-extraction`. For any code that ingests beneficiary data from Drive.
- `focus-sheet-pattern`. For photo and ID viewing.
- `verification-protocol`. At end of every change.

## The PII contract

Beneficiaries are children. Sensitive identifiers (national_id, case_number, contact_phone, date_of_birth, age_at_intake, full_name, location, region, guardian_status, story_private) are private PII.

Hard rules:
1. **RLS enforced.** The `beneficiaries` base table has no anon policy. Anon queries return 401. Verified.
2. **Public path is the view only.** `public_beneficiary_profiles` exposes alias name, program, sanitized story, consented photo, funding progress. No full name, no location, no guardian, no DOB.
3. **Consent gate.** A beneficiary's public profile is only generated when `consent_public = true` AND a signed consent form exists in Drive linked to the record. The `consent_date` stamp triggers automatically.
4. **Photos.** Stored in the private `assets` Supabase Storage bucket. Surfaced via signed URLs only, scoped to the operator's session. Never world-readable. Never linked externally.
5. **Service-role only server-side.** No client-side Supabase calls touch this table or any related PII table.

## The data sources

- **Kwetu Database (rescue children).** ~32 records. Source: Drive sheet "2025 Kwetu Database." Carries: name, age_at_intake, case_number, case_type, story (the Resolution column), photos (cross-referenced by name).
- **Microfund Database (women in groups).** ~46 records. Source: Drive sheet "2025 Microfund Database." Carries: name, national_id, contact_phone, group, role.
- **HM Sponsored Students.** ~15 records. Source: HM Sponsored Students sheet. Alumni cohort.

Total: 93 imported. Each record has program=safe_house|education|rescue|nutrition|other and category for filtering.

## The reference profile

The 360 page at /platform/app/beneficiaries/[id]/page.tsx is the reference. Required sections:
- Identity (alias name if public_name set; ref_code; cohort; program; category; intake_date; status)
- Photo (when present; from photo_asset_id; signed URL)
- Identifying facts (age, case_number for rescue cohort; national_id and phone for microfund; school for sponsored students; all tagged Private)
- Story (story_private rendered scrollable; public_story shown alongside if consent_public)
- Lifecycle (intake_date, consent_date, status transitions)
- Funding (goal_amount, funded_amount, percentage)
- Related (sponsor link if any; guardian link for microfund)
- Actions (edit, advance state, toggle consent, attach photo)

Every other entity profile (donor, campaign, contact, team, grant) is built to mirror this depth.

## Hard rules specific to beneficiaries

1. **No fabricated detail.** If a beneficiary has no story extracted, the field shows "No story on file" with an "Add story" affordance. Never a placeholder paragraph.

2. **Photos match exactly.** Filename-to-name match only. Fuzzy matches require operator confirmation before attachment. A wrong photo on a child's record is a safeguarding error.

3. **No anon visibility on PII.** The audit query `select * from beneficiaries` with the anon key must return 401. Verified by money-truth-auditor's PII sibling check (TODO: add to auditor or as separate pii-auditor).

4. **Consent withdrawal is instant.** Setting `consent_public=false` removes the record from `public_beneficiary_profiles` view immediately. The trigger handles the date stamp.

5. **Past children honored as Alumni.** Sponsored Students cohort is Alumni, not Active or Exited. They carry their journey forward.

## What violates this module's law

- A beneficiary list showing full names publicly
- A photo opening with `target="_blank"`
- An anon Supabase query that returns beneficiary data
- A demo or seed beneficiary in production (`ref_code LIKE 'DEMO%'` must be 0)
- A profile with a fabricated story body
- A photo attached without operator confirmation when match was fuzzy

## Before commit checklist

1. Run doctrine-reviewer.
2. Verify anon access returns 401 on the beneficiaries table.
3. If photos changed: spot-check three random photo attachments against the source folder.
4. If stories changed: spot-check three random stories against the Kwetu Resolution column.
5. Fill proof template.

## Data Nur owes (current gaps)

- ~78 records still lack photos
- Beneficiary IDs (national_id) present for microfund only; rescue cohort uses case_number
- DOBs not in Drive (only age_at_intake); do not invent
- Detailed individual stories beyond the Kwetu Resolution extract: operator-supplied

These gaps are listed in STATE.md. Do not fabricate to fill them.
