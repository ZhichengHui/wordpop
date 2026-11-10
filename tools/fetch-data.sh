#!/usr/bin/env bash
# Download the ODH Revival extension from addons.mozilla.org and extract its
# builtin Collins dictionary into data/. The dictionary data is not stored in
# this repository because of its copyright.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL='https://addons.mozilla.org/firefox/downloads/file/4803571/odh_revival-1.0.1.xpi'
SHA256='e1e3a43f1c71f026a3225c9f2f5e5757a2795611253151a63f3af863a3faab85'

tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT

echo "Downloading $URL"
curl -fsSL -o "$tmp/odh.xpi" "$URL"
echo "$SHA256  $tmp/odh.xpi" | sha256sum -c --quiet -
mkdir "$tmp/odh"
unzip -q "$tmp/odh.xpi" 'bg/data/*' -d "$tmp/odh"

rm -rf -- "$ROOT/data"
python3 -I "$ROOT/tools/build-data.py" "$tmp/odh/bg/data" "$ROOT/data"
