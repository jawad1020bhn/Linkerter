#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -d node_modules/puppeteer-core ]]; then
  message="real Chrome MV3 integration NOT RUN — development dependencies are missing; run npm ci"
  echo "$message"
  if [[ "${REQUIRE_CHROME:-0}" == "1" ]]; then
    exit 1
  fi
  exit 0
fi

exec node tests/browser/run.cjs
