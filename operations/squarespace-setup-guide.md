# Squarespace Setup / Update Guide

How to implement `content/website-structure.md` + homepage copy in Squarespace for Nisria & Maisha, wired to Givebutter, GA4 conversions, and the Vercel widgets. Owner: Web Manager.

## 0. Before building

- Confirm you have the existing Squarespace login (⚑ which account owns the current sites).
- Decide: update the existing site vs rebuild section-by-section (prefer update, page by page).
- Have ready: logo/brand kit, consented photos, the homepage copy files, Givebutter campaign + form, Vercel widget URLs.

## 1. Pages & navigation

1. Create/confirm the pages from the sitemap (Home, About, Programs, Impact, Donate, Get Involved, Shop, Blog, Contact).
2. Set primary nav; make **Donate** a button (high contrast), present in header on every page.
3. Mobile-first: check every page on a phone.

## 2. Paste the copy

- Use `content/nisria-homepage-copy.md` / `maisha-ahadi-homepage-copy.md` section by section.
- Replace every ⚑ with confirmed figures/links; use only consented imagery.

## 3. Donations (Givebutter)

- Embed the Givebutter donation form/block on **Donate** (and a "donate" CTA elsewhere). Per `fundraising/givebutter-setup.md`.
- Set the Givebutter **thank-you redirect** to a `/thank-you` page on Squarespace → that URL is your GA4 conversion trigger.

## 4. Widgets (Vercel)

- Embed the **campaign meter** on Home + Donate:
  `<iframe src="https://<app>.vercel.app/campaign/<id>" width="100%" height="220" style="border:0"></iframe>`
- Embed the **beneficiary profiles** grid on Impact:
  `<iframe src="https://<app>.vercel.app/beneficiaries" width="100%" height="900" style="border:0"></iframe>`
- (Squarespace: use a Code/Embed block. ⚑ Business plan or higher may be needed for code blocks.)

## 5. Analytics & conversions (critical for Ad Grants)

- Install **GA4** (Squarespace Settings → Analytics, or inject the tag).
- Define conversions: donation thank-you pageview, newsletter signup, volunteer/contact submit, Folklore outbound click.
- Link GA4 ↔ Google Ads so Ad Grants can optimize to conversions.

## 6. Newsletter

- Add signup blocks (footer + after blog posts) → connect to Givebutter/Substack list.

## 7. SEO + launch checks

- Per-page title + meta description; alt text on images; submit sitemap to Google Search Console.
- HTTPS on (Squarespace default); test all CTAs end-to-end (a real $1 donation → does it record a conversion?).
- Test all widget embeds load on mobile.

## 8. Ad Grants landing pages

Point each campaign (`fundraising/ad-grants-starter-campaigns.md`) at the matching page; ensure each has one clear conversion and fast load.

> Done when: both sites updated, donate works end-to-end with a tracked conversion, widgets render on mobile, GA4 linked to Ads.
