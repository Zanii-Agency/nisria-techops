# Autonomous Run Protocol (autoclaude, silent until done)

How I run the Nisria build once Sinan gives the signal. The rule: work nonstop, do not
check in, surface only when the whole thing is done or genuinely blocked. Pairs with
NISRIA-BUILD-SPEC.md (what + order), NISRIA-DESIGN-SYSTEM.md + design-principles/references
(how it looks), OVERNIGHT-LOG.md (live state), the task spine.

## Mode
- AUTONOMOUS + NONSTOP. No progress chatter, no "shall I proceed", no per-step approval.
- We have assumed I am good enough; verification is the single extracted-vs-truth audit at the END,
  not a per-batch gate during the build.
- Work the task spine top to bottom, then the full build order in the spec. Pending now: #50, #51, #58,
  then the spec phases (extraction gate, Finance MVP, beneficiaries/grants/legal/reports, navigation
  chrome, cockpit, Sasa recall + comms).

## The silence rule (when I DO talk)
I break silence with a single push notification ONLY for:
1. DONE: the whole run is complete, deployed behind the flag, each module verified by my own eyes,
   and the extracted-vs-truth audit report produced. I ping once with the summary + the audit.
2. HARD BLOCKER: something that halts ALL remaining work and I cannot route around (e.g. a needed
   credential that's missing). Even then I first exhaust every other task, then ping with exactly what
   I need. I do not stop the whole run for a blocker on one module; I skip it, log it, keep going.
3. SAFETY: anything destructive, irreversible, or outside the mandate. I stop and ask. (Rare.)
Otherwise: total silence. No "finished phase 2" updates. You hear from me when it's done.

## How I keep going (the engine)
- Each unit: build, typecheck green, deploy behind the flag, VERIFY (render + screenshot + judge with
  my own eyes against the reference and the principles; for data, reconcile against source), commit at
  the green point, then the next. Blast radius one module, always revertable.
- Persist across resets: the task spine + OVERNIGHT-LOG are the memory; on any compaction or restart I
  resume on the first incomplete task. I re-read the governing docs at the start of each phase.
- Long operations run as background jobs that notify me on completion so waiting never means stopping.
- If I would ever go idle with work remaining, I schedule a wakeup to resume. The in-app cron/watcher
  is what runs forever unattended; my session runs the long build stretch.

## Definition of done (what unlocks the one ping)
- Every spine task + spec phase complete; the app built behind NEXT_PUBLIC_WORKSPACE; today's app
  untouched as the fallback.
- Every screen checked with my own eyes against its real-world reference and the design principles.
- All financial + beneficiary data staged, reconciled, committed, with the extracted-vs-truth audit
  report ready for Sinan to review.
- COMPONENTS.md, design docs, and OVERNIGHT-LOG updated; everything committed + pushed to main.

## Guardrails (always on, even in silence)
No fabricated data; KES/USD separate; idempotent (batch tags); never auto-send WhatsApp/email during
the build; sensitive data private (RLS, never public/client-exposed); no em-dashes/placeholders;
extend beside, never rewire the working app; deploy from platform/ only; never push .github/workflows.

## The single end deliverable
One push notification + a written wrap: what was built, where, the extracted-vs-truth audit, what (if
anything) is blocked on you, and the one flag to flip to see it all. That is the only time I speak.
