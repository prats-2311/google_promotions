#!/usr/bin/env bash
# Runs the full test suite: Python services (sdk/, cloud_run/*, orchestration_driver/)
# via pytest, and the dashboard's pure-logic tests via vitest.
set -euo pipefail
cd "$(dirname "$0")"

echo "=== Python test suite (pytest) ==="
if [ ! -d .venv ]; then
  echo "No .venv found — create one first:"
  echo "  python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt"
  exit 1
fi
.venv/bin/pytest "$@"

echo ""
echo "=== Dashboard test suite (vitest) ==="
(cd dashboard && npm test)
