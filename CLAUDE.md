# Nisria Command Center

Nisria's private operating system. One operator (Nur). Built by SEV7EN Marketing AI. Live at https://command.nisria.co.

Stack: Next.js 14 App Router, TypeScript, Supabase (Postgres + RLS + Storage + Realtime), Vercel.

## The doctrine governs everything

This project obeys NISRIA-DOCTRINE.md. The eleven laws are non-negotiable. Before any change, read the doctrine. After any change, verify against the law that governs your surface. No "done" without proof attached.

## The twelve laws

1. Source-of-truth law
2. Currency law
3. Local-first law
4. Browser-OS law
5. Drill-to-core law
6. Real-action law
7. One-brain law
8. Field-nervous-system law
9. Earn-your-place law
10. Uniform-filter law
11. Honesty law
12. Test-mode law

Full text in NISRIA-DOCTRINE.md. Historical reasoning per law in /docs/decisions/.

## The canonical files

NISRIA-DOCTRINE.md, the constitution.
NISRIA-DESIGN-SYSTEM.md, the visual contract.
NISRIA-DATA-MAP.md, the data contract.
HOW-WE-BUILD.md, the operating method.
STATE.md, current state of the build.

## How to work

Each module has its own CLAUDE.md with the laws operationalized for that surface. When working in /platform/app/finance, read /platform/app/finance/CLAUDE.md first. Same for workspace, beneficiaries, components, lib. Load only what you need.

Four sub-agents enforce the doctrine: doctrine-reviewer, money-truth-auditor, local-first-enforcer, drill-to-core-checker. See /.claude/agents/. Invoke them before claiming done.

Four skills hold operational patterns: currency-handling, drive-extraction, verification-protocol, focus-sheet-pattern. See /.claude/skills/. Reference by name.

## Hard rules at this layer

No em-dashes in any output (commas, periods, colons only). No timeline mentions (phases and sequencing only). KES and USD never mix. No fabricated data. PII never reaches anon. Extend beside, do not rewire. Deploy from /platform/ only.

## When in doubt

Read the doctrine. Read the relevant ADR. Run the relevant auditor. Show proof.
