#!/usr/bin/env bash
# One-line install on macOS/Linux:
#   curl -fsSL https://raw.githubusercontent.com/YangJongWon/avataragent/main/scripts/get.sh | bash
# Downloads the app into ~/avataragent (or $AVATARAGENT_DIR) and runs the installer.
set -euo pipefail

TARGET="${AVATARAGENT_DIR:-$HOME/avataragent}"
URL='https://github.com/YangJongWon/avataragent/archive/refs/heads/main.tar.gz'

if [ -f "$TARGET/scripts/install.sh" ]; then
  echo "이미 받아 둔 프로그램이 있어요: $TARGET"
else
  echo "프로그램을 내려받고 있어요: $TARGET"
  mkdir -p "$TARGET"
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$URL" | tar -xz -C "$TARGET" --strip-components=1
  elif command -v wget >/dev/null 2>&1; then wget -qO- "$URL" | tar -xz -C "$TARGET" --strip-components=1
  else echo 'curl 또는 wget이 필요해요.'; exit 1
  fi
fi

exec bash "$TARGET/scripts/install.sh" "$@"
