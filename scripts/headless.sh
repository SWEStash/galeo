#!/bin/sh
# Runs a command on a virtual X display (Xvfb), so the Playwright suites and verify:package open
# no windows on your desktop. Under a Wayland session Electron would still pick Wayland and draw on
# the real display, so the Wayland variables are dropped and it falls back to Xvfb's DISPLAY.
#
# Usage: npm run headless -- npm run test:e2e
set -eu

if ! command -v xvfb-run >/dev/null 2>&1; then
  echo "install xvfb: sudo apt install xvfb" >&2
  exit 1
fi

exec env -u WAYLAND_DISPLAY -u XDG_SESSION_TYPE xvfb-run -a "$@"
