# Nisria Group Bot

A thin WhatsApp **group** userbot. It links a dedicated WhatsApp number, sits in the
team groups, and forwards every group message to `command.nisria.co/api/group/ingest`
(the one Sasa brain), then posts back any reply the brain decides to send. No brain
logic lives here, so the box is replaceable and the brain stays single-sourced.

This is the **groups** number, separate from the +1 727 Cloud API operator number
(which stays Nur and Taona's 1:1 line and is untouched).

## Why a userbot (and the trade-off)

WhatsApp's official Business Cloud API cannot read or post in group chats, so a bot
that lives inside groups must run on a real linked-device session (Baileys). That is
against WhatsApp's ToS and can get a number flagged. Mitigations: use a **dedicated**
number, keep replies sparse and human (the brain stays silent unless addressed), and
do not blast messages. If it ever gets flagged, move the session behind a residential
proxy. Do not use a number that matters for anything else.

## Deploy on Railway (the night runbook)

1. Push this repo (the `/group-bot` directory) to GitHub, or point Railway at the
   monorepo with root directory `group-bot`.
2. In Railway: **New Project -> Deploy from repo**, set the root directory to
   `group-bot`. Nixpacks builds it from `package.json` (`npm start`).
3. Add a **Volume** mounted at `/data` (this persists the WhatsApp session so it does
   not re-scan a QR on every restart).
4. Set service **Variables**:
   - `PLATFORM_URL=https://command.nisria.co`
   - `GROUP_BOT_SECRET=` the value already set in the platform's Vercel env (ask the
     build notes / `.env.local`), must match exactly.
   - `AUTH_DIR=/data/auth`
   - `GROUP_ALLOWLIST=Nisria,Maisha` (optional; restricts which groups it acts in)
5. Deploy. Open the **deploy logs** and you will see an ASCII **QR code**.
6. On the dedicated group phone: WhatsApp -> Settings -> **Linked Devices** ->
   **Link a device** -> scan the QR. The log prints `connected. listening to team groups.`
7. Add that number to the team WhatsApp groups. It now reads everything, populates the
   portal, and replies only when addressed or asked a direct question.

To re-link a different number: delete the `/data/auth` contents (or the volume) and
redeploy to get a fresh QR.

## Local test

```
cp .env.example .env   # fill PLATFORM_URL + GROUP_BOT_SECRET, AUTH_DIR=./auth
npm install
npm start              # scan the QR printed in the terminal
```

## Health

Logs are pino JSON. `connected. listening to team groups.` means the session is live.
On a dropped connection it auto-reconnects unless WhatsApp revoked the session
(`logged out`), in which case re-scan the QR.
