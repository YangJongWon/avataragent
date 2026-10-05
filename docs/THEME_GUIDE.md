# 테마 만들기 가이드

테마는 사무실의 **배경**, **소품**, **직원 캐릭터**를 바꿉니다. 캐릭터에는 기본 동작(서 있기, 걷기, 앉기)과, 업무 중 일어나는 일에 맞춘 **이벤트별 동작**(도움 요청, 반려당함, 업무 승인 등)이 있습니다. 여기에 조건에 따라 바뀌는 **머리 위 아이콘·말**, **교감 메뉴**(인사하기 등), **이벤트 반응**, **이동 경로**, 할로윈 같은 **시즌 변형**을 더할 수 있습니다. 각 부분은 따로 정의하고, 정하지 않은 부분은 앱 기본값을 씁니다. 앱에 들어 있는 도트 사무실도 이런 테마 가운데 하나입니다.

만든 테마는 `.zip` 파일 하나로 공유합니다. 누구나 설치할 수 있도록, 설치할 때 파일과 CSS를 검사해서 안전한 것만 받아들입니다.

설치한 테마는 테마 탭에서 **모든 사무실에 쓰기**를 누르면 회사 공통 테마가 되어 모든 사무실에 함께 적용됩니다(소유자만). 특정 사무실만 다르게 꾸미려면 그 사무실에서 **이 사무실만 쓰기**를 누르고, 되돌릴 때는 **공통 테마 따르기**를 누릅니다.

테마는 사무실 장면뿐 아니라 **사이트 화면**(상단 바, 탭, 패널, 버튼, 글꼴, 모서리, 페이지 배경)도 바꿉니다. 기본으로는 보고 있는 사무실의 테마를 따르고, 소유자가 테마 카드의 **사이트에 쓰기**를 누르면 사무실과 상관없이 그 테마로 고정됩니다. **사무실 테마 따르기**로 되돌립니다.

## 만드는 방법

### 1. 테마 스튜디오 (권장)

앱의 **테마 → 테마 만들기**에서 JSON을 직접 쓰지 않고 만들 수 있습니다.

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
| | `back` | 뒷모습: 방 위쪽으로 걸어가거나 칠판·책장·문 앞에 서 있을 때 | idle |
| | `walk_back` | 뒷모습으로 걸어갈 때 | walk |
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
      "hand": { "x": 0.8, "y": 0.6 },
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
- **업무 공간과 휴게 공간** (선택): 배경 레이어에 `"area": "work"` 또는 `"area": "lounge"`를 붙여 두 공간의 배경을 따로 정하고, `scene.areas`에 각 공간의 영역을 적습니다(예: `"areas": { "work": { "x": 0, "y": 0, "w": 760, "h": 480 }, "lounge": { "x": 760, "y": 0, "w": 240, "h": 480 } }`). 팀 색은 업무 공간 배경에만 입혀지고, 두 공간이 다 있으면 직원은 문을 거치지 않고 자리와 휴게 자리 사이를 바로 오갑니다. 공간을 정하지 않으면 첫 레이어가 방 전체로 취급됩니다.
- **`anchor`**: 프레임 안에서 발이 닿는 위치(0~1). 기본값은 아래 가운데입니다.
- **`head`**: 프레임 안에서 머리 꼭대기 위치(0~1). 직원의 AI 모델사 모자가 여기에 얹힙니다.
- **`scaleMode`**: 도트 그림은 `nearest`, 일러스트는 `linear`.
- **`tokens`**: 사이트 화면 색. 색 값(#hex, rgb(), hsl())만 받습니다. 아래 [사이트 화면](#사이트-화면-tokens-site-선택)을 보세요.
- **`hand`**: 프레임 안에서 물건을 쥐는 손 위치(0~1). 기본값은 `{ "x": 0.8, "y": 0.6 }`입니다.
- **`portraits`** (선택): 표정별 초상화(`normal`, `smile`, `focus`, `sweat`, `troubled`, `panic`, `thanks`, `celebrate`). 도움 요청 창과 직원 카드에 보입니다. 없는 표정은 동작과 같은 순서로 대신 찾고(예: `thanks` → `smile`), 그래도 없으면 `normal`, 그마저 없으면 서 있기 프레임을 보여 줍니다. 128×128 정도를 권장합니다.
- **캐릭터 배정**: 직원 관리에서 직원마다 테마 캐릭터를 고를 수 있습니다. 고르지 않은 직원은 역할 순서대로 배정됩니다(매니저 → 첫 번째 캐릭터, …).

### 부위와 의상 (`parts`, `outfits`, `dress`, 선택)

캐릭터를 머리·몸통·다리 레이어로 나누고, 갈아입을 옷을 정할 수 있습니다.

```json
{
  "id": "mina",
  "sheet": "assets/mina-legs.png",
  "parts": { "body": "assets/mina-body.png", "head": "assets/mina-head.png" },
  "outfits": [
    { "id": "casual", "name": { "ko": "캐주얼", "en": "Casual" }, "parts": { "body": "assets/mina-cardigan.png" } },
    { "id": "pumpkin", "name": "호박 옷", "sheet": "assets/mina-pumpkin.png" }
  ],
  "frames": { "...": "..." }
}
```

- **`parts`**: `legs`, `body`, `head` 부위 시트. `sheet` 위에 다리 → 몸통 → 머리 순서로 겹칩니다. 모든 부위 시트는 `sheet`와 **크기와 프레임 배치가 똑같고**, 자기 부위 밖은 투명해야 합니다(LPC 같은 종이 인형 방식). 부위를 쓰면 `sheet`는 맨 아래 레이어(다리나 맨몸)가 됩니다.
- **`outfits`**: 캐릭터마다 16벌까지. `parts`는 그 부위만 바꾸고, `sheet`는 그림 전체를 바꿉니다(이때는 캐릭터의 부위를 겹치지 않고 의상의 `parts`만 겹칩니다). 의상 그림도 캐릭터의 프레임 배치를 그대로 씁니다.
- 의상 id는 캐릭터끼리 같은 말을 씁니다(`casual`, `suit`…). 직원 관리의 **의상**에서 직원마다 고르면, 그 id의 의상이 있는 캐릭터만 갈아입습니다.
- **`dress`** (테마 최상위, 32개까지): 조건에 따라 자동으로 갈아입습니다. 위에서부터 읽어 **그 캐릭터에 있는 의상**을 가리키는 첫 규칙이 직원이 고른 옷보다 먼저입니다. 맞는 규칙이 없으면 직원이 고른 옷, 그것도 없으면 기본 옷입니다.

```json
"dress": [
  { "when": { "place": "lounge" }, "outfit": "casual" },
  { "when": { "weekdays": [5] }, "outfit": "casual" }
]
```

시즌 변형에 `dress`를 넣으면(예: 할로윈에 `pumpkin`) 그 기간에는 그 규칙을 먼저 읽습니다. 초상화는 의상과 상관없이 같은 그림을 씁니다.

### 모델사 소품 (`accessories`, 선택)

직원의 AI 모델사와 등급은 기본적으로 픽셀 모자로 보입니다. 테마가 소품을 정하면 모자 대신 소품을 겹칩니다.

```json
"accessories": {
  "claude": {
    "1": [{ "image": "assets/orange-ribbon.png", "at": "head", "x": -14, "y": 4 }],
    "2": [{ "image": "assets/cape-pattern.png", "at": "head", "x": 0, "y": 40 }],
    "3": [{ "image": "assets/star-wand.png", "at": "hand", "x": 6, "y": -12 }]
  },
  "*": { "1": [{ "image": "assets/hairpin.png", "at": "head" }] }
}
```

- 키는 모델사 id(`claude`, `gpt`, `grok`, `gemini`, 직접 추가한 회사의 id)이고, `*`는 나머지 모든 회사입니다.
- 등급은 쌓입니다. 3등급 모델은 1·2·3등급 레이어를 모두 겹칩니다.
- `at`은 `head`(머리 꼭대기) 또는 `hand`(손), `x`·`y`는 그 점에서 옮길 픽셀(±512), `scale`은 배율입니다. 이미지는 가운데를 기준으로 붙습니다.
- 회사·등급마다 레이어 8개, 회사 16곳까지 정할 수 있습니다. 소품 세트가 없는 회사는 픽셀 모자를 쓰고, 세트가 있지만 그 등급에 레이어가 없으면 아무것도 쓰지 않습니다.
- 테마 스튜디오에는 아직 소품 편집 화면이 없습니다. 스튜디오에서 내려받은 zip의 `theme.json`에 직접 추가해 주세요.

## 사이트 화면 (`tokens`, `site`, 선택)

사무실 바깥의 화면 모양입니다. 정하지 않은 값은 기본 모습을 씁니다.

```json
"tokens": { "topbar": "#5a3f33", "topbarInk": "#fff8ee", "tab": "#f7e9d6", "note": "#ffe6b8" },
"site": {
  "font": "rounded",
  "radius": 8,
  "background": { "image": "assets/paper.png", "repeat": true }
}
```

| 색 토큰 | 쓰이는 곳 |
|---|---|
| `bg` | 페이지 바탕 |
| `paper` | 패널·카드 바탕 |
| `surface` | 버튼·입력칸 바탕 |
| `ink`, `muted` | 글자, 흐린 글자 |
| `line` | 테두리와 그림자 |
| `topbar`, `topbarInk`, `topbarLine` | 상단 바 바탕, 글자, 아래 테두리 (메뉴 탭은 바탕과 글자를 섞은 색) |
| `tabBar`, `tab` | 사무실 탭 줄 바탕, 패널 안 탭 |
| `yellow` | 선택된 탭 |
| `note`, `hover` | 선택한 항목·메모, 마우스를 올린 항목 |
| `accent`, `primary`, `green`, `red`, `blue` | 강조, 주 버튼, 이익·손실 등 |

- **`font`**: `default`, `rounded`(둥근 글꼴), `serif`(명조), `mono`(고정폭) 중 하나, 또는 패키지 안의 글꼴 파일 `{ "file": "fonts/hand.woff2" }`. 글꼴 파일은 WOFF2만, 4MB까지 받습니다. 프리셋은 기기에 설치된 글꼴을 쓰고, 없으면 기본 글꼴로 보입니다.
- **`radius`**: 패널·버튼·탭 모서리 둥글기(0~20px). 기본은 각진 0입니다.
- **`background`**: 페이지 배경 그림. `repeat: true`면 원래 크기로 바둑판처럼 깔고, 아니면 화면을 덮도록 늘립니다.
- 진행 상태·긴급도처럼 뜻이 정해진 배지 색은 바뀌지 않습니다.

## 조건 규칙 (`when`)

아래의 머리 위 표시, 교감 메뉴, 이벤트 반응, 시즌 변형은 모두 같은 조건(`when`)을 씁니다. 적은 조건이 **모두** 맞아야 하고, 목록은 그중 **하나**만 맞으면 됩니다. 값 하나만 쓸 때는 목록 대신 문자열로 써도 됩니다.

| 조건 | 값 | 예 |
|---|---|---|
| `status` | 직원 상태: `idle`, `waiting`, `working`, `collaborating`, `awaiting_approval`, `help_requested`, `paused`, `off_duty`, `capacity_exhausted`, `error` | `["working", "collaborating"]` |
| `place` | `desk`(자리) 또는 `lounge`(휴게실) | `"lounge"` |
| `role` | `manager`, `researcher`, `writer`, `reviewer` | `["manager"]` |
| `character` | 이 테마의 캐릭터 id | `["mina"]` |
| `expression` | 표정: `normal`, `smile`, `focus`, `sweat`, `troubled`, `panic`, `thanks`, `celebrate` | `"celebrate"` |
| `team` | 사무실 팀: `dev`, `hr`, `mgmt`, `support`, `welfare` | `["dev"]` |
| `walking` | 걷는 중인지 | `false` |
| `hours` | [시작 시, 끝 시) 보는 사람의 현지 시각, 자정을 넘어도 됨 | `[22, 6]` |
| `weekdays` | 요일 0(일)~6(토) | `[0, 6]` |
| `dates` | ["MM-DD", "MM-DD"] 양 끝 포함, 새해를 넘어도 됨 | `["12-24", "12-25"]` |

규칙 목록은 **위에서부터 읽고 처음 맞는 규칙**을 씁니다. 구체적인 규칙을 위에, 넓은 규칙을 아래에 두세요.

문구(`say`, `label`)는 문자열 하나로 쓰거나 언어별로 씁니다: `{ "ko": "안녕하세요!", "en": "Hello!", "ja": "こんにちは!", "zh": "你好!" }`. 보는 사람의 언어가 없으면 한국어, 그것도 없으면 있는 것 중 하나를 보여 줍니다. `say`에 문구를 여러 개 쓰면 그때마다 하나를 골라 말합니다.

## 머리 위 표시 (`emotes`, 선택)

직원 머리 위의 아이콘과 가끔 하는 말을 정합니다. 테마 규칙을 앱 기본 규칙보다 먼저 읽습니다. 앱 기본 규칙은 도움 요청 `?`, 승인 대기 `!`, 오류 `!`, 일시정지 `II`, 축하 ⭐, 감사 💗, 역할별 업무 아이콘, 역할별 휴게 아이콘입니다.

```json
"emotes": [
  { "when": { "place": "lounge", "walking": false, "hours": [12, 13] }, "icon": "🍱", "say": ["점심 맛있어요~"], "every": 45 },
  { "when": { "status": "working", "character": "mina" }, "icon": { "image": "assets/coffee.png" } },
  { "when": { "status": "paused" }, "icon": null }
]
```

- `icon`: 이모지·짧은 글자(8자까지), `{ "text": "!", "color": "#e74c3c" }`(둥근 배지), 또는 `{ "image": "assets/…png" }`(28px 안으로 줄여 보여요). `null`이면 아이콘을 숨깁니다.
- `say`: 규칙이 맞기 시작할 때 말풍선으로 한 번 말합니다. `every`(초, 3~3600)를 쓰면 규칙이 맞는 동안 그 간격으로 다시 말합니다.
- 아이콘과 말은 따로 찾습니다. 아이콘은 `icon`이 있는 첫 규칙, 말은 `say`가 있는 첫 규칙에서 가져옵니다.
- 도움 요청처럼 중요한 표시를 바꿀 때는 사용자가 알아볼 수 있게 해 주세요.

## 교감 메뉴 (`interactions`, 선택)

직원을 우클릭(길게 누르기)한 메뉴 아래쪽에 인사하기 같은 항목을 더합니다. 이 항목은 **반응만 보여 주고** 업무나 데이터는 건드리지 않습니다. 앱 기본으로 **인사하기**(`greet`)가 있는데, 시간대(아침·점심·저녁·새벽)와 직원 상태(일하는 중, 곤란함)에 따라 말과 동작이 달라집니다.

```json
"interactions": [
  {
    "id": "snack",
    "label": { "ko": "간식 주기", "en": "Give a snack" },
    "when": { "place": "lounge" },
    "reactions": [
      { "when": { "hours": [15, 17] }, "state": "celebrate", "say": ["간식 시간이다!"], "effect": "hearts" },
      { "state": "smile", "say": ["고마워요!"] }
    ]
  },
  { "id": "greet", "hidden": true }
]
```

- `when`이 맞을 때만 메뉴에 보입니다. 맞는 반응이 하나도 없어도 숨겨집니다.
- `reactions`는 위에서부터 처음 맞는 반응을 씁니다. `state`는 약 2.4초 동안 재생할 동작, `effect`는 효과입니다.
- 효과: `sparkle`(반짝이), `hearts`(하트), `sweat`(땀), `notes`(음표), `confetti`(색종이), `zzz`(졸림).
- 앱 기본 항목과 id가 같으면 테마 것으로 바뀌고, `"hidden": true`면 메뉴에서 뺍니다.

## 소품 (`props`, 선택)

가구를 배경 그림에 합치지 않고 하나씩 둡니다. 소품마다 그림을 바꾸거나 시즌 변형에서 갈아 끼울 수 있고, 상태별 그림을 둘 수 있습니다.

```json
"props": [
  { "id": "door", "image": "assets/door.png", "x": 881, "y": 66, "spot": "door", "states": { "open": "assets/door-open.png" } },
  { "id": "sofa", "image": "assets/sofa.png", "x": 800, "y": 262 },
  { "id": "desk-1", "image": "assets/desk.png", "x": 85, "y": 232, "front": true }
]
```

- `x`, `y`는 그림의 왼쪽 위입니다. 소품은 배경 레이어 위에 적힌 순서대로 그려지니, 먼 것부터 적으세요.
- `front: true`면 직원 앞에 그려집니다. 같은 그림을 여러 소품이 함께 써도 됩니다.
- `spot`은 그 소품이 맡은 자리입니다(`board`, `shelf`, `safe`, `archive`, `door`). 자리의 좌표는 여전히 `scene.spots`와 `scene.door`가 정합니다.
- `spot: "door"`인 소품에 `open` 상태 그림이 있으면, 직원이 출퇴근하며 문을 지날 때 잠깐 열린 그림을 보여 줍니다.
- 상태 그림은 기본 그림과 같은 크기로 만들어 같은 왼쪽 위에 겹치세요. 소품마다 8개까지 둘 수 있고, 이벤트 반응의 `prop`으로 바꿉니다.

## 이벤트 반응 (`events`, 선택)

사무실 이벤트가 일어날 때 직원의 동작·말·효과와 소품 상태를 정합니다. 앱 기본 연출(도장, 동전, 서류 나르기)은 그대로 나오고, 테마가 정한 동작이 그 위에 재생됩니다. `"replace": true`면 그 이벤트의 앱 기본 연출을 끕니다.

```json
"events": [
  { "on": "agent.arrived", "say": ["출근했습니다!"] },
  { "on": "task.completed", "when": { "role": "manager" }, "say": ["다들 수고했어요!"], "effect": "confetti" },
  { "on": "review.rejected", "state": "panic", "say": ["다시 해 올게요…"], "replace": true },
  { "on": "value.recognized", "prop": { "id": "safe", "state": "open", "ms": 2000 } }
]
```

| 이벤트 | 언제 | 반응하는 직원 |
|---|---|---|
| `task.created` | 업무가 등록됐을 때 | 등록과 관련된 직원 (없으면 장면 가운데 효과) |
| `task.completed` | 업무가 끝났을 때 | 자리에 있는 모두 |
| `task.handed_off` | 다음 단계로 넘길 때 | 넘기는 직원 |
| `review.approved` / `review.rejected` | 검토 통과 / 반려 | 검토자 / 반려당한 직원 |
| `approval.requested` / `approval.denied` | 사용자 승인 요청 / 수정 요청 | 해당 직원 |
| `agent.help_received` | 도움을 받았을 때 | 도움받은 직원 |
| `value.recognized` | 이익이 생겼을 때 | 해당 직원 |
| `mail.received` / `inquiry.received` | 메일·문의 도착 | 담당 직원 |
| `budget.exceeded` | 예산이 바닥났을 때 | 해당 직원 |
| `cost.recorded` | 비용이 들었을 때 | 해당 직원 |
| `agent.arrived` / `agent.left` | 출근해 문으로 들어올 때 / 퇴근하러 나설 때 | 그 직원 |

- 한 이벤트에 규칙이 여러 개면 직원마다 처음 맞는 규칙 하나를 씁니다. `when`의 직원 조건은 반응하는 직원 기준입니다.
- `prop`의 `ms`는 그 상태를 보여 줄 시간(100~10000, 기본 1500)입니다.

## 이동 경로 (`scene.waypoints`, `scene.links`, 선택)

직원은 기본적으로 목적지까지 곧장 걷습니다. 지나갈 지점과 연결선을 정하면 그 길을 따라 걷습니다(책상 사이 통로, 문 앞 등).

```json
"scene": {
  "waypoints": {
    "aisle-left": { "x": 40, "y": 368 },
    "aisle-mid": { "x": 380, "y": 368 },
    "lounge": { "x": 880, "y": 420 },
    "door-step": { "x": 930, "y": 250 }
  },
  "links": [["aisle-left", "aisle-mid"], ["aisle-mid", "lounge"], ["lounge", "door-step"]],
  "walkSpeed": 150
}
```

- 출발점에서 가장 가까운 지점으로 가서, 연결선을 따라 가장 짧은 길로, 목적지에서 가장 가까운 지점까지 간 뒤 목적지로 갑니다.
- 목적지가 가까운 지점보다 더 가깝거나 두 지점이 이어져 있지 않으면 곧장 갑니다.
- 경로를 정하면 업무 공간과 휴게실 사이의 복도(문) 경유는 쓰지 않습니다. 지점은 48개, 연결은 128개까지입니다.
- `walkSpeed`는 초당 픽셀(40~600, 기본 170)입니다.

## 시즌 변형 (`variants`, 선택)

같은 테마가 날짜·요일·시간에 따라 일부만 다르게 보이게 합니다(할로윈, 크리스마스, 금요일 밤…). `when`에는 `dates`, `weekdays`, `hours`만 쓸 수 있고, 위에서부터 처음 맞는 변형 하나가 적용됩니다. 사무실 화면은 1분마다 확인해서 변형이 바뀌면 다시 그립니다.

```json
"variants": [
  {
    "id": "halloween",
    "name": "할로윈",
    "when": { "dates": ["10-24", "10-31"] },
    "tokens": { "topbar": "#2b1a3d", "topbarInk": "#ffd9a8", "accent": "#ff7a1a" },
    "addLayers": [{ "image": "assets/cobweb.png", "x": 0, "y": 0, "front": true }],
    "props": [{ "id": "plant", "image": "assets/pumpkin.png", "x": 20, "y": 420 }],
    "wear": [{ "image": "assets/witch-hat.png", "at": "head", "y": -6 }],
    "emotes": [{ "when": { "place": "lounge" }, "icon": "🎃", "say": ["트릭 오어 트릿!"] }],
    "interactions": [{ "id": "candy", "label": "사탕 주기", "reactions": [{ "state": "celebrate", "effect": "confetti" }] }]
  }
]
```

| 항목 | 적용 방법 |
|---|---|
| `layers` | 배경 레이어 전체를 바꿈 |
| `addLayers` | 배경 레이어 뒤에 더함 |
| `props`, `characters`, `interactions` | 같은 id는 바꾸고, 새 id는 더함 |
| `accessories` | 모델사별로 바꿈 |
| `wear` | 모든 직원이 모델사 소품 위에 겹쳐 씀(픽셀 모자 대신) |
| `emotes`, `events`, `dress` | 테마 규칙보다 먼저 읽음 |
| `tokens`, `site` | 적은 값만 바꿈(사이트 화면도 그 기간에 바뀜) |

### 기간별 테마 (회사 설정)

테마 자체를 통째로 바꾸고 싶을 때는 테마 탭 아래의 **기간별 테마**에서 기간(MM-DD ~ MM-DD)과 테마를 정합니다(소유자만). 그 기간에는 공통 테마를 따르는 모든 사무실이 예약한 테마로 보입니다. 따로 테마를 고른 사무실은 그대로입니다. 테마 안의 시즌 변형과 함께 쓸 수 있습니다.

## 제한

| 항목 | 한도 |
|---|---|
| zip 크기 | 20MB |
| 파일 수 | 300개 |
| 이미지 한 변 | 4096px |
| 이미지 형식 | PNG, WebP (파일 내용까지 검사해요) |
| 글꼴 | WOFF2, 파일마다 4MB |
| CSS 크기 | 64KB |
| 캐릭터 | 16명 |
| 배경 레이어 | 32장 |
| 동작당 프레임 | 32장 |
| 모델사 소품 | 회사 16곳, 회사·등급마다 레이어 8개 |
| 사무실 소품 | 32개, 소품마다 상태 그림 8개 |
| 머리 위 표시 / 이벤트 반응 | 각 64개 |
| 교감 메뉴 | 16개, 항목마다 반응 16개 |
| 이동 경로 | 지점 48개, 연결 128개 |
| 의상 / 옷 규칙 | 캐릭터마다 16벌 / 32개 |
| 시즌 변형 | 12개 |
| 기간별 테마 | 12개 |

설치할 때 `theme.json`이 쓰지 않는 파일과 LICENSE·CREDITS 외의 파일은 버립니다.

## 커스텀 CSS 규칙

CSS는 설치할 때 서버가 다시 씁니다.

- 모든 규칙이 **그 테마를 쓰는 사무실 안**에만 적용됩니다. `:root`, `html`, `body`는 사무실 영역을 뜻하게 바뀝니다.
- 지워지는 것: `@import`, 패키지 밖을 가리키는 `url()`(외부 주소, `data:` 포함), `image-set()`, `expression()`, `javascript:`, `position: fixed`.
- `z-index`는 100까지입니다.
- 승인·공유·모달·결제·키 화면(`.approval*`, `.share*`, `.modal*`, `.billing*`, `.key*`, `.login*`)을 겨냥한 셀렉터는 빠집니다.
- `@media`, `@supports`, `@keyframes`, `@container`, `@font-face`(패키지 안 글꼴만)는 쓸 수 있습니다.

## 로컬 AI로 그림 만들기

로컬 이미지 AI(예: ComfyUI + SDXL 계열 애니메이션 모델)를 쓰면 혼자서도 캐릭터와 배경을 만들 수 있습니다.

- **잘 되는 것**: 캐릭터 디자인, 표정 초상화, 서 있기·앉기·축하 같은 정지 포즈, 배경과 소품.
- **어려운 것**: 걷기처럼 이어지는 프레임. 프레임마다 옷 주름이나 머리카락이 달라져 떨려 보입니다. 프레임은 2~3장으로 줄이고 앱이 덧붙이는 움직임에 맡기세요.
- **같은 캐릭터 유지**: 레퍼런스 이미지(IP-Adapter)와 포즈 스켈레톤(OpenPose)을 함께 쓰면 여러 포즈에서도 같은 사람처럼 보입니다. 표정만 바꿀 때는 이미지 편집 모델로 얼굴만 고치는 편이 안정적입니다.
- **배경 제거**: 캐릭터는 투명 PNG여야 합니다. 배경 제거 노드(BiRefNet, rembg 등)를 쓰세요.
- **라이선스**: 쓴 모델의 라이선스가 결과물 공유를 허용하는지 확인하고, `CREDITS.txt`에 모델 이름을 적어 주세요.

### 저장소의 생성 파이프라인

공식 샘플 테마 "일러스트 오피스"는 이 방법으로 만들었습니다. 레시피 하나로 배경, 소품, 캐릭터, 표정 초상화, 모델사 소품을 모두 그려 테마 zip까지 만듭니다.

1. [ComfyUI](https://github.com/Comfy-Org/ComfyUI) Windows portable(NVIDIA)을 받아 풀고, 체크포인트(예: `animagine-xl-4.0.safetensors`)를 `ComfyUI/models/checkpoints`에 넣습니다. SDXL 기준 VRAM 8GB 이상을 권장합니다.
2. ComfyUI의 내장 Python에 배경 제거 패키지를 설치합니다: `python_embeded\python.exe -m pip install rembg onnxruntime`
3. ComfyUI를 켭니다: `python_embeded\python.exe -s ComfyUI\main.py --listen 127.0.0.1 --port 8188`
4. 저장소 루트에서 레시피로 테마를 만듭니다:
   ```
   <ComfyUI>\python_embeded\python.exe scripts/art/make_theme.py art/themes/illust-office/art.json
   ```
5. `art/build/<id>.zip`이 나오면 앱의 테마 탭에서 설치합니다.

레시피(`art/themes/<id>/art.json`)에는 캐릭터마다 외형(`look`)과 시드를 적고, 포즈와 표정은 모든 캐릭터가 함께 씁니다. 같은 시드와 외형 설명을 써서 포즈가 달라도 같은 사람으로 보이게 합니다. 생성 결과는 `art/build/<id>/raw`에 저장돼 다시 돌리면 바뀐 것만 그립니다. 마음에 들지 않는 그림은 레시피에서 시드를 바꾸거나 `--redo <키>`(예: `--redo mina-idle`)로 다시 그립니다.

레시피의 가구(`props`)는 각각 소품으로 내보내고, 배경 레이어에는 벽과 바닥만 남습니다. 문에 `"door": true`와 `"states": { "open": { "swing": true } }`를 쓰면 닫힌 문 그림에서 열린 문 그림을 만듭니다(그림 모델은 서로 맞는 열린 문을 잘 못 그려요). `emotes`, `interactions`, `events`, `dress`, `paths`(`waypoints`, `links`, `walkSpeed`)는 그대로 패키지에 들어가고, `variants`의 `props`와 `wear`는 그림을 그려서 넣습니다.

- **무대 모양**: `room.stage`의 `wallStyle`은 `stripes`(나무 패널 벽지), `glass`(유리 칸막이), `panels`(금속 패널과 빛 줄), `floorStyle`은 `boards`(마루), `carpet`(카펫 타일), `grid`(빛나는 격자)입니다. 공간(`areas`)마다 따로 정할 수 있고, `panels`·`grid`는 `colors.glow`를 빛 색으로 씁니다.
- **의상**: 캐릭터에 `"outfits": [{ "id", "name", "look" }]`을 쓰면 같은 시드로 옷만 바꿔 다시 그려, 같은 프레임 배치의 의상 시트를 만듭니다.
- **부위 나누기**: 캐릭터에 `"split": { "head": 0.46, "legs": 0.76 }`(머리 꼭대기부터 그림 높이의 비율)을 쓰면 시트를 다리(`sheet`)·몸통·머리 레이어로 잘라 냅니다.
- **포즈별 시드**: 한 포즈만 이상하면 `"poseSeeds": { "back": 8121 }`로 그 포즈의 시드만 바꿉니다(의상에도 쓸 수 있어요). 뒷모습이 자주 깨지니 빌드 뒤 `back` 프레임을 꼭 확인하세요.
- **배경색**: 은발처럼 옅은 머리는 흰 배경에서 뒷모습이 흐려져 사라지기 쉽습니다. 캐릭터에 `"background": "dark gray background"`를 쓰면 그 캐릭터의 포즈를 단색 회색 배경에 그립니다(배경은 잘라 내요).

같은 저장소의 "회사 오피스"(`corp-office`)와 "SF 오피스"(`sf-office`) 레시피가 이 기능들의 예시입니다.

## 라이선스

`license` 필드는 필수입니다. 테마는 만든 사람의 저작물이며, 앱의 라이선스(AGPL-3.0)와는 별개입니다. 다른 사람의 그림을 쓸 때는 그 그림의 라이선스를 지키고 출처를 `CREDITS.txt`에 적어 주세요.
