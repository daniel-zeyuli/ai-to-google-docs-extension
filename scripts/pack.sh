#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST="$DIR/manifest.json"

TEST_ID="39131322719-3fr4tc7gi8jc3b3mavi6npvatai37b90.apps.googleusercontent.com"
PROD_ID="39131322719-ndpbenl2i02127q2kovno76vd6b9ap3j.apps.googleusercontent.com"

VERSION=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["version"])' < "$MANIFEST")

case "$1" in
  test)
    sed -i '' "s/$PROD_ID/$TEST_ID/" "$MANIFEST"
    echo "✓ Switched to TEST client_id (v$VERSION) — load unpacked in Chrome"
    ;;
  prod)
    sed -i '' "s/$TEST_ID/$PROD_ID/" "$MANIFEST"
    python3 -m json.tool "$MANIFEST" > /dev/null && echo "✓ manifest OK"
    ZIP="$DIR/dist/chatgpt-to-google-docs-${VERSION}-webstore.zip"
    cd "$DIR"
    zip -r "$ZIP" manifest.json background.js content.js converter.js \
      popup.html popup.js privacy.html styles.css LICENSE \
      _locales/ icons/ --exclude "*.DS_Store"
    echo "✓ Switched to PROD client_id + packed → dist/chatgpt-to-google-docs-${VERSION}-webstore.zip"
    ;;
  *)
    echo "Usage: $0 [test|prod]"
    exit 1
    ;;
esac
