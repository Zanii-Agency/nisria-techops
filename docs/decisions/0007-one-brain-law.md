# ADR 0007: One-brain Law

**Status:** Adopted
**Date:** 2026-05-29
**Governs:** Law 7 of NISRIA-DOCTRINE.md

## Context

The platform had Sasa (the AI conductor) but Sasa's awareness was partial. Sasa could read email through the Inbox feed. WhatsApp was a separate stream, not surfaced to Sasa. Smart mode returned navigation cards (links to other pages) rather than performing actions. The Brain (agent_memory org_facts) existed but Sasa wasn't reliably loading it on every interaction.

The operator's expectation was different: one brain, aware of everything, able to do anything within the platform's structure. Not multiple AI surfaces with fragmented context.

## Decision

Sasa sees all email and all WhatsApp. Sasa can read and send any kind of message through the gateway. Smart mode accepts attachments. Every Sasa interaction loads the Brain (org_facts, brand_voice, recent decisions) so Sasa is grounded in who Nisria is.

Smart mode is a real tool-using agent: type a request, Sasa performs the action (creates a task, drafts an email, populates a record, queries live data) and returns the result. Not a navigation aid.

## Consequences

The WhatsApp feed merges into the message stream Sasa reads. The recall() function always surfaces kind='org_fact' (already implemented but must remain non-negotiable). Smart mode gains the ActionGateway-backed tool calls for the verbs it needs: create_task, draft_email, populate_record, update_data, answer_with_live_data.

Pass 3 owns this work. The Sasa system prompt becomes a thicker contract that names its tools and its grounding.

## Rollback

None. Fragmented Sasa is the failure pattern this law eradicates.
