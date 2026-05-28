# Skill: Verification Protocol

Operational pattern for the Honesty Law (Law 11). Reference at the end of every pass, before every "done" claim, and after every database mutation.

## The contract

No "done" without proof. Every claim of completion includes evidence the operator can verify. The proof template is mandatory.

## The proof template

```markdown
## Proof: <pass/task name>

**Scope.** What was in scope, what was deliberately out of scope.

**Laws enforced.** Which doctrine laws govern this work.

**Sub-agents run.**
- doctrine-reviewer: <output summary, link to full output>
- money-truth-auditor: <baseline → after; deltas>
- local-first-enforcer: <hits before → after>
- drill-to-core-checker: <entities checked; gaps>

**Audit queries.**
```sql
<query 1>
```
Result: <output>

```sql
<query 2>
```
Result: <output>

**Row counts.**
- <table>: <count before> → <count after>
- <table>: <count before> → <count after>

**Spot checks.**
- Record <id>: source <doc id> shows <values>, platform shows <values>. Match: <yes/no>.
- Record <id>: ...
- Record <id>: ...

**Screenshots.** (paths or links)
- <screen 1>: <path>
- <screen 2>: <path>

**Known gaps.** What is deliberately left, and why.

**Sign-off.** Pending operator review.
```

## When to fill the template

**At pass close-out.** Every pass ends with a filled template. The operator reviews. If the template is incomplete (no audit queries, no spot checks, no screenshots), the pass is not done regardless of the code written.

**After significant mutations.** Any time the agent runs an UPDATE, INSERT, or DELETE against more than a handful of rows, the action is bracketed with audit queries before and after. The diff between them is recorded.

**Before claiming a bug is fixed.** Not "I fixed the bug." Instead: "I changed <file>, the audit query <X> returns <expected result>, the screen shows <verified state>, here are screenshots."

## How to gather the proof

### Audit queries

For data work, run the relevant queries from the money-truth-auditor or write a custom one. The query must be the same one the sub-agent would use; consistency matters.

### Row counts

```sql
-- Before
select count(*) from <table> where <condition>;

-- After
select count(*) from <table> where <condition>;
```

The delta is the proof. If the count didn't change, either the work wasn't actually done or the condition is wrong.

### Spot checks

Pick three random records affected by the change. For each: open the source (Drive doc, bank statement, original message), open the platform's view, compare. Note any drift. Three is the minimum; for high-stakes changes (currency, PII), check ten.

### Screenshots

For UI changes: take screenshots via the scripts/shot.mjs eye if it exists, or browser screenshot, or describe the rendered state precisely in text if screenshots aren't available. The doctrine cares that the operator can verify, not about the file format.

### Sub-agent reports

Run the relevant sub-agents and link to their output. doctrine-reviewer's report is mandatory for any commit. money-truth-auditor is mandatory for any Finance work. local-first-enforcer is mandatory for any Pass 1 work. drill-to-core-checker is mandatory for any Pass 2 work.

## Anti-patterns

**Anti-pattern.** "Pass 0 done. Money is fixed."
**Fix.** Fill the template. Show the queries. Show the deltas. Name the gaps.

**Anti-pattern.** "I verified it works."
**Fix.** Verified how? Against what? Paste the output.

**Anti-pattern.** "The screenshot shows it's working."
**Fix.** Attach the screenshot or describe what's in it. "Working" is not a verification; the verified state is the verification.

**Anti-pattern.** "Tests pass."
**Fix.** Tests are necessary but not sufficient. The doctrine requires real-world verification (the live database, the rendered UI), not just unit tests.

**Anti-pattern.** Skipping the template because "this is a small change."
**Fix.** No size threshold. Every "done" claim carries proof. Small changes have small proofs (one query, one spot check) but they still have proofs.

## The historical context

This skill exists because past work was reported as done when it wasn't:
- The salaries-first reorder was reported live; the operator saw the old order on a cached page; the work was real but the verification was sloppy.
- The em-dash cleanup was applied at generation but old stored rows weren't cleaned, so dashes still appeared.
- The dup-approvals fix changed the code but didn't clean existing duplicate rows in the DB.
- The bank reconciliation "tallied" with a synthetic entry that wasn't initially disclosed.

In each case, the work had real value but the reporting overshot. The verification protocol is the cure.

## When this skill applies

Every time the agent is about to claim done. Every time the agent is about to mutate data. Every time the agent is about to commit. The protocol is the discipline that keeps the platform honest.
