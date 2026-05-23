# Nisria Command Center

The **master admin platform**, one place Nur logs into to see and run everything: donors, donations, campaigns, beneficiaries, inventory, grants, outreach, with a live fundraising dashboard. Backed by the Supabase brain (`../data/schema.sql`).

## What it is

- **Next.js (App Router)**, server-rendered, reads Supabase with the **service role key** (server-side only).
- **Password-gated** (middleware + session cookie), it holds donor + beneficiary PII, so it's never public.
- Clean, data-dense admin UI (no public-facing fluff). Light, Linear/Stripe-style.

## Pages

| Route | What |
|---|---|
| `/` | Dashboard: raised MTD/all-time, donors, recurring, beneficiaries, live campaign meters, the social→site→donate funnel, recent donations |
| `/donors` | Donor CRM (sorted by lifetime value) |
| `/donations` | Every gift, with donor + campaign |
| `/campaigns` | Campaigns with live progress meters |
| `/beneficiaries` | Beneficiary records (consent-gated for public) |
| `/inventory` | Stock + The Folklore listing status |
| `/grants` | Grant pipeline by deadline |
| `/outreach` | CSR / influencer / partner pipeline |

## Env (Vercel project, server-only, NOT NEXT_PUBLIC)

```
SUPABASE_URL=https://ptvhqudonvvszupzhcfl.supabase.co
SUPABASE_SERVICE_KEY=...        # full DB access, server-side only
ADMIN_PASSWORD=...              # what you type at /login
SESSION_TOKEN=...               # random; the cookie value on success
```

## Run locally

```bash
cd platform && npm install
cp .env.example .env.local   # fill the 4 vars
npm run dev                  # http://localhost:3000 → redirects to /login
```

## Security model

- Service key + all secrets are **server-only** (no `NEXT_PUBLIC`), so they never reach the browser.
- Middleware redirects every route to `/login` unless the session cookie matches `SESSION_TOKEN`.
- This is the **admin** counterpart to the public `../widgets/` app (which uses only the anon key + the consent-gated view).

> v1 is read + view across all entities with a live dashboard. v2: inline editing, donor detail pages, CSV export, and write-actions (log a gift, mark a grant submitted).
