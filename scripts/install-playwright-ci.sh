#!/usr/bin/env bash

set -euo pipefail

# Bound each mirror request so a transient hang can retry before the workflow deadline.
for attempt in 1 2 3; do
  echo "Playwright browser install attempt ${attempt}/3"
  if timeout --signal=TERM --kill-after=10s 4m pnpm exec playwright install --with-deps chromium; then
    exit 0
  fi

  if [[ "${attempt}" -eq 3 ]]; then
    echo "::error::Playwright browser installation failed after 3 attempts"
    exit 1
  fi

  echo "::warning::Playwright browser installation stalled; retrying in 5 seconds"
  sleep 5
done
