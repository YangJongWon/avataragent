# 서버 운영 가이드 (개인 테스트용)

이 PC에서 서버를 띄우고, Tailscale로 휴대폰이나 외부에서 접속하는 방법을 정리한다.
모든 명령은 프로젝트 폴더의 PowerShell에서 실행한다.

## 접속 주소

| 구분 | 주소 | 접속 가능한 곳 |
|---|---|---|
| 이 PC | http://localhost:8787 | 이 PC |
| Tailscale | `http://<Tailscale IP>:8787` | Tailscale에 로그인한 내 기기 |
| 외부 공개 | `https://<기기 이름>.<tailnet>.ts.net:8443` | 인터넷 어디서나 |

- 실제 주소는 `npm run office -- status`로 확인한다.
- 접속 비밀번호: `.env`의 `ACCESS_PASSWORD`
- 한 번 로그인하면 그 브라우저에서는 30일 동안 다시 묻지 않는다.
- 로그아웃: 주소 뒤에 `/logout`을 붙여 접속한다.

## 다른 사람에게 공유하기

주인(비밀번호로 로그인한 사람)만 할 수 있다.

1. 사무실 탭("개발팀", "서포터팀" 등)을 데스크톱에서는 우클릭, 휴대폰에서는 길게 눌러 메뉴를 연다.
2. **🔗 이 사무실 공유**(그 사무실이 미리 선택됨) 또는 **🏢 전체 사무실 공유**를 고른다.
3. 이름(예: "김 대리 휴대폰"), 범위(전체 사무실 또는 고른 사무실), 권한, 만료를 정하고 만든다.
4. 목록의 QR을 휴대폰으로 찍거나 링크를 복사해 보낸다. 받은 사람은 비밀번호 없이 그 범위만 본다.

| 권한 | 할 수 있는 일 |
|---|---|
| 보기 | 사무실 화면, 업무 여정, 보고서를 보기만 한다 |
| 업무 처리 | 보기 + 업무 등록·여정 편집, 도움 요청 답변, 승인·수정 요청, 업무 취소 |
| 사무실 관리 | 업무 처리 + 직원 설정, 팀 자료(관심사 등), 시뮬레이션 |

- 사무실 추가·삭제, 예산, 공유 관리는 어떤 권한으로도 할 수 없다.
- 같은 탭 메뉴의 **🗑 사무실 닫기**로 직접 만든 사무실을 닫는다. 기본 사무실과 업무가 진행 중인 사무실은 닫을 수 없다.
- "이 사무실 공유"로 열면 그 사무실을 볼 수 있는 링크만 목록에 보인다. 모든 링크를 보려면 "다른 사무실 링크도 보기"를 켠다.
- 링크 주소는 `.env`의 `PUBLIC_URL`(외부 공개 주소)로 만들어진다. 공유 창에서 Tailscale 주소 등으로 바꿀 수도 있다.
- **회수**를 누르면 그 링크로 접속 중인 화면도 바로 끊긴다.
- 공유 링크로 들어간 브라우저에서 주인으로 돌아가려면 상단 배지의 **나가기**(`/logout`)를 누른 뒤 비밀번호로 로그인한다.

## 자주 쓰는 명령

| 하고 싶은 일 | 명령 |
|---|---|
| 서버 켜기 | `npm run office -- start` |
| 서버 끄기 | `npm run office -- stop` |
| 서버 다시 켜기 | `npm run office -- restart` |
| 코드 수정 후 갱신 (설치 + 빌드 + 다시 켜기) | `npm run office -- update` |
| 현재 상태 보기 (서버, Tailscale 주소, 외부 공개 여부) | `npm run office -- status` |
| 외부 공개 켜기 | `npm run office -- public-on` |
| 외부 공개 끄기 | `npm run office -- public-off` |
| 외부 접속 QR 만들기 | `npm run office -- qr` |

- 서버는 터미널과 분리되어 백그라운드에서 돈다. 터미널 창을 닫아도 계속 켜져 있고, `stop`으로 끈다.
- 서버 로그는 `logs\server.log`, 오류 로그는 `logs\server.err.log`에 쌓인다.
- 실제 스크립트는 `scripts\office.ps1`이다. `npm run office -- start`는 아래와 같다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\office.ps1 start
```

### 언제 무엇을 쓰나

- **화면이나 서버 코드를 고쳤을 때:** `update`. 화면은 빌드해야 반영되므로 `restart`만으로는 부족하다.
- **`.env`만 바꿨을 때 (비밀번호, AI 키 등):** `restart`.
- **PC를 재부팅했을 때:** `start`. 외부 공개 설정은 Tailscale이 기억하므로 다시 켤 필요 없다.

## 비밀번호 바꾸기

1. `.env`의 `ACCESS_PASSWORD=` 값을 원하는 비밀번호로 바꾼다.
2. `npm run office -- restart`를 실행한다.

- 비밀번호를 바꾸면 기존에 로그인해 둔 모든 기기가 로그아웃된다. 공유 링크는 영향을 받지 않는다.
- `ACCESS_PASSWORD`를 비워 두면 비밀번호 없이 열린다. 외부 공개 중에는 비워 두지 않는다.

## 외부 공개 시 주의

- 짧은 비밀번호는 테스트용으로만 쓴다. 주소를 남에게 알려 주거나 실제 AI 키를 쓸 때는 긴 비밀번호로 바꾼다.
- `.env`의 `AI_PROVIDER`가 `mock`이면 AI 비용이 나가지 않는다. 실제 모델로 바꾸면 외부에서 등록한 업무에도 비용이 나간다.
- 테스트가 끝나면 `public-off`로 외부 공개를 끈다.
- 이 앱은 Tailscale Funnel의 8443 포트로 공개한다. 포트 없는 기본 주소는 다른 서비스가 쓸 수 있으므로 건드리지 않는다.

## 개발 모드

화면을 고치면서 바로 확인할 때 쓴다. 운영 서버와 같은 포트(8787)를 쓰므로 먼저 `stop`으로 운영 서버를 끈다.

```powershell
npm run office -- stop
npm run dev
```

- 화면: http://localhost:5173 (저장하면 바로 반영)
- 비밀번호가 설정되어 있으면 개발 모드에서도 로그인 화면이 나온다.
- 끝나면 `Ctrl+C`로 끄고, 다시 운영 서버를 켤 때는 `npm run office -- update`를 실행한다.

## 문제가 생겼을 때

| 증상 | 확인할 것 |
|---|---|
| `start` 후 "15초 안에 뜨지 않았어요" | `logs\server.err.log` 확인 |
| "이미 실행 중이에요"인데 화면이 안 열림 | 다른 프로그램이 8787을 쓰는지 확인. `stop` 후 `start` |
| 휴대폰에서 Tailscale 주소가 안 열림 | 휴대폰 Tailscale 앱이 연결(Connected) 상태인지 확인. 그래도 안 되면 아래 방화벽 규칙 추가 |
| 외부 주소가 안 열림 | `npm run office -- status`로 서버와 외부 공개가 모두 켜져 있는지 확인 |

Tailscale 기기에서만 8787 포트 접속을 허용하는 방화벽 규칙 (관리자 PowerShell에서 한 번만 실행):

```powershell
New-NetFirewallRule -DisplayName "avataragent 8787 (Tailscale)" -Direction Inbound -Protocol TCP -LocalPort 8787 -RemoteAddress 100.64.0.0/10 -Action Allow
```

## 데이터

- 업무, 직원, 비용 기록은 `data\office.db`에 저장된다.
- 테스트 데이터를 따로 쓰려면 `.env`에 `DATA_DIR=data/test`처럼 다른 폴더를 지정하고 `restart`한다.
- 기존 단일 JSON 상태는 새 관계형 테이블로 자동 이전된다. 이전 전 DB 파일을 별도로 보관하면 더 안전하다.
- 서버를 재시작하면 현재 단계부터 업무를 재개하고 승인·도움 요청 대기도 복원한다.
- 현재는 at-least-once 복구이므로 AI 응답 직후 서버가 종료되면 같은 단계를 다시 호출할 수 있다. 외부 발송이나 결제 도구는 멱등 키가 추가되기 전까지 연결하지 않는다.

## AI 호출 안정성

`.env`에서 다음 값을 조정할 수 있다.

| 변수 | 기본값 | 의미 |
|---|---:|---|
| `AI_TIMEOUT_MS` | 60000 | AI HTTP 호출 제한시간 |
| `AI_MAX_RETRIES` | 2 | 일시적 오류와 잘못된 JSON 응답의 최대 재시도 횟수 |
| `AI_RETRY_BASE_MS` | 750 | 지수 백오프의 최초 대기시간 |

408, 409, 429와 5xx 응답, 네트워크 오류와 제한시간 초과는 재시도한다. 인증 실패와 일반적인 4xx 요청 오류는 재시도하지 않는다.

## 검증 명령

| 검사 | 명령 |
|---|---|
| 자동 테스트 | `npm test` |
| 타입 검사 | `npm run typecheck` |
| 프로덕션 빌드 | `npm run build` |
