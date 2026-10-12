# 主题制作指南

主题可以改变办公室的**背景**、**道具**和**员工角色**。角色有基本动作（站立、行走、坐下），以及配合工作中发生的事情的**事件动作**（求助、被退回、任务获批等）。此外还可以加入随条件变化的**头顶图标和台词**、**互动菜单**（打招呼等）、**事件反应**、**移动路线**，以及万圣节这样的**季节变体**。各部分分别定义，未定义的部分使用应用默认值。应用自带的像素办公室也是这样的一个主题。

做好的主题以一个 `.zip` 文件分享。为了让任何人都能安装，安装时会检查文件和 CSS，只接受安全的内容。

已安装的主题在主题标签中点击 **用于所有办公室** 后，会成为公司通用主题，应用到所有办公室（仅所有者）。若只想让某个办公室与众不同，在该办公室点击 **仅用于此办公室**；要恢复时点击 **跟随通用主题**。

主题不仅改变办公室场景，也会改变**网站界面**（顶部栏、标签、面板、按钮、字体、圆角、页面背景）。默认跟随当前查看的办公室的主题；所有者在主题卡片上点击 **用于网站** 后，无论哪个办公室都会固定使用该主题。用 **跟随办公室主题** 恢复。

## 制作方法

### 1. 主题工作室（推荐）

在应用的 **主题 → 制作主题** 中，无需直接编写 JSON 即可制作。

1. **基本信息**：设定名称、id（2~40 个小写英文字母、数字和连字符）和许可。
2. **背景**：上传 1000×480 的图片。可以叠加多张，标记为“前景”的图层会像桌子前挡板一样遮住员工。
3. **设定位置**：在预览中点击，设定各角色的座位、休息位置和门。白板、资料室、保险箱、档案柜的区域用拖动来画。未设定的位置沿用默认办公室布局。
4. **角色**：上传精灵图并输入帧尺寸，会被切成网格。选择动作后点击格子，就会把帧加入该动作。
5. **颜色与 CSS**（可选）
6. 在预览中切换动作确认后，点击 **下载 zip** 或 **直接安装**。

工作室执行与服务器相同的检查，所以只要显示“可以导出了”，安装也会通过。

### 2. 手动制作

按以下结构收集文件并打包成 zip。连同文件夹一起打包也可以。

```text
theme.json        清单文件（必需）
preview.png       图库缩略图（必需，建议 500×240）
assets/*.png      背景图层、精灵图、头像
theme.css         自定义 CSS（可选）
LICENSE.txt       许可全文（可选）
```

## 动作列表

角色**只有一个 `idle`（站立）**，主题也能运行。缺少的动作会沿“缺少时”一列找到最接近的动作来代替。

| 分类 | 动作 | 何时 | 缺少时 |
|---|---|---|---|
| 基本 | `idle` | 站立时（必需） | — |
| | `walk` | 行走时 | idle |
| | `sit` | 在座位上时 | idle |
| | `back` | 背影：向房间深处走，或站在白板、书架、门前时 | idle |
| | `walk_back` | 以背影行走时 | walk |
| 员工状态 | `working` | 工作中 | sit |
| | `collaborating` | 协作中 | working |
| | `waiting` | 等待轮到自己 | idle |
| | `awaiting_approval` | 等待用户批准 | waiting |
| | `help_requested` | 提出求助时 | troubled |
| | `paused` | 暂停 | idle |
| | `error` | 出错 | panic |
| 表情 | `smile` | 微笑 | idle |
| | `focus` | 专注 | working |
| | `sweat` | 冒汗 | troubled |
| | `troubled` | 为难 | idle |
| | `panic` | 慌张 | sweat |
| | `thanks` | 得到帮助时 | smile |
| | `celebrate` | 庆祝 | smile |
| 工作瞬间 | `step.brief` | 开始任务受理步骤时 | working |
| | `step.research` | 开始资料调研时 | focus |
| | `step.draft` | 开始撰写初稿时 | working |
| | `step.review` | 开始审核时 | focus |
| | `review.rejected` | 自己的成果被退回时 | troubled |
| | `task.approved` | 任务完成时（所有人） | celebrate |
| | `budget.exceeded` | 预算用完时 | panic |

工作瞬间的动作播放约 2.4 秒后回到原来的状态。行走、晃动、庆祝跳跃等动态由应用添加，所以 2~3 帧就足够了。

## theme.json

```json
{
  "format": "avataragent-theme",
  "version": 1,
  "id": "cozy-office",
  "themeVersion": "1.0.0",
  "name": "温馨办公室",
  "author": "作者",
  "license": "CC-BY-4.0",
  "description": "温暖的原木风办公室",
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
      "name": "美娜",
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

- **坐标**：办公室使用 1000×480 的坐标系。座位和休息位置是角色**脚**的位置。
- **角色职责**：`manager`、`researcher`、`writer`、`reviewer`。未设定的职责和位置使用默认布局。
- **`spots`**：白板（`board`，任务标题写在这里）、资料室（`shelf`，调研时会走过去）、保险箱（`safe`，显示利润）、档案柜（`archive`，完成的文件会飞到这里）。
- **工作区与休息区**（可选）：给背景图层加上 `"area": "work"` 或 `"area": "lounge"`，分别设定两个区域的背景，并在 `scene.areas` 中写出各区域的范围（例如 `"areas": { "work": { "x": 0, "y": 0, "w": 760, "h": 480 }, "lounge": { "x": 760, "y": 0, "w": 240, "h": 480 } }`）。团队颜色只会染在工作区的背景上；两个区域都有时，员工不经过门，直接在座位和休息位置之间往返。不设定区域时，第一个图层被视为整个房间。
- **`anchor`**：帧内脚着地的位置（0~1）。默认是底部中央。
- **`head`**：帧内头顶的位置（0~1）。员工的 AI 模型厂商帽子会戴在这里。
- **`scaleMode`**：像素画用 `nearest`，插画用 `linear`。
- **`tokens`**：网站界面的颜色。只接受颜色值（#hex、rgb()、hsl()）。请参阅下方的[网站界面](#网站界面tokenssite可选)。
- **`hand`**：帧内拿东西的手的位置（0~1）。默认值为 `{ "x": 0.8, "y": 0.6 }`。
- **`portraits`**（可选）：按表情区分的头像（`normal`、`smile`、`focus`、`sweat`、`troubled`、`panic`、`thanks`、`celebrate`）。会显示在求助窗口和员工卡片上。缺少的表情按与动作相同的顺序寻找替代（例如 `thanks` → `smile`），仍然没有则用 `normal`，再没有就显示站立帧。建议 128×128 左右。
- **角色分配**：在员工管理中可以为每位员工选择主题角色。未选择的员工按职责顺序分配（经理 → 第一个角色，…）。

### 部位与服装（`parts`、`outfits`、`dress`，可选）

可以把角色分成头、躯干、腿的图层，并设定可换的服装。

```json
{
  "id": "mina",
  "sheet": "assets/mina-legs.png",
  "parts": { "body": "assets/mina-body.png", "head": "assets/mina-head.png" },
  "outfits": [
    { "id": "casual", "name": { "ko": "캐주얼", "zh": "休闲装", "en": "Casual" }, "parts": { "body": "assets/mina-cardigan.png" } },
    { "id": "pumpkin", "name": "南瓜装", "sheet": "assets/mina-pumpkin.png" }
  ],
  "frames": { "...": "..." }
}
```

- **`parts`**：`legs`、`body`、`head` 部位图。在 `sheet` 之上按腿 → 躯干 → 头的顺序叠加。所有部位图都必须与 `sheet` **尺寸和帧布局完全相同**，并且自身部位以外是透明的（类似 LPC 的纸娃娃方式）。使用部位时，`sheet` 成为最底层（腿或素体）。
- **`outfits`**：每个角色最多 16 套。`parts` 只替换对应部位，`sheet` 替换整张图（此时不叠加角色的部位，只叠加服装的 `parts`）。服装图同样沿用角色的帧布局。
- 各角色的服装 id 使用相同的词（`casual`、`suit`…）。在员工管理的 **服装** 中为员工选择后，只有拥有该 id 服装的角色才会换装。
- **`dress`**（主题顶层，最多 32 条）：按条件自动换装。从上往下读，第一条指向**该角色拥有的服装**的规则，优先于为员工选择的服装。没有匹配的规则时使用为员工选择的服装，再没有则用默认服装。

```json
"dress": [
  { "when": { "place": "lounge" }, "outfit": "casual" },
  { "when": { "weekdays": [5] }, "outfit": "casual" }
]
```

在季节变体中加入 `dress`（例如万圣节的 `pumpkin`）后，在该期间会先读这些规则。头像与服装无关，始终使用同一张图。

### 按模型的形态（`forms`，可选）

角色可以根据员工的模型改变整体外形（像超级赛亚人 1、2、3、4 那样）。按角色设置，分为按等级（`tiers`）和按模型 id（`models`）。

```json
"characters": [{
  "id": "goku",
  "sheet": "assets/goku.png",
  "forms": {
    "tiers": {
      "1": { "name": "초사이언 1", "sheet": "assets/goku-ssj1.png" },
      "2": { "name": "초사이언 2", "sheet": "assets/goku-ssj2.png", "accessories": [{ "image": "assets/spark.png", "at": "head" }] },
      "3": { "name": "초사이언 3", "parts": { "head": "assets/goku-ssj3-hair.png" } }
    },
    "models": {
      "claude-opus": { "name": "초사이언 4", "sheet": "assets/goku-ssj4.png", "portraits": { "normal": "assets/goku-ssj4-face.png" } }
    }
  }
}]
```

- 有按模型的形态时，该模型用它代替等级形态。两者都没有时保持平常外形。
- `sheet` 替换整个精灵图（优先于服装），`parts` 在服装之上只替换一个部位。两者都要与角色的 `sheet` 帧布局相同。
- 有 `accessories` 时，该形态用这个列表代替主题饰品（`accessories`、`modelAccessories`）；没有时沿用主题饰品。
- 有 `portraits` 时对话头像也会变。`name` 显示在员工管理的模型选择卡片上。
- 每个形态至少需要 `sheet`、`parts`、`accessories`、`portraits` 之一；每个角色最多 64 个按模型的形态。

### 模型厂商饰品（`accessories`，可选）

员工的 AI 模型厂商和等级默认以像素帽子显示。主题设定饰品后，会用饰品代替帽子叠加上去。

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

- 键是模型厂商 id（`claude`、`gpt`、`grok`、`gemini`，或你自己添加的公司的 id），`*` 表示其余所有公司。
- 等级会累加。3 级模型会叠加 1、2、3 级的全部图层。
- 等级数量不固定。键是 1~99 的等级数字，在模型·API 密钥界面建立 4 级以上后可以直接使用该数字。主题中没有的等级会沿用下方最接近的等级（`forms.tiers`、`accessoryLabels.tiers` 也一样）。例如只定义了 1、2、3 的主题中，5 级模型使用 3 级的外形。
- `at` 是 `head`（头顶）或 `hand`（手），`x`、`y` 是从该点偏移的像素（±512），`scale` 是缩放倍率。图片以中心为基准贴上。
- 每个公司、每个等级最多 8 个图层，最多 16 家公司。没有饰品组的公司戴像素帽子；有饰品组但该等级没有图层时什么也不戴。
- 主题工作室还没有饰品编辑界面。请直接在从工作室下载的 zip 里的 `theme.json` 中添加。

#### 按模型的饰品（`modelAccessories`，可选）

如果只想让某个模型戴不同的饰品，可以按模型 id 指定。

```json
"modelAccessories": {
  "claude-opus": [{ "image": "assets/gold-crown.png", "at": "head", "y": -6 }],
  "gpt-pro": [{ "image": "assets/star-wand.png", "at": "hand", "x": 6, "y": -12 }]
}
```

- 键是模型 id（`claude-opus`、`gpt-pro` 等，也可以是在模型·API 密钥界面添加的模型 id）。
- 有按模型的饰品时，该模型只用这个列表，代替公司·等级饰品（不会按等级叠加）。
- 图层格式与 `accessories` 相同，每个模型最多 8 个，最多 64 个模型。季节变体中也可以设置。

#### 饰品说明（`accessoryLabels`，可选）

在员工管理的“选择模型”中选中此主题时，会显示主题写的说明，而不是像素帽子的说明。

```json
"accessoryLabels": {
  "summary": { "ko": "최상위 모델은 별 마법 지팡이를 들어요.", "en": "Top-tier models hold a star magic wand." },
  "companies": { "claude": "주황 리본", "*": "머리핀" },
  "tiers": { "1": "리본", "2": "리본 + 망토", "3": "리본 + 망토 + 지팡이" },
  "models": { "claude-opus": "황금 지팡이" }
}
```

- `summary` 是模型选择上方的一行说明（200 字）。
- `companies` 显示在公司名旁（60 字），`*` 表示其余公司。
- `tiers` 按等级、`models` 按模型 id 写说明（60 字），显示在模型卡片上。有模型说明时优先于等级说明。
- 每条文字可以是字符串，也可以是按语言（`ko`、`en`、`ja`、`zh`）的对象。

## 网站界面（`tokens`、`site`，可选）

办公室以外界面的外观。未设定的值使用默认外观。

```json
"tokens": { "topbar": "#5a3f33", "topbarInk": "#fff8ee", "tab": "#f7e9d6", "note": "#ffe6b8" },
"site": {
  "font": "rounded",
  "radius": 8,
  "background": { "image": "assets/paper.png", "repeat": true }
}
```

| 颜色令牌 | 用于 |
|---|---|
| `bg` | 页面底色 |
| `paper` | 面板、卡片底色 |
| `surface` | 按钮、输入框底色 |
| `ink`、`muted` | 文字、浅色文字 |
| `line` | 边框和阴影 |
| `topbar`、`topbarInk`、`topbarLine` | 顶部栏底色、文字、下边框（菜单标签使用底色与文字的混合色） |
| `tabBar`、`tab` | 办公室标签栏底色、面板内的标签 |
| `yellow` | 选中的标签 |
| `note`、`hover` | 选中的项目和便签、鼠标悬停的项目 |
| `accent`、`primary`、`green`、`red`、`blue` | 强调、主按钮、盈利和亏损等 |

- **`font`**：`default`、`rounded`（圆体）、`serif`（宋体）、`mono`（等宽）之一，或包内的字体文件 `{ "file": "fonts/hand.woff2" }`。字体文件只接受 WOFF2，最大 4MB。预设使用设备上已安装的字体，没有则显示为默认字体。
- **`radius`**：面板、按钮、标签的圆角（0~20px）。默认是直角 0。
- **`background`**：页面背景图。`repeat: true` 时按原始尺寸平铺，否则拉伸以覆盖整个屏幕。
- 进度、紧急程度等含义固定的徽章颜色不会改变。

## 条件规则（`when`）

下面的头顶显示、互动菜单、事件反应和季节变体都使用同样的条件（`when`）。写出的条件必须**全部**满足；列表只要满足其中**一个**即可。只有一个值时，也可以用字符串代替列表。

| 条件 | 值 | 示例 |
|---|---|---|
| `status` | 员工状态：`idle`、`waiting`、`working`、`collaborating`、`awaiting_approval`、`help_requested`、`paused`、`off_duty`、`capacity_exhausted`、`error` | `["working", "collaborating"]` |
| `place` | `desk`（座位）或 `lounge`（休息室） | `"lounge"` |
| `role` | `manager`、`researcher`、`writer`、`reviewer` | `["manager"]` |
| `character` | 本主题的角色 id | `["mina"]` |
| `expression` | 表情：`normal`、`smile`、`focus`、`sweat`、`troubled`、`panic`、`thanks`、`celebrate` | `"celebrate"` |
| `team` | 办公室团队：`dev`、`hr`、`mgmt`、`support`、`welfare` | `["dev"]` |
| `walking` | 是否在行走 | `false` |
| `hours` | [开始时, 结束时) 查看者的当地时间，可跨越午夜 | `[22, 6]` |
| `weekdays` | 星期 0（日）~6（六） | `[0, 6]` |
| `dates` | ["MM-DD", "MM-DD"] 含两端，可跨越新年 | `["12-24", "12-25"]` |

规则列表**从上往下读，使用第一条匹配的规则**。请把具体的规则放在上面，宽泛的规则放在下面。

文字（`say`、`label`）可以写成一个字符串，也可以按语言写：`{ "ko": "안녕하세요!", "en": "Hello!", "ja": "こんにちは!", "zh": "你好!" }`。没有查看者的语言时显示韩语，再没有就显示现有的其中一个。`say` 中写多句时，每次挑一句说。

## 头顶显示（`emotes`，可选）

设定员工头顶的图标和偶尔说的话。主题规则先于应用默认规则读取。应用默认规则为：求助 `?`、等待批准 `!`、出错 `!`、暂停 `II`、庆祝 ⭐、感谢 💗、按职责的工作图标、按职责的休息图标。

```json
"emotes": [
  { "when": { "place": "lounge", "walking": false, "hours": [12, 13] }, "icon": "🍱", "say": ["午饭真好吃~"], "every": 45 },
  { "when": { "status": "working", "character": "mina" }, "icon": { "image": "assets/coffee.png" } },
  { "when": { "status": "paused" }, "icon": null }
]
```

- `icon`：表情符号或短文字（最多 8 个字）、`{ "text": "!", "color": "#e74c3c" }`（圆形徽章），或 `{ "image": "assets/…png" }`（缩小到 28px 以内显示）。为 `null` 时隐藏图标。
- `say`：规则开始匹配时，用对话气泡说一次。写了 `every`（秒，3~3600）时，在规则匹配期间按该间隔再说。
- 图标和台词分开查找。图标取自第一条有 `icon` 的规则，台词取自第一条有 `say` 的规则。
- 修改求助这类重要显示时，请确保用户仍能认出来。

## 互动菜单（`interactions`，可选）

在右键（长按）员工打开的菜单下方加入打招呼等项目。这些项目**只展示反应**，不会改动任务或数据。应用默认有 **打招呼**（`greet`），台词和动作会随时间段（早上、中午、晚上、凌晨）和员工状态（工作中、为难）变化。

```json
"interactions": [
  {
    "id": "snack",
    "label": { "ko": "간식 주기", "zh": "给零食", "en": "Give a snack" },
    "when": { "place": "lounge" },
    "reactions": [
      { "when": { "hours": [15, 17] }, "state": "celebrate", "say": ["零食时间到！"], "effect": "hearts" },
      { "state": "smile", "say": ["谢谢！"] }
    ]
  },
  { "id": "greet", "hidden": true }
]
```

- 只有 `when` 匹配时才显示在菜单中。一个匹配的反应都没有时也会隐藏。
- `reactions` 使用从上往下第一个匹配的反应。`state` 是播放约 2.4 秒的动作，`effect` 是特效。
- 特效：`sparkle`（闪光）、`hearts`（爱心）、`sweat`（汗）、`notes`（音符）、`confetti`（彩纸）、`zzz`（困倦）。
- 与应用默认项目 id 相同时会被主题的项目替换，`"hidden": true` 则从菜单中移除。

## 道具（`props`，可选）

不把家具合成到背景图中，而是一件一件地摆放。每件道具都可以换图，或在季节变体中替换，也可以有按状态区分的图。

```json
"props": [
  { "id": "door", "image": "assets/door.png", "x": 881, "y": 66, "spot": "door", "states": { "open": "assets/door-open.png" } },
  { "id": "sofa", "image": "assets/sofa.png", "x": 800, "y": 262 },
  { "id": "desk-1", "image": "assets/desk.png", "x": 85, "y": 232, "front": true }
]
```

- `x`、`y` 是图片的左上角。道具按书写顺序画在背景图层之上，所以请从远处的开始写。
- `front: true` 时画在员工前面。多件道具共用同一张图也可以。
- `spot` 是该道具代表的位置（`board`、`shelf`、`safe`、`archive`、`door`）。位置的坐标仍由 `scene.spots` 和 `scene.door` 决定。
- `spot: "door"` 的道具如果有 `open` 状态的图，员工上下班经过门时会短暂显示打开的图。
- 状态图请做成与基本图相同的尺寸，叠在同一个左上角。每件道具最多 8 张，通过事件反应中的 `prop` 切换。

## 事件反应（`events`，可选）

设定办公室发生事件时员工的动作、台词、特效和道具状态。应用默认的演出（盖章、硬币、搬文件）照常显示，主题设定的动作在其上播放。`"replace": true` 时关闭该事件的应用默认演出。

```json
"events": [
  { "on": "agent.arrived", "say": ["我来上班了！"] },
  { "on": "task.completed", "when": { "role": "manager" }, "say": ["大家辛苦了！"], "effect": "confetti" },
  { "on": "review.rejected", "state": "panic", "say": ["我重新做…"], "replace": true },
  { "on": "value.recognized", "prop": { "id": "safe", "state": "open", "ms": 2000 } }
]
```

| 事件 | 何时 | 做出反应的员工 |
|---|---|---|
| `task.created` | 任务被登记时 | 与登记相关的员工（没有则在场景中央显示特效） |
| `task.completed` | 任务完成时 | 在座位上的所有人 |
| `task.handed_off` | 交给下一步时 | 交出的员工 |
| `review.approved` / `review.rejected` | 审核通过 / 退回 | 审核员 / 被退回的员工 |
| `approval.requested` / `approval.denied` | 请求用户批准 / 要求修改 | 相关员工 |
| `agent.help_received` | 得到帮助时 | 得到帮助的员工 |
| `value.recognized` | 产生利润时 | 相关员工 |
| `mail.received` / `inquiry.received` | 邮件、咨询到达 | 负责的员工 |
| `budget.exceeded` | 预算用完时 | 相关员工 |
| `cost.recorded` | 产生费用时 | 相关员工 |
| `agent.arrived` / `agent.left` | 上班从门进来时 / 下班出门时 | 该员工 |

- 一个事件有多条规则时，每位员工使用第一条匹配的规则。`when` 中的员工条件以做出反应的员工为准。
- `prop` 的 `ms` 是显示该状态的时间（100~10000，默认 1500）。

## 移动路线（`scene.waypoints`、`scene.links`，可选）

员工默认直线走向目的地。设定途经点和连线后，会沿该路线行走（桌子之间的通道、门前等）。

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

- 先走到离出发点最近的点，沿连线以最短路线走到离目的地最近的点，再走向目的地。
- 如果目的地比最近的点还近，或两个点之间没有连通，就直线前往。
- 设定路线后，不再使用工作区与休息室之间经过走廊（门）的路线。最多 48 个点、128 条连线。
- `walkSpeed` 是每秒像素数（40~600，默认 170）。

## 季节变体（`variants`，可选）

让同一个主题根据日期、星期、时间只在部分地方显得不同（万圣节、圣诞节、周五晚上…）。`when` 只能用 `dates`、`weekdays`、`hours`，从上往下第一个匹配的变体生效。办公室画面每分钟检查一次，变体变化时重新绘制。

```json
"variants": [
  {
    "id": "halloween",
    "name": "万圣节",
    "when": { "dates": ["10-24", "10-31"] },
    "tokens": { "topbar": "#2b1a3d", "topbarInk": "#ffd9a8", "accent": "#ff7a1a" },
    "addLayers": [{ "image": "assets/cobweb.png", "x": 0, "y": 0, "front": true }],
    "props": [{ "id": "plant", "image": "assets/pumpkin.png", "x": 20, "y": 420 }],
    "wear": [{ "image": "assets/witch-hat.png", "at": "head", "y": -6 }],
    "emotes": [{ "when": { "place": "lounge" }, "icon": "🎃", "say": ["不给糖就捣蛋！"] }],
    "interactions": [{ "id": "candy", "label": "给糖果", "reactions": [{ "state": "celebrate", "effect": "confetti" }] }]
  }
]
```

| 项目 | 应用方式 |
|---|---|
| `layers` | 替换全部背景图层 |
| `addLayers` | 加在背景图层之后 |
| `props`、`characters`、`interactions` | 相同 id 替换，新 id 添加 |
| `accessories` | 按模型厂商替换 |
| `modelAccessories` | 按模型替换 |
| `wear` | 所有员工叠戴在模型厂商饰品之上（代替像素帽子） |
| `emotes`、`events`、`dress` | 先于主题规则读取 |
| `tokens`、`site` | 只改写出的值（网站界面在该期间也会改变） |

### 按期间切换主题（公司设置）

想整个替换主题时，在主题标签下方的 **按期间切换主题** 中设定期间（MM-DD ~ MM-DD）和主题（仅所有者）。在该期间，所有跟随通用主题的办公室都会显示预约的主题。单独选择了主题的办公室保持不变。可以与主题内的季节变体同时使用。

## 限制

| 项目 | 上限 |
|---|---|
| zip 大小 | 20MB |
| 文件数 | 300 个 |
| 图片单边 | 4096px |
| 图片格式 | PNG、WebP（会检查到文件内容） |
| 字体 | WOFF2，每个文件 4MB |
| CSS 大小 | 64KB |
| 角色 | 16 个 |
| 背景图层 | 32 张 |
| 每个动作的帧数 | 32 张 |
| 模型厂商饰品 | 16 家公司，每个公司每个等级 8 个图层 |
| 办公室道具 | 32 件，每件道具 8 张状态图 |
| 头顶显示 / 事件反应 | 各 64 条 |
| 互动菜单 | 16 项，每项 16 个反应 |
| 移动路线 | 48 个点，128 条连线 |
| 服装 / 换装规则 | 每个角色 16 套 / 32 条 |
| 季节变体 | 12 个 |
| 按期间切换主题 | 12 个 |

安装时，`theme.json` 未使用的文件以及 LICENSE、CREDITS 以外的文件会被丢弃。

## 自定义 CSS 规则

安装时服务器会改写 CSS。

- 所有规则只作用于**使用该主题的办公室内部**。`:root`、`html`、`body` 会被改为指代办公室区域。
- 会被删除的内容：`@import`、指向包外的 `url()`（包括外部地址和 `data:`）、`image-set()`、`expression()`、`javascript:`、`position: fixed`。
- `z-index` 最大为 100。
- 针对批准、分享、弹窗、付款、密钥界面（`.approval*`、`.share*`、`.modal*`、`.billing*`、`.key*`、`.login*`）的选择器会被去掉。
- 可以使用 `@media`、`@supports`、`@keyframes`、`@container`、`@font-face`（仅限包内字体）。

## 用本地 AI 制作图片

使用本地图像 AI（例如 ComfyUI + SDXL 系列动漫模型），一个人也能制作角色和背景。

- **效果好的**：角色设计、表情头像、站立、坐下、庆祝等静态姿势、背景和道具。
- **困难的**：像行走这样连续的帧。每帧的衣服褶皱或头发都会变化，看起来会抖动。请把帧减到 2~3 张，交给应用添加的动态。
- **保持同一个角色**：同时使用参考图（IP-Adapter）和姿势骨架（OpenPose），多个姿势也能看起来像同一个人。只改表情时，用图像编辑模型只修改脸部会更稳定。
- **去除背景**：角色必须是透明 PNG。请使用背景去除节点（BiRefNet、rembg 等）。
- **许可**：请确认所用模型的许可允许分享生成结果，并在 `CREDITS.txt` 中写上模型名称。

### 仓库中的生成流程

官方示例主题“插画办公室”就是用这种方法做的。一个配方就能画出背景、道具、角色、表情头像和模型厂商饰品，并直接生成主题 zip。

1. 下载并解压 [ComfyUI](https://github.com/Comfy-Org/ComfyUI) 的 Windows portable（NVIDIA），把检查点（例如 `animagine-xl-4.0.safetensors`）放到 `ComfyUI/models/checkpoints`。以 SDXL 为准，建议显存 8GB 以上。
2. 在 ComfyUI 内置的 Python 中安装背景去除包：`python_embeded\python.exe -m pip install rembg onnxruntime`
3. 启动 ComfyUI：`python_embeded\python.exe -s ComfyUI\main.py --listen 127.0.0.1 --port 8188`
4. 在仓库根目录用配方生成主题：
   ```
   <ComfyUI>\python_embeded\python.exe scripts/art/make_theme.py art/themes/illust-office/art.json
   ```
5. 生成 `art/build/<id>.zip` 后，在应用的主题标签中安装。

配方（`art/themes/<id>/art.json`）中为每个角色写上外观（`look`）和种子，姿势和表情由所有角色共用。使用相同的种子和外观描述，让不同姿势也看起来像同一个人。生成结果保存在 `art/build/<id>/raw` 中，再次运行时只画有变化的部分。不满意的图可以在配方中更换种子，或用 `--redo <键>`（例如 `--redo mina-idle`）重画。

配方中的家具（`props`）会分别导出为道具，背景图层只保留墙和地板。给门写上 `"door": true` 和 `"states": { "open": { "swing": true } }`，就会从关着的门的图生成打开的门的图（图像模型很难画出与之匹配的开门图）。`emotes`、`interactions`、`events`、`dress`、`paths`（`waypoints`、`links`、`walkSpeed`）会原样放入包中，`variants` 的 `props` 和 `wear` 会画好后放入。

- **舞台外观**：`room.stage` 的 `wallStyle` 为 `stripes`（木纹墙板壁纸）、`glass`（玻璃隔断）、`panels`（金属面板和灯带），`floorStyle` 为 `boards`（木地板）、`carpet`（方块地毯）、`grid`（发光网格）。可按区域（`areas`）分别设定，`panels` 和 `grid` 使用 `colors.glow` 作为光的颜色。
- **服装**：给角色写上 `"outfits": [{ "id", "name", "look" }]`，会用同样的种子只换衣服重画，生成相同帧布局的服装图。
- **拆分部位**：给角色写上 `"split": { "head": 0.46, "legs": 0.76 }`（从头顶算起占图片高度的比例），会把图切成腿（`sheet`）、躯干、头的图层。
- **按姿势设种子**：只有某个姿势不对时，用 `"poseSeeds": { "back": 8121 }` 只更换该姿势的种子（服装也可用）。背影经常出问题，构建后请务必检查 `back` 帧。
- **背景色**：银发这样的浅色头发在白色背景上，背影容易变淡消失。给角色写上 `"background": "dark gray background"`，就会在纯灰色背景上画该角色的姿势（背景会被裁掉）。

同一仓库中的“企业办公室”（`corp-office`）和“科幻办公室”（`sf-office`）配方就是这些功能的示例。

## 许可

`license` 字段是必需的。主题是其创作者的作品，与应用的许可（AGPL-3.0）无关。使用他人的图片时，请遵守该图片的许可，并在 `CREDITS.txt` 中注明出处。
