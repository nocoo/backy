#!/bin/bash
set -euo pipefail
# Correctness gate: coverage thresholds + typecheck must hold.
cd "$(dirname "$0")"

# Run coverage. Suppress success noise; only show errors/threshold violations.
if ! cov_out=$(bun run test:coverage 2>&1); then
  echo "$cov_out" | tail -80
  echo "CHECKS_FAILED: coverage gate" >&2
  exit 1
fi

# Echo coverage summary lines for visibility (kept short).
echo "$cov_out" | grep -E "Coverage summary|Lines +:|Branches +:|Functions +:|Statements +:" | head -40 || true

if ! tc_out=$(bun run typecheck 2>&1); then
  echo "$tc_out" | tail -40
  echo "CHECKS_FAILED: typecheck" >&2
  exit 1
fi
