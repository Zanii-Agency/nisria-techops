#!/usr/bin/env bash
# apply-foundation.sh
#
# Run this from the root of nisria-techops to land the foundation.
# It expects the foundation files to have been unzipped into the repo root.
# Idempotent: safe to re-run; existing archives are skipped.

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "== Foundation install starting in $REPO_ROOT =="

# 1. Ensure the new folders exist
mkdir -p docs/archive docs/archive/legacy-planning docs/archive/legacy-sql docs/decisions docs/baselines
mkdir -p .claude/agents .claude/skills

# 2. Move superseded top-level docs to /docs/archive/
declare -a TOP_LEVEL_TO_ARCHIVE=(
  "DESIGN-LOGIC-AUDIT.md"
  "FEEDBACK-ROUND-2026-05-26.md"
  "QA-SWEEP-2026-05-26.md"
  "NISRIA-IA-AUDIT.md"
  "LOGIC.md"
  "NISRIA-BUILD-SPEC.md"
  "RUN-PROTOCOL.md"
  "RUNBOOK.md"
  "OVERNIGHT-LOG.md"
  "README.md"
)

for f in "${TOP_LEVEL_TO_ARCHIVE[@]}"; do
  if [ -f "$f" ]; then
    echo "archiving: $f -> docs/archive/$f"
    git mv "$f" "docs/archive/$f" 2>/dev/null || mv "$f" "docs/archive/$f"
  fi
done

# 3. Move legacy planning folders
declare -a FOLDERS_TO_ARCHIVE=(
  "content"
  "fundraising"
  "operations"
  "comms"
  "automation"
)

for d in "${FOLDERS_TO_ARCHIVE[@]}"; do
  if [ -d "$d" ]; then
    echo "archiving folder: $d -> docs/archive/legacy-planning/$d"
    git mv "$d" "docs/archive/legacy-planning/$d" 2>/dev/null || mv "$d" "docs/archive/legacy-planning/$d"
  fi
done

# 4. Move legacy SQL files into docs/archive/legacy-sql/
if [ -d "data" ]; then
  echo "archiving legacy SQL from data/ -> docs/archive/legacy-sql/"
  # Only move SQL files; leave any non-SQL data assets alone for now
  find data -maxdepth 1 -type f -name '*.sql' -exec git mv {} docs/archive/legacy-sql/ \; 2>/dev/null \
    || find data -maxdepth 1 -type f -name '*.sql' -exec mv {} docs/archive/legacy-sql/ \;
fi

# 5. Verify the foundation files landed
declare -a REQUIRED=(
  "CLAUDE.md"
  "NISRIA-DOCTRINE.md"
  "HOW-WE-BUILD.md"
  "STATE.md"
  "docs/archive/README.md"
  ".claude/agents/doctrine-reviewer.md"
  ".claude/agents/money-truth-auditor.md"
  ".claude/agents/local-first-enforcer.md"
  ".claude/agents/drill-to-core-checker.md"
  ".claude/skills/currency-handling.md"
  ".claude/skills/drive-extraction.md"
  ".claude/skills/verification-protocol.md"
  ".claude/skills/focus-sheet-pattern.md"
  "platform/app/finance/CLAUDE.md"
  "platform/app/workspace/CLAUDE.md"
  "platform/app/beneficiaries/CLAUDE.md"
  "platform/components/CLAUDE.md"
  "platform/lib/CLAUDE.md"
)

missing=0
for f in "${REQUIRED[@]}"; do
  if [ ! -f "$f" ]; then
    echo "  MISSING: $f"
    missing=$((missing + 1))
  fi
done

# 6. Check all 11 ADRs exist
for n in 0001 0002 0003 0004 0005 0006 0007 0008 0009 0010 0011; do
  matches=$(ls docs/decisions/${n}-*.md 2>/dev/null | wc -l | tr -d ' ')
  if [ "$matches" = "0" ]; then
    echo "  MISSING ADR: docs/decisions/${n}-*.md"
    missing=$((missing + 1))
  fi
done

if [ "$missing" -gt 0 ]; then
  echo ""
  echo "FOUNDATION INSTALL INCOMPLETE: $missing files missing."
  echo "Unzip the foundation bundle into the repo root, then re-run this script."
  exit 1
fi

echo ""
echo "== Foundation install complete =="
echo ""
echo "Next steps for Claude Code:"
echo "  1. Open this repo in Claude Code."
echo "  2. Tell it: 'Read /CLAUDE.md, then /HOW-WE-BUILD.md, then execute the Handoff to Claude Code section.'"
echo "  3. It will regenerate the SQL schema, run the money-truth-auditor baseline, and create the Pass 0 worktree."
echo "  4. Review the baseline. Approve. Then say 'go on Pass 0.'"
echo ""
echo "Commit suggestion:"
echo "  git add -A"
echo "  git commit -m 'foundation: doctrine + sub-agents + nested CLAUDE.md + archived superseded docs'"
echo "  git push"
