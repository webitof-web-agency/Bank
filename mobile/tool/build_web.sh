#!/usr/bin/env bash
# Builds the member app for browsers (iPhone / iPad / desktop users, who have
# no APK) and publishes it into the website at /member/:
# frontend/public/member/ is copied into the site's build as is.
#
#   mobile/tool/build_web.sh
#
# The build has no API baked in: opened from localhost it calls that site's
# /api (Vite forwards it to the local backend), anywhere else the live API
# (lib/core/config.dart resolveApiBaseUrl). Setting API_BASE_URL bakes one in
# for every host, so don't publish such a build.
#
# Rerun and commit frontend/public/member/ after every app change.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT=../frontend/public/member

DEFINES=()
if [[ -n "${API_BASE_URL:-}" ]]; then DEFINES+=(--dart-define=API_BASE_URL="$API_BASE_URL"); fi

flutter build web --release --base-href /member/ --no-wasm-dry-run "${DEFINES[@]}"

rm -rf "$OUT"
mkdir -p "$OUT"
# canvaskit/ (~37 MB) is left out: the page loads CanvasKit from Google's CDN
# (www.gstatic.com/flutter-canvaskit), as Flutter does by default.
rsync -a --exclude canvaskit/ build/web/ "$OUT/"
echo "Published to frontend/public/member ($(du -sh "$OUT" | cut -f1))"
