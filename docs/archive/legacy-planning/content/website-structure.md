# Website Structure — Nisria & Maisha (Squarespace) (Pillar 1)

Sitemaps + page-by-page briefs for the two priority websites, wired to the rest of the stack (Givebutter donate, Supabase-backed beneficiary profiles/meter widgets, Ad Grants landing pages). Owner: Delegate. ⚑ confirm exact mission/programs with Nur.

> Goal: each site must (1) explain the cause credibly, (2) make giving frictionless, (3) prove impact transparently, (4) serve as Ad Grants landing pages (HTTPS, clear CTAs, conversion-tracked).

## Nisria — sitemap

```
Home
├── About            (mission, story, team, registration/credibility)
├── Programs         (Education · Food · Health · Livelihood — one section each)
├── Impact           (numbers + stories + beneficiary profiles widget + reports)
├── Donate           (Givebutter form; once/monthly; suggested amounts)
├── Get Involved     (volunteer, fundraise, CSR/partnerships, share)
├── Shop             (→ The Folklore, "buy = give back")
├── Blog / News      (weekly posts; Ad Grants + SEO)
└── Contact
```

### Page briefs (Nisria)

- **Home:** one-line mission above the fold + strong photo + primary CTA (Donate). Then: the problem (1 stat), what we do (3 program tiles), impact proof (live meter widget + 1 story), trust (registration, transparency), secondary CTA. Footer: newsletter signup (conversion), socials.
- **About:** mission, origin story, the Kenya team (real people), governance/registration, "where your money goes" transparency block.
- **Programs:** each program = need → what we do → outcome → cost-to-impact (⚑ real figures) → CTA to fund it.
- **Impact:** headline numbers, the `/beneficiaries` profiles widget (embed from `widgets/`), recent reports (from Drive `04_REPORTS`), donor testimonials.
- **Donate:** embed Givebutter; default to monthly prompt; "what your gift does" microcopy; thank-you URL = GA4 conversion.
- **Get Involved:** volunteer form (conversion), start-a-fundraiser (Givebutter P2P), CSR/partnership pitch + contact, share buttons.
- **Shop:** link to The Folklore + "proceeds fund X."
- **Blog:** weekly posts; each ends with a donate CTA + newsletter signup.

## Maisha — sitemap (lighter, lifestyle-leaning)

```
Home · About · Stories (impact/blog) · Support (donate) · Get Involved · Contact
```
Same wiring (Givebutter donate, conversions, newsletter), warmer/story-led tone per `brand-voice.md`. AHADI: a single-page site or section initially (medium priority).

## Cross-cutting requirements

- **HTTPS**, fast, mobile-first (Ad Grants + most Kenyan/diaspora traffic is mobile).
- **Conversions wired** on every CTA (donate, monthly, newsletter, volunteer, contact, Folklore click) → GA4 → Ads.
- **Consistent CTAs**: Donate is always reachable in one tap.
- **Newsletter signup** in footer + after blog posts (Givebutter/Substack).
- **Embed widgets** from `widgets/` (campaign meter on Donate/Home, beneficiary grid on Impact).
- **SEO basics**: titles/meta per page, alt text, sitemap, the blog for long-tail.

## Ad Grants landing pages

Point Ad Grants campaigns (`fundraising/ad-grants-starter-campaigns.md`) at the matching page: Donate→/donate, Volunteer→/get-involved, Programs→/programs/<x>, Shop→/shop. Each must have a single clear conversion and load fast.
