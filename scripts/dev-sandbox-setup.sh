#!/bin/sh
# Lets this checkout's development Electron binary use the Chromium sandbox on Ubuntu 24.04+,
# where unprivileged user namespaces are restricted by AppArmor. It installs the same kind of
# profile the .deb installs for /opt/galeo. galeo never runs with --no-sandbox instead.
#
# Usage (once per checkout, and again if the checkout moves): sudo scripts/dev-sandbox-setup.sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "run with sudo: sudo $0" >&2
  exit 1
fi

root=$(cd "$(dirname "$0")/.." && pwd -P)
binary="$root/node_modules/electron/dist/electron"
profile=/etc/apparmor.d/galeo-dev

if [ ! -x "$binary" ]; then
  echo "Electron binary not found at $binary; run 'npm ci && npm run setup' first" >&2
  exit 1
fi

cat > "$profile" <<PROFILE
abi <abi/4.0>,
include <tunables/global>

profile galeo-dev "$binary" flags=(unconfined) {
  userns,

  include if exists <local/galeo-dev>
}
PROFILE

apparmor_parser -r "$profile"
echo "AppArmor profile loaded for $binary"
