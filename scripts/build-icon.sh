#!/bin/bash
#
# Builds Spindle's icon: SVG -> PNG -> .icns
#
# The drawing lives in scripts/make-icon.mjs. The SVG is rasterised with the
# browser engine Electron is built on, and the .icns is assembled with the
# macOS tools, so the icon in the dock is the same drawing as the source.
#
# Usage: scripts/build-icon.sh [light|dark]

set -euo pipefail

cd "$(dirname "$0")/.."

THEME="${1:-light}"
BUILD="build"

echo "==> drawing the icon (${THEME})"
node scripts/make-icon.mjs "$THEME" "$BUILD"

echo "==> rasterising"
npx electron scripts/render-icon.mjs "$BUILD/icon-${THEME}.svg" "$BUILD/icon.png" 1024

echo "==> building the icon set"
ICONSET="$BUILD/icon.iconset"
rm -rf "$ICONSET"
mkdir -p "$ICONSET"

resize() {
  sips -z "$2" "$2" "$BUILD/icon.png" --out "$ICONSET/$1" >/dev/null
}

resize icon_16x16.png 16
resize icon_16x16@2x.png 32
resize icon_32x32.png 32
resize icon_32x32@2x.png 64
resize icon_128x128.png 128
resize icon_128x128@2x.png 256
resize icon_256x256.png 256
resize icon_256x256@2x.png 512
resize icon_512x512.png 512
resize icon_512x512@2x.png 1024

iconutil -c icns "$ICONSET" -o "$BUILD/icon.icns"
rm -rf "$ICONSET"

echo "==> done"
ls -la "$BUILD"/icon.png "$BUILD"/icon.icns
