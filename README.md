# 🏢 AI 에이전트 오피스

AI 직원들이 픽셀 사무실에서 실제로 일하는 모습을 보면서 업무를 맡기고, 결과물을 승인하는 웹앱입니다.
업무를 등록하면 관리자·조사원·작성자·검수자가 **업무 여정**(워크플로)을 따라 차례로 일하고, 마지막에 사용자가 승인하면 가치가 손익에 반영됩니다.

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
  - OpenAI·Anthropic·Gemini·xAI를 지원하며, 직원마다 다른 모델을 쓸 수도 있습니다.

## 기술 스택

| 영역 | 사용 기술 |
| --- | --- |
| 화면 | React 19, Vite 8, pixi.js 8, React Flow (@xyflow/react) |
| 서버 | Node.js 24, Express 5, WebSocket (ws) |
| 저장소 | node:sqlite (이벤트 기록 + 상태) |
| 언어 | TypeScript (화면·서버가 `shared/` 타입을 함께 사용) |

## 시작하기

Node.js 24 이상이 필요합니다.

```bash
npm install
cp .env.example .env   # Windows PowerShell: Copy-Item .env.example .env
```

`.env`는 기본값(`AI_PROVIDER=mock`)으로 두면 API 키 없이 시뮬레이션으로 돌아갑니다.
실제 모델을 쓰려면 `AI_PROVIDER`와 해당 API 키를 채우세요.

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
npm run office -- stop
```

> 외부에 공개할 때는 `.env`의 `ACCESS_PASSWORD`를 꼭 설정하세요.

## 폴더 구조

```text
shared/   화면·서버 공통 타입, 팀·업무 여정·권한 규칙
server/   API, 실시간 이벤트, 업무 오케스트레이터, AI 호출, 저장소
web/      React 화면과 픽셀 사무실(pixi.js)
scripts/  운영 스크립트 (office.ps1)
```

## 문서

- [제품 기획서](AI_AGENT_OFFICE_PRODUCT_PLAN.md)
- [개발 현황](DEVELOPMENT_STATUS.md)
- [운영 가이드](OPERATIONS.md)
