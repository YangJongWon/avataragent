# 🏢 AI 에이전트 오피스

AI 직원들이 픽셀 사무실에서 실제로 일하는 모습을 보면서 업무를 맡기고, 결과물을 승인하는 웹앱입니다.
업무를 등록하면 관리자·조사원·작성자·검수자가 **업무 여정**(워크플로)을 따라 차례로 일하고, 마지막에 사용자가 승인하면 가치가 손익에 반영됩니다.

내구성 실행과 PostgreSQL 개발 환경은 Docker Desktop을 켠 뒤 `npm.cmd run infra:up`으로 시작할 수 있습니다. 기존 SQLite 이관과 Temporal 검증 절차는 `OPERATIONS.md`를 참고하세요.

<p align="center">
  <img src="docs/office-mobile.png" alt="모바일에서 본 개발팀 사무실" width="360">
</p>

## 주요 기능

- **픽셀 사무실**
  - 팀별 사무실 5개(개발·인사·경영·서포터·복지)가 기본으로 있고, 사무실을 추가할 수 있습니다.
  - 일하는 직원은 책상에서, 일이 끝난 직원은 휴게실에서 쉽니다.
  - 모델 회사별 모자와 등급별 반짝임이 있고, 스킨 3종(픽셀·미소녀·핑크걸)을 바꿔 쓸 수 있습니다.
- **업무 여정**
  - 업무 유형마다 정해진 여정을 쓰거나, AI에게 설계를 맡기거나, 직접 단계를 짤 수 있습니다.
  - 단계는 브리프 → 조사 → 작성 → 검토 → 승인 순서이며, 최대 10단계입니다.
  - **조건 루프**: "검토 기준에 못 미치면 작성으로 돌아가기(최대 2회)" 같은 조건을 단계마다 걸 수 있습니다.
  - 여정 화면은 폭에 맞춰 자동으로 줄을 바꾸고, 노드 위치와 크기를 직접 조정할 수도 있습니다.
- **승인과 손익**
  - 결과물은 사용자가 승인해야 반영됩니다. 수정을 요청하면 작성 단계로 돌아갑니다.
  - AI 호출 비용과 인건비 환산 가치를 비교해 손익과 월 예산을 보여 줍니다.
- **공유와 권한**
  - 사무실 탭을 우클릭(모바일은 길게 누르기)하면 공유·닫기 메뉴가 나옵니다.
  - 사무실 전체 또는 일부를 QR·링크로 공유할 수 있고, 권한은 보기·운영·관리 중에서 고릅니다.
- **AI 제공자**
  - API 키 없이 돌아가는 mock 모드가 있습니다.
  - OpenAI·Anthropic·Gemini·xAI와 OpenAI 호환 API(DeepSeek·Ollama 등)를 지원하며, 직원마다 다른 모델을 쓸 수 있습니다.
  - **모델 관리** 탭에서 회사(모자 모양·색)와 API 키, 모델(등급 장식·단가)을 등록하고 실행 방식을 바로 바꿀 수 있습니다.

## 기술 스택

| 영역 | 사용 기술 |
| --- | --- |
| 화면 | React 19, Vite 8, pixi.js 8, React Flow (@xyflow/react) |
| 서버 | Node.js 24, Express 5, WebSocket (ws) |
| 저장소 | node:sqlite (이벤트 기록 + 상태) |
| 언어 | TypeScript (화면·서버가 `shared/` 타입을 함께 사용) |

## 쉽게 설치하기 (Windows 10/11)

프로그래밍을 몰라도 됩니다. 아래 두 방법 중 하나만 하면 됩니다.

**방법 1. 명령 한 줄**

1. 시작 메뉴에서 `PowerShell`을 검색해 엽니다.
2. 아래 줄을 복사해 붙여 넣고 Enter를 누릅니다.

   ```powershell
   irm https://raw.githubusercontent.com/YangJongWon/avataragent/main/scripts/get.ps1 | iex
   ```

**방법 2. 파일 내려받기**

1. 이 페이지 위쪽의 초록색 **Code** 버튼 → **Download ZIP**을 누릅니다.
2. 받은 ZIP 파일을 오른쪽 클릭 → **압축 풀기**로 원하는 곳에 풉니다.
3. 풀린 폴더의 **`설치.cmd`** 를 더블클릭합니다. "Windows의 PC 보호" 창이 뜨면 **추가 정보 → 실행**을 누릅니다.

설치 프로그램이 알아서 하는 일:

- Node.js가 없으면 설치합니다. 권한 확인 창이 뜨면 **예**를 누르세요.
- 필요한 부품을 내려받고 화면을 만듭니다. 처음에는 5~10분쯤 걸립니다.
- 접속 비밀번호를 물어봅니다. 이 PC에서만 쓴다면 그냥 Enter를 눌러도 됩니다.
- 바탕화면에 바로가기 3개를 만들고, 브라우저로 사무실을 엽니다.

| 바탕화면 바로가기 | 하는 일 |
| --- | --- |
| AI 에이전트 오피스 | 서버를 켜고 브라우저로 엽니다 |
| AI 에이전트 오피스 끄기 | 서버를 끕니다 |
| AI 에이전트 오피스 업데이트 | 새 버전을 받아 다시 켭니다. 설정(.env)과 데이터(data 폴더)는 그대로 둡니다 |

설치 폴더에도 같은 일을 하는 `시작.cmd`, `끄기.cmd`, `업데이트.cmd`가 있습니다.

처음에는 API 키 없이 **시뮬레이션**으로 돌아갑니다. 실제 AI를 쓰려면 화면 위쪽 **모델 관리** 탭에서 API 키를 넣으세요.

문제가 생기면:

- "포트를 다른 프로그램이 쓰고 있어요"가 나오면, 설치 폴더의 `.env` 파일을 메모장으로 열어 `PORT=8787`을 `PORT=8788`처럼 바꾸고 다시 켭니다.
- 서버가 켜지지 않으면 설치 폴더의 `logs\server.err.log` 내용을 알려 주세요.
- Windows 방화벽 창이 뜨면 **허용**을 누르세요. 같은 와이파이의 휴대폰에서 열 때 필요합니다.
## 시작하기 (개발자용)

Node.js 24 이상이 필요합니다.

```bash
npm install
cp .env.example .env   # Windows PowerShell: Copy-Item .env.example .env
```

`.env`는 기본값(`AI_PROVIDER=mock`)으로 두면 API 키 없이 시뮬레이션으로 돌아갑니다.
실제 모델을 쓰려면 화면의 **모델 관리** 탭에서 API 키를 등록하고 "직원별 실제 AI"를 고르거나, `.env`의 `AI_PROVIDER`와 API 키를 채우세요.

### 개발 모드

```bash
npm run dev
```

서버(`tsx watch`)와 Vite 개발 서버가 함께 뜹니다.

### 운영 모드

```bash
npm run build
npm start              # http://localhost:8787
```

Windows에서는 백그라운드 실행, 업데이트, Tailscale 외부 공개를 스크립트 하나로 할 수 있습니다.

```powershell
npm run office -- start    # 백그라운드 실행
npm run office -- status   # 상태와 접속 주소 확인
npm run office -- update   # 빌드 후 재시작
npm run office -- upgrade  # 새 코드 받기(git pull 또는 ZIP) + 빌드 + 재시작
npm run office -- open     # 꺼져 있으면 켜고 브라우저로 열기
npm run office -- stop
```

> 외부에 공개할 때는 `.env`의 `ACCESS_PASSWORD`를 꼭 설정하세요.

### 검증

```powershell
npm test
npm run typecheck
npm run build
```

## 폴더 구조

```text
shared/   화면·서버 공통 타입, 팀·업무 여정·권한 규칙
server/   API, 실시간 이벤트, 업무 오케스트레이터, AI 호출, 저장소
web/      React 화면과 픽셀 사무실(pixi.js)
scripts/  운영 스크립트 (office.ps1), 설치 (install.ps1, get.ps1)
```

## 문서

- [제품 기획서](AI_AGENT_OFFICE_PRODUCT_PLAN.md)
- [개발 현황](DEVELOPMENT_STATUS.md)
- [운영 가이드](OPERATIONS.md)
- [아키텍처 결정 기록](docs/ARCHITECTURE_DECISIONS.md)
