#!/usr/bin/env bash
# macOS/Linux counterpart of office.ps1: start, stop, restart, update, upgrade, open, status, public-on, public-off.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMMAND="${1:-status}"
LOG_DIR="$ROOT/logs"
PID_FILE="$LOG_DIR/server.pid"
PUBLIC_PORT=8443
TARBALL_URL='https://github.com/YangJongWon/avataragent/archive/refs/heads/main.tar.gz'
PORT="$(sed -n 's/^[[:space:]]*PORT[[:space:]]*=[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$ROOT/.env" 2>/dev/null | head -n 1)"
PORT="${PORT:-8787}"

# Desktop launchers start without the login shell's PATH, so look where the installer puts Node.js.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
for dir in /opt/homebrew/bin /usr/local/bin; do
  case ":$PATH:" in *":$dir:"*) ;; *) [ -d "$dir" ] && PATH="$dir:$PATH" ;; esac
done
export PATH

popup() {
  if [ "$(uname -s)" = 'Darwin' ]; then
    osascript -e "display dialog \"$1\" with title \"AI 에이전트 오피스\" buttons {\"확인\"} default button 1" >/dev/null 2>&1 || true
  elif command -v zenity >/dev/null 2>&1; then
    zenity --info --title='AI 에이전트 오피스' --text="$1" >/dev/null 2>&1 || true
  elif command -v notify-send >/dev/null 2>&1; then
    notify-send 'AI 에이전트 오피스' "$1" || true
  fi
  echo "$1"
}

open_url() {
  if [ "$(uname -s)" = 'Darwin' ]; then open "$1"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1 &
  fi
}

port_open() {
  node -e "require('net').connect($PORT, '127.0.0.1').on('connect', () => process.exit(0)).on('error', () => process.exit(1))" 2>/dev/null
}

server_pid() {
  [ -f "$PID_FILE" ] || return 1
  local pid
  pid="$(cat "$PID_FILE")"
  kill -0 "$pid" 2>/dev/null && echo "$pid"
}

# tsx runs the server as a child process, so the whole tree has to go.
# With setsid the server leads its own process group; without it (macOS) children are found one by one.
kill_tree() {
  kill -- "-$1" 2>/dev/null && return 0
  local child
  for child in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$child"; done
  kill "$1" 2>/dev/null
}

start_office() {
  if server_pid >/dev/null; then echo "이미 실행 중이에요 (포트 $PORT)."; return 0; fi
  if ! command -v node >/dev/null 2>&1; then echo 'Node.js를 찾지 못했어요. scripts/install.sh를 먼저 실행해 주세요.'; return 1; fi
  if port_open; then
    echo "포트 $PORT 을(를) 다른 프로그램이 쓰고 있어요. .env 파일의 PORT를 다른 숫자(예: 8788)로 바꿔 주세요."
    return 1
  fi
  mkdir -p "$LOG_DIR"
  cd "$ROOT" || return 1
  local detach=''
  command -v setsid >/dev/null 2>&1 && detach='setsid'
  # shellcheck disable=SC2086
  nohup $detach node node_modules/tsx/dist/cli.mjs server/index.ts > "$LOG_DIR/server.log" 2> "$LOG_DIR/server.err.log" < /dev/null &
  echo $! > "$PID_FILE"
  for _ in $(seq 1 40); do
    sleep 0.5
    if port_open; then echo "서버를 켰어요: http://localhost:$PORT"; return 0; fi
    server_pid >/dev/null || break
  done
  echo "서버가 20초 안에 뜨지 않았어요. logs/server.err.log 를 확인해 주세요."
  return 1
}

stop_office() {
  local pid
  if ! pid="$(server_pid)"; then echo '실행 중인 서버가 없어요.'; rm -f "$PID_FILE"; return 0; fi
  kill_tree "$pid"
  for _ in $(seq 1 20); do port_open || break; sleep 0.5; done
  rm -f "$PID_FILE"
  echo "서버를 껐어요 (PID $pid)."
}

open_office() {
  if [ ! -d "$ROOT/node_modules" ]; then popup '아직 설치가 끝나지 않았어요. scripts/install.sh를 먼저 실행해 주세요.'; return 1; fi
  if start_office; then open_url "http://localhost:$PORT"
  else popup "서버를 켜지 못했어요. 포트 $PORT 을(를) 다른 프로그램이 쓰고 있다면 .env 파일의 PORT를 바꿔 주세요. 그 밖에는 $LOG_DIR/server.err.log 파일 내용을 확인해 주세요."; return 1
  fi
}

update_office() {
  # Under `npm run`, npm passes its settings as npm_config_* variables that a nested `npm install` would treat as flags.
  local name
  for name in $(env | sed -n 's/^\(npm_config_[^=]*\)=.*/\1/p'); do unset "$name"; done
  cd "$ROOT" || return 1
  npm install --no-fund --no-audit || { echo '부품을 내려받지 못했어요.'; return 1; }
  npm run build || { echo '화면을 만들지 못했어요.'; return 1; }
  stop_office
  sleep 1
  start_office
}

# git pull for clones, otherwise the GitHub tarball copied over this folder. .env, data, logs and node_modules stay.
get_latest_code() {
  cd "$ROOT" || return 1
  if [ -d .git ]; then
    if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
      echo '이 폴더에 고친 파일이 있어서 자동으로 받지 않았어요. git으로 직접 정리해 주세요.'
      return 1
    fi
    git pull --ff-only || { echo '새 버전을 받지 못했어요 (git pull).'; return 1; }
    return 0
  fi
  local temp
  temp="$(mktemp -d)"
  echo '새 버전을 내려받고 있어요…'
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$TARBALL_URL" -o "$temp/main.tar.gz"
  else wget -qO "$temp/main.tar.gz" "$TARBALL_URL"
  fi || { rm -rf "$temp"; echo '새 버전을 내려받지 못했어요.'; return 1; }
  tar -xzf "$temp/main.tar.gz" -C "$temp" --strip-components=1 || { rm -rf "$temp"; echo '압축을 풀지 못했어요.'; return 1; }
  rm -f "$temp/main.tar.gz"
  cp -R "$temp/." "$ROOT/"
  rm -rf "$temp"
  chmod +x "$ROOT/scripts/"*.sh
}

tailscale_cli() {
  if command -v tailscale >/dev/null 2>&1; then echo tailscale
  elif [ -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ]; then echo /Applications/Tailscale.app/Contents/MacOS/Tailscale
  else return 1
  fi
}

public_url() {
  local ts dns
  ts="$(tailscale_cli)" || return 1
  dns="$("$ts" status --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).Self.DNSName.replace(/\.$/,"")))')"
  echo "https://$dns:$PUBLIC_PORT"
}

show_status() {
  local pid ts ip
  if pid="$(server_pid)"; then echo "서버: 실행 중 (PID $pid, http://localhost:$PORT)"; else echo '서버: 꺼짐'; fi
  if ts="$(tailscale_cli)"; then
    ip="$("$ts" ip -4 2>/dev/null | head -n 1)"
    [ -n "$ip" ] && echo "Tailscale 주소: http://$ip:$PORT"
    if "$ts" funnel status 2>/dev/null | grep -q ":$PUBLIC_PORT"; then echo "외부 공개: 켜짐 ($(public_url))"; else echo '외부 공개: 꺼짐'; fi
  fi
}

case "$COMMAND" in
  start) start_office ;;
  stop) stop_office ;;
  restart) stop_office; sleep 1; start_office ;;
  update) update_office || { echo '갱신하지 못했어요.'; exit 1; } ;;
  open) open_office ;;
  upgrade)
    if get_latest_code && update_office; then
      echo '업데이트를 마쳤어요.'
      open_url "http://localhost:$PORT"
    else
      echo '업데이트하지 못했어요.'
    fi
    [ -t 0 ] && read -r -p '창을 닫으려면 Enter를 누르세요' _
    ;;
  status) show_status ;;
  public-on)
    ts="$(tailscale_cli)" || { echo 'Tailscale을 찾지 못했어요.'; exit 1; }
    "$ts" funnel --bg --https="$PUBLIC_PORT" "http://127.0.0.1:$PORT" && echo "외부 주소: $(public_url)"
    ;;
  public-off)
    ts="$(tailscale_cli)" || { echo 'Tailscale을 찾지 못했어요.'; exit 1; }
    "$ts" funnel --https="$PUBLIC_PORT" off && echo '외부 공개를 껐어요.'
    ;;
  *)
    echo "사용법: $0 {start|stop|restart|update|upgrade|open|status|public-on|public-off}"
    exit 1
    ;;
esac
