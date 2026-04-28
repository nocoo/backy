#!/bin/bash
set -euo pipefail

# UT quality benchmark: median of N runs of `bun run test`.
# Outputs METRIC lines for autoresearch parser.

cd "$(dirname "$0")"

N=5

# Quick syntax sanity (cheap; bails before the real loop wastes time).
bun --bun -e "1" >/dev/null

# Warm-up run (vitest deps cache, bun module cache) — not timed.
# Without this, the first sample is consistently 2-3× slower and dominates
# stddev, masking real performance signal.
bun run test >/dev/null 2>&1 || true

times=()
fail_count=0
last_test_count=""

for i in $(seq 1 "$N"); do
  start=$(date +%s%N)
  if ! out=$(bun run test 2>&1); then
    fail_count=$((fail_count + 1))
    echo "RUN $i FAILED" >&2
    echo "$out" | tail -40 >&2
    continue
  fi
  end=$(date +%s%N)
  ms=$(( (end - start) / 1000000 ))
  times+=("$ms")
  # Sum all "Tests  N passed" lines from the four workspaces.
  last_test_count=$(echo "$out" | awk '/Tests +[0-9]+ passed/ { for(i=1;i<=NF;i++) if($i=="passed") s+=$(i-1)+0 } END { print s+0 }')
done

if [ "${#times[@]}" -lt 3 ]; then
  echo "FATAL: too many failed runs ($fail_count/$N)" >&2
  echo "METRIC total_ms=999999"
  echo "METRIC fail_runs=$fail_count"
  exit 1
fi

# Sort and compute median + stddev.
sorted=($(printf '%s\n' "${times[@]}" | sort -n))
n=${#sorted[@]}
mid=$((n / 2))
if (( n % 2 == 1 )); then
  median=${sorted[$mid]}
else
  median=$(( (sorted[mid-1] + sorted[mid]) / 2 ))
fi

# stddev (population) via awk
stddev=$(printf '%s\n' "${times[@]}" | awk '{ s+=$1; ss+=$1*$1; n++ } END { m=s/n; v=ss/n - m*m; if(v<0)v=0; printf "%d", sqrt(v) }')

# Weak tests scan
weak_json=$(bun run scripts/scan-weak-tests.ts --json)
weak_total=$(echo "$weak_json" | awk -F'[:,]' '/"total":/ { gsub(/[ ]/,"",$2); print $2; exit }')

echo "raw_times_ms=${times[*]}"
echo "METRIC total_ms=$median"
echo "METRIC stddev_ms=$stddev"
echo "METRIC weak_tests=${weak_total:-0}"
echo "METRIC test_count=${last_test_count:-0}"
echo "METRIC fail_runs=$fail_count"
