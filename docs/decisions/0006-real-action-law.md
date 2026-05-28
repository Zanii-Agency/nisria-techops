# ADR 0006: Real-action Law

**Status:** Adopted
**Date:** 2026-05-29
**Governs:** Law 6 of NISRIA-DOCTRINE.md

## Context

A "Submit grant application" button drafted an application internally but did not actually submit anything anywhere. The label said "Submit" but the side effect was "save draft." From the operator's perspective, this is a lie: the system reports work that wasn't done.

Other instances: Send buttons that flashed nothing, leaving the operator unsure if anything happened. Newsletter campaign buttons that did nothing because the integration was never wired. Approve and Send on Needs You that sometimes sent empty subject and body because the form contract was sloppy.

The pattern was actions that looked like they worked but didn't, or worked but gave no feedback. Both are violations of operator trust.

## Decision

Every send, move, or submit truly executes. Every action shows loading → success → confirmation. Labels match side effects. A button called "Submit" submits. A button called "Prepare draft" drafts. A button called "Send" sends and confirms.

For grants specifically: "Prepare draft" is a separate action from "Submit to funder." Submit is real (currently means: email the submission package to the funder's intake address) or the button does not exist.

For all actions: the loading-to-done feedback pattern is universal. The operator is never lost.

## Consequences

The grant submission pipeline needs an actual sending integration (email to funder intake address) before the "Submit" button can exist. Until then, the action remains "Prepare draft." This is the honest position.

Every server action audits its label against its effect. The doctrine-reviewer sub-agent flags any mismatch.

## Rollback

None. Mislabeling actions is the failure pattern this law eradicates.
