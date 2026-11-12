#!/bin/bash
# Installs a galeo .rpm in a Fedora system and checks what its scripts do (ADR-036). CI runs it as root in a
# `fedora` container started with `--security-opt seccomp=unconfined` (Docker's default profile refuses the user
# namespaces Chromium's sandbox needs, which a Fedora machine allows):
#   rpm-install-check.sh <rpm>
# Install: galeo, gal, the key and the MDX type in place. Reinstall: rpm runs the old copy's %postun after the new
# copy's %post, as an upgrade does, so this proves an upgrade keeps them. A start under Xvfb: the renderer is
# sandboxed. Remove: galeo, gal and the MDX type go, the key stays. Prints PASS/FAIL per check; exit 1 on any FAIL.
set -u
rpm_file=${1:?usage: rpm-install-check.sh <rpm>}
failed=0
check() { if eval "$2"; then echo "PASS $1"; else echo "FAIL $1"; failed=1; fi; }

installed() {
  check "$1: galeo on PATH" '[ -x /usr/bin/galeo ]'
  check "$1: gal on PATH" '[ "$(readlink /usr/bin/gal)" = /opt/galeo/gal ]'
  check "$1: the repository key" '[ -f /etc/pki/rpm-gpg/RPM-GPG-KEY-galeo ]'
  check "$1: the MDX type" '[ -f /usr/share/mime/packages/galeo.xml ] && grep -q mdx /usr/share/mime/globs2'
}

check 'install' 'dnf install -y -q "$rpm_file" xorg-x11-server-Xvfb xvfb-run procps-ng >/dev/null 2>&1'
installed install
check 'reinstall' 'dnf reinstall -y -q "$rpm_file" >/dev/null 2>&1'
installed reinstall

useradd -m galeo-check
printf '# galeo on Fedora\n' > /home/galeo-check/check.md
su galeo-check -c 'cd ~ && xvfb-run -a /usr/bin/galeo -- /home/galeo-check/check.md > /tmp/galeo-start.log 2>&1 &'
renderer=''
for _ in $(seq 30); do
  renderer=$(pgrep -f -- 'galeo-bin --type=renderer' | head -1)
  [ -n "$renderer" ] && break
  sleep 1
done
check 'start: a renderer runs' '[ -n "$renderer" ]'
check 'start: the renderer is sandboxed (seccomp filter, no new privileges)' \
  '[ -n "$renderer" ] && grep -q "^Seccomp:[[:space:]]*2" /proc/$renderer/status && grep -q "^NoNewPrivs:[[:space:]]*1" /proc/$renderer/status'
check 'start: no sandbox-unavailable relaunch' '! grep -q setuid_sandbox_host /tmp/galeo-start.log'
pkill -f galeo-bin
sleep 2

check 'remove' 'dnf remove -y -q galeo >/dev/null 2>&1'
check 'remove: galeo gone' '[ ! -e /usr/bin/galeo ]'
check 'remove: gal gone' '[ ! -e /usr/bin/gal ]'
check 'remove: the MDX type gone' '[ ! -e /usr/share/mime/packages/galeo.xml ]'
check 'remove: the key kept, for the .repo file that names it' '[ -f /etc/pki/rpm-gpg/RPM-GPG-KEY-galeo ]'

exit $failed
