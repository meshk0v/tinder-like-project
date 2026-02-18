#!/usr/bin/env bash
set -euo pipefail

pids=()

start() {
  "$@" &
  pids+=("$!")
}

cleanup() {
  for pid in "${pids[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
}

trap cleanup EXIT INT TERM

start node services/profile.js
start node services/image.js
start node services/recommendation.js
start node services/matches.js
start node services/sessions.js
start node services/messaging.js
start node services/gateway.js

echo "All services started. Gateway on http://localhost:8080"
wait
