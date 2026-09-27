#!/bin/sh
# galeo's Linux entry point, installed as `galeo` next to the Electron binary, `galeo-bin`
# (ADR-009). Every Linux launch (desktop entry, /usr/bin/galeo, the AppImage, gal) comes
# through here and starts the app through `gal`, so files always follow `--` and no file name can
# pass as a Chromium switch (SR-13). If Chromium's sandbox can't start, Chromium aborts before any
# app code runs; only then does this relaunch the app without the sandbox, in a mode that shows
# nothing but the "sandbox unavailable" choice.
set -u

here=$(dirname -- "$(readlink -f -- "$0")")
GALEO_BIN="$here/galeo-bin"
export GALEO_BIN
gal="$here/gal"

# An AppImage's AppRun adds --no-sandbox itself when user namespaces are unavailable. Drop it, so
# the sandbox failure shows the choice instead of silently running unsandboxed.
if [ -n "${APPIMAGE:-}" ] && [ "${1:-}" = --no-sandbox ] && ! unshare -Ur true 2>/dev/null; then
  shift
fi

pid=
work=
signalled=
cleanup() { [ -n "$work" ] && rm -rf -- "$work"; }
on_signal() {
  signalled=1
  if [ -n "$pid" ]; then
    kill -TERM "$pid" 2>/dev/null
  else
    cleanup
    exit 143
  fi
}
trap on_signal TERM INT HUP
trap cleanup EXIT

work=$(mktemp -d "${XDG_RUNTIME_DIR:-${TMPDIR:-/tmp}}/galeo.XXXXXX") || exec "$gal" "$@"
mkfifo "$work/stderr" || exec "$gal" "$@"

# The app's stderr still reaches the terminal live. Only the first lines are kept, where
# Chromium's sandbox failure appears, so the copy stays small however long the app runs.
awk -v copy="$work/log" '{ print > "/dev/stderr"; fflush("/dev/stderr") } NR <= 200 { print > copy }' \
  <"$work/stderr" &
reader=$!
"$gal" "$@" 2>"$work/stderr" &
pid=$!

# A signal interrupts `wait` (status 128+n, not the app's); wait again for the app's own status.
# The app may already have exited by then, so whether it's alive can't tell the two apart.
while :; do
  signalled=
  wait "$pid"
  status=$?
  [ -n "$signalled" ] && [ "$status" -gt 128 ] || break
done

# Let the reader pass on what the app wrote last: it ends by itself once the pipe is drained.
# Stop waiting after a second, when a program the app started still holds stderr open.
tries=0
while kill -0 "$reader" 2>/dev/null && [ "$tries" -lt 20 ]; do
  sleep 0.05
  tries=$((tries + 1))
done
kill "$reader" 2>/dev/null

# Chromium's sandbox failure: killed by SIGTRAP (or SIGABRT) with its FATAL sandbox message.
case $status in
  133 | 134)
    if grep -q -E 'FATAL:.*(setuid_sandbox_host|No usable sandbox)' "$work/log"; then
      if [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" = 1 ]; then
        cause=apparmor-userns
      else
        cause=suid-helper
      fi
      cleanup
      exec "$gal" --no-sandbox "--galeo-sandbox-unavailable=$cause" "$@"
    fi
    ;;
esac
exit "$status"
