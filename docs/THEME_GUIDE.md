# 테마 만들기 가이드

테마는 사무실의 **배경**과 **직원 캐릭터**를 바꿉니다. 캐릭터에는 기본 동작(서 있기, 걷기, 앉기)과, 업무 중 일어나는 일에 맞춘 **이벤트별 동작**(도움 요청, 반려당함, 업무 승인 등)이 있습니다. 앱에 들어 있는 도트 사무실도 이런 테마 가운데 하나입니다.

만든 테마는 `.zip` 파일 하나로 공유합니다. 누구나 설치할 수 있도록, 설치할 때 파일과 CSS를 검사해서 안전한 것만 받아들입니다.

## 만드는 방법

### 1. 테마 스튜디오 (권장)

앱의 테마 스튜디오에서 JSON을 직접 쓰지 않고 만들 수 있습니다. (스튜디오를 앱 메뉴에 연결하는 작업은 준비 중입니다.)

1. **기본 정보**: 이름, id(영어 소문자·숫자·하이픈 2~40자), 라이선스를 정합니다.
2. **배경**: 1000×480 크기의 그림을 올립니다. 여러 장을 겹칠 수 있고, "앞"으로 표시한 레이어는 책상 앞판처럼 직원을 가립니다.
3. **자리 정하기**: 역할별 좌석, 휴식 자리, 문을 미리보기에서 눌러서 찍습니다. 칠판·자료실·금고·보관함 영역은 끌어서 그립니다. 정하지 않은 자리는 기본 사무실 배치를 따릅니다.
4. **캐릭터**: 스프라이트 시트를 올리고 프레임 크기를 입력하면 격자로 잘립니다. 동작을 고르고 칸을 누르면 그 동작에 프레임이 들어갑니다.
5. **색과 CSS** (선택)
6. 미리보기에서 동작을 바꿔 가며 확인한 뒤 **zip 내려받기** 또는 **바로 설치**를 누릅니다.

스튜디오는 서버와 같은 검사를 하므로, "내보낼 준비가 됐어요"가 보이면 설치도 통과합니다.

### 2. 직접 만들기

아래 구조로 파일을 모아 zip으로 묶습니다. 폴더째 묶어도 됩니다.

```text
theme.json        매니페스트 (필수)
preview.png       갤러리 썸네일 (필수, 500×240 권장)
assets/*.png      배경 레이어, 스프라이트 시트, 초상화
theme.css         커스텀 CSS (선택)
LICENSE.txt       라이선스 전문 (선택)
```

## 동작 목록

캐릭터에 **`idle`(서 있기) 하나만 있어도** 테마는 동작합니다. 없는 동작은 화살표를 따라 가장 가까운 동작으로 대신 보여 줍니다.

| 분류 | 동작 | 언제 | 없으면 |
|---|---|---|---|
| 기본 | `idle` | 서 있을 때 (필수) | — |
| | `walk` | 걸어갈 때 | idle |
| | `sit` | 자리에 있을 때 | idle |
| 직원 상태 | `working` | 일하는 중 | sit |
| | `collaborating` | 협업 중 | working |
| | `waiting` | 차례를 기다릴 때 | idle |
| | `awaiting_approval` | 사용자 승인을 기다릴 때 | waiting |
| | `help_requested` | 도움을 요청했을 때 | troubled |
| | `paused` | 일시정지 | idle |
| | `error` | 오류 | panic |
| 표정 | `smile` | 웃음 | idle |
| | `focus` | 집중 | working |
| | `sweat` | 진땀 | troubled |
| | `troubled` | 곤란 | idle |
| | `panic` | 당황 | sweat |
| | `thanks` | 도움을 받았을 때 | smile |
| | `celebrate` | 축하 | smile |
| 업무 순간 | `step.brief` | 과제 접수 단계를 시작할 때 | working |
| | `step.research` | 자료 조사를 시작할 때 | focus |
| | `step.draft` | 초안 작성을 시작할 때 | working |
| | `step.review` | 검토를 시작할 때 | focus |
| | `review.rejected` | 내 결과물이 반려됐을 때 | troubled |
| | `task.approved` | 업무가 끝났을 때 (모두) | celebrate |
| | `budget.exceeded` | 예산이 바닥났을 때 | panic |

업무 순간 동작은 약 2.4초 동안 재생한 뒤 원래 상태로 돌아갑니다. 걷기·흔들림·축하 점프 같은 움직임은 앱이 덧붙이므로, 프레임은 2~3장이면 충분합니다.

## theme.json

```json
{
  "format": "avataragent-theme",
  "version": 1,
  "id": "cozy-office",
  "themeVersion": "1.0.0",
  "name": "아늑한 사무실",
  "author": "만든 사람",
  "license": "CC-BY-4.0",
  "description": "따뜻한 원목 사무실",
  "preview": "preview.png",
  "scene": {
    "layers": [
      { "image": "assets/room.png", "x": 0, "y": 0 },
      { "image": "assets/desk-fronts.png", "x": 0, "y": 0, "front": true }
    ],
    "scaleMode": "linear",
    "seats": { "manager": { "x": 400, "y": 194 } },
    "lounge": { "manager": { "x": 862, "y": 342 } },
    "door": { "x": 805, "y": 248 },
    "spots": { "board": { "x": 260, "y": 14, "w": 280, "h": 86 } }
  },
  "characters": [
    {
      "id": "mina",
      "name": "미나",
      "sheet": "assets/mina.png",
      "frames": {
        "f0": { "x": 0, "y": 0, "w": 64, "h": 96 },
        "f1": { "x": 64, "y": 0, "w": 64, "h": 96 }
      },
      "anchor": { "x": 0.5, "y": 1 },
      "head": { "x": 0.5, "y": 0.05 },
      "scale": 1.5,
      "states": {
        "idle": { "frames": ["f0"] },
        "walk": { "frames": ["f0", "f1"], "fps": 8 },
        "task.approved": { "frames": ["f1"], "loop": false }
      },
      "portraits": { "smile": "assets/mina-smile.png" }
    }
  ],
  "tokens": { "accent": "#e07a5f" },
  "css": "theme.css"
}
```

- **좌표**: 사무실은 1000×480 좌표계입니다. 좌석·휴식 자리는 캐릭터의 **발** 위치입니다.
- **역할**: `manager`, `researcher`, `writer`, `reviewer`. 정하지 않은 역할과 자리는 기본 배치를 씁니다.
- **`spots`**: 칠판(`board`, 업무 제목이 여기에 써져요), 자료실(`shelf`, 조사할 때 걸어가요), 금고(`safe`, 이익이 표시돼요), 보관함(`archive`, 완료 서류가 날아가요).
- **`anchor`**: 프레임 안에서 발이 닿는 위치(0~1). 기본값은 아래 가운데입니다.
- **`head`**: 프레임 안에서 머리 꼭대기 위치(0~1). 직원의 AI 모델사 모자가 여기에 얹힙니다.
- **`scaleMode`**: 도트 그림은 `nearest`, 일러스트는 `linear`.
- **`tokens`**: 화면 색(`ink`, `paper`, `bg`, `line`, `accent`, `primary`, `green`, `red`, `blue`, `yellow`, `muted`). 색 값만 받습니다.
- **`portraits`** (선택): 표정별 초상화. 지금은 검사와 보관만 하고, 리포트·채팅 패널에 보여 주는 기능은 준비 중입니다.
- **캐릭터 배정**: 지금은 역할 순서대로 배정됩니다(매니저 → 첫 번째 캐릭터, …). 직원마다 캐릭터를 고르는 기능은 준비 중입니다.

## 제한

| 항목 | 한도 |
|---|---|
| zip 크기 | 20MB |
| 파일 수 | 300개 |
| 이미지 한 변 | 4096px |
| 이미지 형식 | PNG, WebP (파일 내용까지 검사해요) |
| CSS 크기 | 64KB |
| 캐릭터 | 16명 |
| 배경 레이어 | 32장 |
| 동작당 프레임 | 32장 |

설치할 때 `theme.json`이 쓰지 않는 파일과 LICENSE·CREDITS 외의 파일은 버립니다.

## 커스텀 CSS 규칙

CSS는 설치할 때 서버가 다시 씁니다.

- 모든 규칙이 **그 테마를 쓰는 사무실 안**에만 적용됩니다. `:root`, `html`, `body`는 사무실 영역을 뜻하게 바뀝니다.
- 지워지는 것: `@import`, 패키지 밖을 가리키는 `url()`(외부 주소, `data:` 포함), `image-set()`, `expression()`, `javascript:`, `position: fixed`.
- `z-index`는 100까지입니다.
- 승인·공유·모달·결제·키 화면(`.approval*`, `.share*`, `.modal*`, `.billing*`, `.key*`, `.login*`)을 겨냥한 셀렉터는 빠집니다.
- `@media`, `@supports`, `@keyframes`, `@container`는 쓸 수 있습니다.

## 로컬 AI로 그림 만들기

로컬 이미지 AI(예: ComfyUI + SDXL 계열 애니메이션 모델)를 쓰면 혼자서도 캐릭터와 배경을 만들 수 있습니다.

- **잘 되는 것**: 캐릭터 디자인, 표정 초상화, 서 있기·앉기·축하 같은 정지 포즈, 배경과 소품.
- **어려운 것**: 걷기처럼 이어지는 프레임. 프레임마다 옷 주름이나 머리카락이 달라져 떨려 보입니다. 프레임은 2~3장으로 줄이고 앱이 덧붙이는 움직임에 맡기세요.
- **같은 캐릭터 유지**: 레퍼런스 이미지(IP-Adapter)와 포즈 스켈레톤(OpenPose)을 함께 쓰면 여러 포즈에서도 같은 사람처럼 보입니다. 표정만 바꿀 때는 이미지 편집 모델로 얼굴만 고치는 편이 안정적입니다.
- **배경 제거**: 캐릭터는 투명 PNG여야 합니다. 배경 제거 노드(BiRefNet, rembg 등)를 쓰세요.
- **라이선스**: 쓴 모델의 라이선스가 결과물 공유를 허용하는지 확인하고, `CREDITS.txt`에 모델 이름을 적어 주세요.

## 라이선스

`license` 필드는 필수입니다. 테마는 만든 사람의 저작물이며, 앱의 라이선스(AGPL-3.0)와는 별개입니다. 다른 사람의 그림을 쓸 때는 그 그림의 라이선스를 지키고 출처를 `CREDITS.txt`에 적어 주세요.
