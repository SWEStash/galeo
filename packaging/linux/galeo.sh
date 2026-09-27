#!/bin/sh
# galeo's Linux entry point, installed as `galeo` next to the Electron binary, `galeo-bin`
# (ADR-009). It starts the app sandboxed with the arguments unchanged. If Chromium's sandbox can't
# start, Chromium aborts before any app code runs; only then does this relaunch the app without
# the sandbox, in a mode that shows nothing but the "sandbox unavailable" choice.
set -u

here=$(dirname -- "$(readlink -f -- "$0")")
bin="$here/galeo-bin"

work=$(mktemp -d "${XDG_RUNTIME_DIR:-${TMPDIR:-/tmp}}/galeo.XXXXXX") || exec "$bin" "$@"
cleanup() { rm -rf -- "$work"; }
trap cleanup EXIT
mkfifo "$work/stderr" || exec "$bin" "$@"

# The app's stderr still reaches the terminal live; a copy is kept to recognise the abort.
tee "$work/log" <"$work/stderr" >&2 &
tee_pid=$!
"$bin" "$@" 2>"$work/stderr" &
pid=$!
trap 'kill -TERM "$pid" 2>/dev/null' TERM INT HUP

# `wait` returns early when a signal arrives; keep waiting until the app has exited.
while :; do
  wait "$pid"
  status=$?
  kill -0 "$pid" 2>/dev/null || break
done
wait "$tee_pid"

# Chromium's sandbox failure: killed by SIGTRAP (or SIGABRT) with its FATAL sandbox message.
case $status in
  133 | 134)
    if grep -q -e 'setuid_sandbox_host' -e 'No usable sandbox' "$work/log"; then
      if [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" = 1 ]; then
        cause=apparmor-userns
      else
        cause=suid-helper
      fi
      cleanup
      exec "$bin" --no-sandbox "--galeo-sandbox-unavailable=$cause" "$@"
    fi
    ;;
esac
exit "$status"
