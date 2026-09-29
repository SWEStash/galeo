#!/bin/sh
# Renders the app icon from its SVG sources into packaging/icons/png/<size>x<size>.png, the set
# electron-builder takes for Linux (and the 1024 px one for the macOS and Windows previews).
# The small sizes use the simpler mark. Needs rsvg-convert (Ubuntu: sudo apt install librsvg2-bin).
# Re-run after changing an SVG; the PNGs are committed.
set -eu

here=$(cd "$(dirname "$0")/../packaging/icons" && pwd)
command -v rsvg-convert >/dev/null || {
  printf 'render-icons: rsvg-convert not found (sudo apt install librsvg2-bin)\n' >&2
  exit 1
}
mkdir -p "$here/png"
for size in 16 24 32; do
  rsvg-convert -w "$size" -h "$size" "$here/galeo-small.svg" -o "$here/png/${size}x${size}.png"
done
for size in 48 64 128 256 512 1024; do
  rsvg-convert -w "$size" -h "$size" "$here/galeo.svg" -o "$here/png/${size}x${size}.png"
done
printf 'render-icons: wrote %s\n' "$here/png"
