#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/find-node.sh"
cd "$ROOT"
# shellcheck disable=SC2086
exec "$NODE" $NODE_FLAGS --test "$@"
