#!/usr/bin/env bash
# Thin wrapper kept for existing invocations. The packager itself is implemented in
# Node (scripts/package-extension.cjs) so it runs on Windows without Python 3.
set -euo pipefail
exec node "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/package-extension.cjs" "$@"
