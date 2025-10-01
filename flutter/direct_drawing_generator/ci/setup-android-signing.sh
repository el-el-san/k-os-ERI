#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

if ! command -v flutter >/dev/null 2>&1; then
  echo "::error::flutter command not found. Install Flutter and add it to PATH." >&2
  exit 1
fi

if [[ ! -d android ]]; then
  echo "Android platform scaffolding not found. Running flutter create..."
  flutter create --org io.koseri --platforms android --no-pub .
fi

KEYSTORE_B64="ci/update-signing.keystore.base64"
KEYSTORE_PATH="android/app/update-signing.keystore"
KEY_PROPS="android/key.properties"

if [[ ! -f "$KEYSTORE_B64" ]]; then
  echo "::error::Missing $KEYSTORE_B64" >&2
  exit 1
fi

mkdir -p "$(dirname "$KEYSTORE_PATH")"
base64 --decode "$KEYSTORE_B64" > "$KEYSTORE_PATH"
chmod 600 "$KEYSTORE_PATH"

cat > "$KEY_PROPS" <<'KEYPROPS'
storeFile=../app/update-signing.keystore
storePassword=koseri123
keyAlias=koseri
keyPassword=koseri123
KEYPROPS

ci/ensure-android-signing.sh

echo "Android signing is configured. Build with:\n  flutter build apk --release" 
