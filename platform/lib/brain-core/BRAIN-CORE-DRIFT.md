# BRAIN-CORE DRIFT: Sasa Dedup Architecture

## The drift

Sasa does NOT import `shouldProcess` from brain-core's webhook-guard.

Brain-core v0.8 shipped `shouldProcess` as a unified webhook dedup + media-pending buffer. All three bots (jensen, CTH, sasa) received it via sync.sh. Jensen and CTH adopted it. Sasa deliberately did not.

## Why

Sasa's ingress dedup is older and different:

- Sasa uses atomic INSERT with a partial UNIQUE INDEX on `messages.external_id`. The insert itself is the dedup check: a unique violation means another invocation already owns this wamid. One round trip, no race. This predates brain-core's `wa_seen` table approach.

- Sasa's webhook is fire-and-forget (ingress enqueues a `whatsapp.reply` job, returns 200 immediately, the worker runs the brain). The 2s per-sender lock in `shouldProcess` does not help here because the worker runs seconds later anyway.

- Sasa does not need the media-pending buffer. When text + image arrive as two separate webhooks, the ingress stores both as individual `messages` rows, and the worker sorts them by `created_at`. No buffer required.

## What we gain

No double-dedup. No risk of a future brain-core refactor silently changing Jensen's dedup behavior and breaking Sasa with it. Sasa's dedup is local, explicit, and test-covered (`eval/integration/sasa-ingress-fail-closed.test.mjs`).

## What we lose

Unified primitive (two codepaths to maintain). Media-pending merge (text "this" waits for image). Cross-instance lock (in-process Map only, same as Jensen until Redis adapter is added to brain-core).

## When to re-evaluate

If brain-core ships a durable cross-instance lock adapter (`acquireLock`) that Sasa's deployment would benefit from (multiple Vercel instances processing the same sender), or if the `wa_seen` table replaces the `messages.external_id` unique index pattern across the fleet.

For now: deliberate drift, documented, guarded by a static-code test that will fail if anyone imports shouldProcess into the webhook route.
