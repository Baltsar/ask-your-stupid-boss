#!/bin/bash
# Picks a Node that can run the TypeScript sources. Node 18 on PATH is not enough.
find_node() {
  local candidates=()
  local bin major best_bin="" best_major=0
  if command -v node >/dev/null 2>&1; then
    candidates+=("$(command -v node)")
  fi
  candidates+=("/opt/homebrew/bin/node")
  if [ -d "$HOME/.nvm/versions/node" ]; then
    for bin in "$HOME"/.nvm/versions/node/*/bin/node; do
      [ -x "$bin" ] && candidates+=("$bin")
    done
  fi
  for bin in "${candidates[@]}"; do
    [ -x "$bin" ] || continue
    major="$("$bin" -p "Number(process.versions.node.split('.')[0])")"
    if [ "$major" -gt "$best_major" ]; then
      best_bin="$bin"
      best_major="$major"
    fi
  done
  if [ "$best_major" -ge 23 ]; then
    NODE="$best_bin"
    NODE_FLAGS="--disable-warning=ExperimentalWarning"
    return 0
  fi
  if [ "$best_major" -ge 22 ]; then
    NODE="$best_bin"
    NODE_FLAGS="--experimental-strip-types --disable-warning=ExperimentalWarning"
    return 0
  fi
  echo "ask-your-stupid-boss behöver Node 22 eller nyare." >&2
  return 1
}

find_node
