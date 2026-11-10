#!/usr/bin/env bash
# End-to-end test of the Zotero plugin in a throw-away headless Zotero profile.
# Usage: tests/e2e/zotero_e2e.sh <work-dir>
# Needs: Zotero 7+ at $ZOTERO (default /usr/lib/zotero/zotero), network access
# (Youdao), and dist/wordpop-zotero.xpi (tools/build.sh). Does not touch the
# user's own Zotero profile or data, and runs alongside a running Zotero.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mkdir -p "$1" && cd "$1" && pwd)"
ZOTERO="${ZOTERO:-/usr/lib/zotero/zotero}"
XPI="$ROOT/dist/wordpop-zotero.xpi"
[ -f "$XPI" ] || { echo "$XPI not found; run tools/build.sh" >&2; exit 1; }

rm -rf -- "$WORK/profile" "$WORK/data" "$WORK/result.json" "$WORK/reader-popup.png"
mkdir -p "$WORK/profile/extensions" "$WORK/data"
cp "$ROOT/tests/e2e/paper.pdf" "$WORK/paper.pdf"
# Proxy file: load the harness plugin straight from the source tree.
printf '%s' "$ROOT/tests/e2e/zotero-harness" > "$WORK/profile/extensions/wordpop-e2e-harness@local"
cat > "$WORK/profile/user.js" <<EOF
user_pref("extensions.zotero.useDataDir", true);
user_pref("extensions.zotero.dataDir", "$WORK/data");
user_pref("extensions.autoDisableScopes", 0);
user_pref("extensions.startupScanScopes", 15);
user_pref("extensions.zotero.firstRun2", false);
EOF

WORDPOP_E2E_DIR="$WORK" WORDPOP_XPI="$XPI" MOZ_HEADLESS=1 \
  timeout 240 "$ZOTERO" -no-remote -profile "$WORK/profile" -ZoteroDebugText > "$WORK/zotero.log" 2>&1 || true

[ -f "$WORK/result.json" ] || { echo "no result.json; see $WORK/zotero.log" >&2; exit 1; }
python3 -I - "$WORK/result.json" <<'EOF'
import json, sys
checks = json.load(open(sys.argv[1]))['checks']
for c in checks:
    print(('PASS ' if c['ok'] else 'FAIL ') + c['msg'])
failed = sum(not c['ok'] for c in checks)
print(f'\n{failed} failure(s); screenshot: reader-popup.png')
sys.exit(1 if failed or not checks else 0)
EOF
