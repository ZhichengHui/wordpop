#!/usr/bin/env bash
# Build both plugins into dist/.
#   dist/firefox/                 unpacked Firefox extension (for web-ext run/sign)
#   dist/wordpop-firefox-*.zip    unsigned Firefox package
#   dist/wordpop-zotero.xpi       Zotero plugin
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
rm -rf "$DIST"
mkdir -p "$DIST/firefox" "$DIST/zotero"

# Firefox
cp -r "$ROOT/firefox/." "$DIST/firefox/"
cp -r "$ROOT/core" "$ROOT/data" "$DIST/firefox/"
mkdir -p "$DIST/firefox/pdfjs"
cp -r "$ROOT/vendor/pdfjs/build" "$ROOT/vendor/pdfjs/web" "$ROOT/vendor/pdfjs/LICENSE" "$DIST/firefox/pdfjs/"
viewer="$DIST/firefox/pdfjs/web/viewer.html"
anchor='<script src="viewer.mjs" type="module"></script>'
grep -qF "$anchor" "$viewer" || { echo "pdf.js viewer.html layout changed" >&2; exit 1; }
inject='<script src="../../viewer-bootstrap.js"></script>\n<script src="../../core/lookup.js"></script>\n<script src="../../core/render.js"></script>\n<script src="../../content.js"></script>'
sed -i "s#$anchor#&\n$inject#" "$viewer"
npx web-ext build --source-dir "$DIST/firefox" --artifacts-dir "$DIST" \
  --filename 'wordpop-firefox-{version}.zip' --overwrite-dest >/dev/null

# Zotero
cp -r "$ROOT/zotero/." "$DIST/zotero/"
cp -r "$ROOT/core" "$ROOT/data" "$DIST/zotero/"
(cd "$DIST/zotero" && zip -qr -X "$DIST/wordpop-zotero.xpi" .)

ls -la "$DIST"
