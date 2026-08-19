#!/usr/bin/env bash

set -euo pipefail

# Prefer Ubuntu's canonical mirror when a GitHub runner's Azure mirror is unreachable.
if [[ -f /etc/apt/apt-mirrors.txt ]]; then
  sudo sed -i '/azure\.archive\.ubuntu\.com/d' /etc/apt/apt-mirrors.txt
fi

# Install root-owned OS packages once so a timeout cannot leave competing apt retries.
if ! timeout --signal=TERM --kill-after=10s 8m pnpm exec playwright install-deps chromium; then
  echo "::error::Playwright system dependency installation failed"
  exit 1
fi

# Bound browser downloads so transient CDN hangs retry before the workflow deadline.
for attempt in 1 2 3; do
  echo "Playwright browser install attempt ${attempt}/3"
  if timeout --signal=TERM --kill-after=10s 4m pnpm exec playwright install chromium; then
    exit 0
  fi

  if [[ "${attempt}" -eq 3 ]]; then
    echo "::error::Playwright browser installation failed after 3 attempts"
    exit 1
  fi

  echo "::warning::Playwright browser installation stalled; retrying in 5 seconds"
  sleep 5
done
