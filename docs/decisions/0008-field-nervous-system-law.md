# ADR 0008: Field-nervous-system Law

**Status:** Adopted
**Date:** 2026-05-29
**Governs:** Law 8 of NISRIA-DOCTRINE.md

## Context

Nisria's delivery happens in Kenya. ~16 team members plus ~10 tailors operate in the field. Their default tool is WhatsApp. They will not log into a portal. They will not fill forms. They will not learn an app. They will, however, send messages.

For the platform to be the org's nervous system, the WhatsApp bot has to be the field-facing edge of that nervous system. Not a forwarder. A relationship.

## Decision

One WhatsApp bot holds a personal 1:1 relationship with each team member and with Nur. On first contact it onboards: collects missing info, lets them pick a language (English or Swahili at minimum), assigns them to their role, links them to their team_member record.

Day-to-day, it accepts task updates, payment confirmations, inventory captures (each item gets a code and a photo against a catalogue), beneficiary updates, and routine status messages. Everything flows into the portal automatically, attributed to the right person.

The bot escalates to Nur only for payments and urgent things. Routine confirmations stay in the bot's lane and update the portal silently.

## Consequences

This requires the WhatsApp Cloud API integration to be complete (currently blocked on the permanent token and app secret). The webhook is live; the send capability needs the credentials.

The team_member record gains: bot conversation history, onboarding completion, chosen language, last contact, current state. Inventory captured via WhatsApp gains: source='whatsapp', photo asset, auto-assigned code.

Pass 3 owns this work, contingent on the operator providing the WhatsApp credentials.

## Rollback

If WhatsApp becomes structurally impossible (Meta business verification fails permanently), Telegram is the fallback nervous system with the same contract. The doctrine is platform-agnostic; the law is about the relationship pattern, not the vendor.
