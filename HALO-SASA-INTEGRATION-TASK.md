# FINAL TASK — Wire Halo (social posting) into Sasa / WhatsApp

> **Do this LAST**, after the gym/auto-heal pass is done, on THIS branch, so it
> merges + deploys in the same single PR (one-driver rule: do not deploy
> command.nisria.co separately).
>
> Dropped here 2026-06-03. The Halo side is already built, deployed, and verified.
> This task is ONLY the Nisria-side wiring (Sasa action + WhatsApp handler) that
> calls Halo's existing bot API.

## Goal
A social-media rep messages the Nisria WhatsApp bot with a photo/video (or an
idea) → Sasa drafts a caption in that brand's learned voice via Halo → rep
approves in chat → Halo publishes to Facebook/Instagram. No app to open.

## What's already DONE (Halo side — do not rebuild)
- App: `sinanagency/social-os`, live at **https://halo.zanii.agency** (custom domain halo.zanii.agency pending TLS).
- Channels CONNECTED for all 3 brands (FB+IG) via a never-expiring Meta system-user token.
- Per-brand **learned voice** (from IG captions/replies + FB posts + FB DM replies) already trained and stored; captions/replies come out in each brand's real voice, no em-dashes, no padding.
- Authenticated bot API (this is what you call):
  - `POST /api/bot/draft` — multipart fields: `tenant` (slug), `file` (the media) OR `note` (text idea), `platforms` (csv, optional e.g. `instagram,facebook`), `hint` (optional). Returns `{ postId, brand, platforms, summary, question, drafts:[{platform,caption,hashtags,bestSlot}], mediaUrl }`.
  - `POST /api/bot/publish` — JSON `{ postId, caption?, hashtags? }` (caption optional = rep edit). Returns `{ status:"published"|"approved", results:[{platform,ok,externalPostId,error,draftOnly}] }`.
  - Auth: header `x-halo-key: <HALO_API_KEY>`. Returns 401 without it.

Tenant slugs: `nisria`, `maisha`, `ahadi`.

## Env to add (platform/.env.local + Vercel)
- `HALO_API_KEY` — value in macOS Keychain: `security find-generic-password -s halo-api-key -w`. (Same value is already set on Halo's Railway service.)
- `HALO_BASE_URL=https://halo.zanii.agency`

## Build (Nisria side)
1. **Add a Sasa capability `post_to_social`** (new action in the Sasa action set; Sasa already has 40+ actions). Trigger: rep sends media to the bot, or says "post this / draft a post for <brand>".
2. **Brand resolution:** map the sending number/rep → default brand, else ask "Which brand — Nisria, Maisha, or AHADI?". Default platforms = `instagram,facebook` (both connected).
3. **Draft:** download the WhatsApp media (existing WA media pipeline), then `POST {HALO_BASE_URL}/api/bot/draft` (multipart: tenant, file, platforms, optional hint = rep's text). Store the returned `postId` against the conversation (pending-approval state).
4. **Approve-in-chat:** reply to the rep, first-person as Sasa, with the drafted caption(s) + "Reply *1* to post, or send your edit." If `question` is non-null, ask it first.
5. **Publish:** on approval, `POST {HALO_BASE_URL}/api/bot/publish` `{ postId, caption?: <rep edit if any> }`. Reply with the result (link/ids on success; honest message if a channel is draft-only).
6. Keep it first-person Sasa throughout (house rule). No em-dashes.

## Acceptance test
Send a real photo to the Nisria bot → receive an in-voice caption → reply "1" →
post appears on the Nisria FB/IG and the bot confirms with the link.

## Known limits (state honestly, don't paper over)
- **FB comment reply/author** is NOT enabled yet (token missing `pages_manage_engagement` — a separate re-auth on the "Nisria Automation" business, parked). Posting + IG comments + DMs work.
- IG image posting needs a public media URL — Halo returns `mediaUrl` and handles it.
- Halo app currently has no login gate (separate hardening item).

## Do NOT
- Do not deploy command.nisria.co separately — this rides the gym pass's single PR/deploy.
- Do not redeploy Halo for this (its side is done).
