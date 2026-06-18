#!/usr/bin/env bash
# predeploy.sh — run before any production deploy.
set -euo pipefail

echo "→ predeploy.sh: starting"

# 1. brain-core drift guard
echo "→ seam-10 brain-core drift eval..."
node eval/integration/seam-10-brain-core-drift.test.mjs

echo "✓ predeploy.sh: all checks passed"
