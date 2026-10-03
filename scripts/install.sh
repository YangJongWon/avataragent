#!/usr/bin/env bash
# One-step setup on macOS and Linux for people new to programming:
# Node.js, packages, .env, build, launcher icons, first start.
# Usage: bash scripts/install.sh [--no-shortcuts]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIN_NODE=24
APP_NAME='AI 에이전트 오피스'
NO_SHORTCUTS=0
[ "${1:-}" = '--no-shortcuts' ] && NO_SHORTCUTS=1

step() { printf '\n\033[36m[%s/6] %s\033[0m\n' "$1" "$2"; }
ok() { printf '\033[32m%s\033[0m\n' "$1"; }
fail() {
  printf '\n\033[31m설치를 마치지 못했어요: %s\033[0m\n' "$1"
  echo '이 창의 내용을 캡처해서 알려 주시면 도와드릴게요.'
  exit 1
}

# Piped installs (curl … | bash) have the script itself on stdin, so questions go to the terminal.
ask() {
  local answer=''
  { read -r -p "$1" answer < /dev/tty; } 2>/dev/null || true
  printf '%s' "$answer"
}

# nvm is not written for `set -u`, so it is sourced and called with unset-variable checks off.
load_node_paths() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  set +u
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
  set -u
  for dir in /opt/homebrew/bin /usr/local/bin; do
    case ":$PATH:" in *":$dir:"*) ;; *) [ -d "$dir" ] && PATH="$dir:$PATH" ;; esac
  done
  export PATH
}

node_major() {
  command -v node >/dev/null 2>&1 || { echo 0; return; }
  node -v | sed 's/^v//' | cut -d. -f1
}

download() {
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$1"
  elif command -v wget >/dev/null 2>&1; then wget -qO- "$1"
  else fail 'curl 또는 wget이 필요해요.'
  fi
}

install_node() {
  if [ "$(uname -s)" = 'Darwin' ] && command -v brew >/dev/null 2>&1; then
    echo 'Homebrew로 Node.js를 설치할게요.'
    brew install node || brew upgrade node || true
    load_node_paths
    [ "$(node_major)" -ge "$MIN_NODE" ] && return
  fi
  # nvm installs into the home folder, so no administrator password is needed.
  echo 'Node.js를 내 계정 폴더에 설치할게요. (관리자 비밀번호는 필요 없어요)'
  download https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash >/dev/null
  load_node_paths
  command -v nvm >/dev/null 2>&1 || fail 'Node.js 설치 도구(nvm)를 준비하지 못했어요.'
  set +u
  nvm install "$MIN_NODE" && nvm alias default "$MIN_NODE" >/dev/null
  set -u
  load_node_paths
}

printf '\033[33m=== %s 설치 ===\033[0m\n' "$APP_NAME"
echo "설치 폴더: $ROOT"
echo '처음 설치는 인터넷 속도에 따라 5~10분쯤 걸려요. 창을 닫지 말고 기다려 주세요.'

step 1 'Node.js 확인'
load_node_paths
if [ "$(node_major)" -lt "$MIN_NODE" ]; then install_node; fi
[ "$(node_major)" -ge "$MIN_NODE" ] || fail "Node.js $MIN_NODE 이상을 설치하지 못했어요. https://nodejs.org 에서 직접 설치한 뒤 다시 실행해 주세요."
ok "Node.js $(node -v) 준비됨"

cd "$ROOT"
step 2 '필요한 부품 내려받기 (npm install)'
npm install --no-fund --no-audit || fail '부품을 내려받지 못했어요. 인터넷 연결을 확인하고 다시 실행해 주세요.'

step 3 '설정 파일 만들기 (.env)'
if [ -f .env ]; then
  echo '이미 설정 파일이 있어서 그대로 둘게요.'
else
  echo '접속 비밀번호를 정해 주세요. 같은 와이파이의 다른 기기나 휴대폰에서 열 때 이 비밀번호를 물어봐요.'
  echo '이 컴퓨터에서만 쓸 거라면 그냥 Enter를 눌러도 돼요. (나중에 .env 파일의 ACCESS_PASSWORD에서 바꿀 수 있어요)'
  password="$(ask '비밀번호: ')"
  PASSWORD="$password" node -e '
    const fs = require("fs");
    const text = fs.readFileSync(".env.example", "utf8").replace(/^ACCESS_PASSWORD=.*$/m, () => "ACCESS_PASSWORD=" + process.env.PASSWORD.trim());
    fs.writeFileSync(".env", text);
  '
  chmod 600 .env
  ok '설정 파일을 만들었어요. 처음에는 API 키 없이 "시뮬레이션"으로 돌아가요.'
fi

step 4 '화면 만들기 (빌드)'
npm run build || fail '화면을 만들지 못했어요.'

step 5 '실행 아이콘 만들기'
chmod +x scripts/office.sh
make_mac_launcher() {
  local file="$HOME/Desktop/$1.command"
  printf '#!/bin/bash\nexec "%s/scripts/office.sh" %s\n' "$ROOT" "$2" > "$file"
  chmod +x "$file"
  echo "바탕화면에 '$1' 아이콘을 만들었어요."
}
make_linux_launcher() {
  local apps="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  local desktop
  desktop="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
  mkdir -p "$apps"
  local file="$apps/avataragent-$2.desktop"
  cat > "$file" <<EOF
[Desktop Entry]
Type=Application
Name=$1
Comment=$3
Exec="$ROOT/scripts/office.sh" $2
Path=$ROOT
Icon=$4
Terminal=$5
Categories=Office;
EOF
  chmod +x "$file"
  if [ -d "$desktop" ]; then
    cp "$file" "$desktop/"
    chmod +x "$desktop/$(basename "$file")"
    gio set "$desktop/$(basename "$file")" metadata::trusted true 2>/dev/null || true
    echo "앱 목록과 바탕화면에 '$1' 아이콘을 만들었어요."
  else
    echo "앱 목록에 '$1' 아이콘을 만들었어요."
  fi
}
if [ "$NO_SHORTCUTS" = 1 ]; then
  echo '아이콘 만들기를 건너뛰었어요.'
elif [ "$(uname -s)" = 'Darwin' ]; then
  make_mac_launcher "$APP_NAME" open
  make_mac_launcher "$APP_NAME 끄기" stop
  make_mac_launcher "$APP_NAME 업데이트" upgrade
else
  make_linux_launcher "$APP_NAME" open '서버를 켜고 브라우저로 열어요' applications-office false
  make_linux_launcher "$APP_NAME 끄기" stop '서버를 꺼요' system-shutdown false
  make_linux_launcher "$APP_NAME 업데이트" upgrade '새 버전을 받아 다시 켜요' system-software-update true
fi

step 6 '처음 켜기'
"$ROOT/scripts/office.sh" open || true

port="$(sed -n 's/^[[:space:]]*PORT[[:space:]]*=[[:space:]]*\([0-9][0-9]*\).*/\1/p' .env | head -n 1)"
echo ''
ok '설치가 끝났어요!'
echo "- 다음부터는 바탕화면의 '$APP_NAME' 아이콘을 더블클릭하면 돼요."
echo "- 주소: http://localhost:${port:-8787}"
echo '- 실제 AI를 쓰려면 화면 위쪽의 [모델 관리] 탭에서 API 키를 넣어 주세요.'
