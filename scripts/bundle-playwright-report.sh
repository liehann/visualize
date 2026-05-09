#!/usr/bin/env bash
# Extract a Playwright report directory + test-results directory into a
# bundle.zip the ingest accepts. Mirrors the bash inlined in
# action.yml's "Upload Playwright report" step — keep them in sync.
#
# Centralized so the action's CI integration test can replay the
# exact bundling logic without duplicating it.
#
# Args:
#   $1 = REPORT_DIR        (path to playwright-report/)
#   $2 = TEST_RESULTS_DIR  (path to Playwright outputDir, may be non-default)
#   $3 = STAGING           (empty staging dir to assemble the bundle in)
#   $4 = OUT_ZIP           (path where the .zip will be written)
set -euo pipefail

REPORT_DIR="${1:?missing REPORT_DIR}"
TEST_RESULTS_DIR="${2:?missing TEST_RESULTS_DIR}"
STAGING="${3:?missing STAGING}"
OUT_ZIP="${4:?missing OUT_ZIP}"

rm -rf "$STAGING" "$OUT_ZIP"
mkdir -p "$STAGING"
cp -R "$REPORT_DIR/." "$STAGING/"

ABS_TEST_RESULTS=""
if [ -d "$TEST_RESULTS_DIR" ]; then
  ABS_TEST_RESULTS=$(cd "$TEST_RESULTS_DIR" && pwd)
  cp -R "$TEST_RESULTS_DIR" "$STAGING/test-results"
fi

# Rewrite Playwright's JSON reporter output: absolute attachment paths
# under the original outputDir → bundle-relative `test-results/<rest>`.
# Idempotent + no-op when the prefix doesn't match.
if [ -n "$ABS_TEST_RESULTS" ] && [ -f "$STAGING/report.json" ]; then
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|${ABS_TEST_RESULTS}/|test-results/|g" "$STAGING/report.json"
  else
    sed -i "s|${ABS_TEST_RESULTS}/|test-results/|g" "$STAGING/report.json"
  fi
fi

( cd "$STAGING" && zip -rq "$OUT_ZIP" . )
