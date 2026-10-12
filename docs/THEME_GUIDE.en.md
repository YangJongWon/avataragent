# Theme guide

A theme changes the office's **backdrop**, **props** and **staff characters**. Characters have basic motions (standing, walking, sitting) and **event motions** for things that happen during work (asking for help, getting sent back, a task being approved and so on). On top of that you can add **icons and lines above heads** that change with conditions, an **interaction menu** (Say hello and the like), **event reactions**, **walking paths** and **seasonal variants** such as Halloween. Each part is defined separately, and whatever you leave out uses the app's defaults. The pixel office that ships with the app is one of these themes too.

You share a theme as a single `.zip` file. So that anyone can install it, files and CSS are checked on install and only safe content is accepted.

On the Themes tab, an installed theme becomes the company-wide theme, applied to every office, when you press **Use in all offices** (owner only). To decorate one office differently, press **Use in this office only** there; press **Follow the shared theme** to go back.

A theme changes not only the office scene but also the **site screens** (top bar, tabs, panels, buttons, font, corners, page background). By default these follow the theme of the office you're looking at; when the owner presses **Use for the site** on a theme card, the site stays on that theme whatever the office. **Follow the office theme** undoes it.

## How to make one

### 1. Theme studio (recommended)

In the app, **Themes → Make a theme** lets you build one without writing JSON.

1. **Basics**: set the name, the id (2–40 lowercase letters, digits and hyphens) and the license.
2. **Backdrop**: upload 1000×480 images. You can stack several, and a layer marked "front" covers the staff, like the front panel of a desk.
3. **Places**: click in the preview to set each role's seat, the break spots and the door. Drag to draw the board, shelf, safe and archive areas. Places you don't set follow the default office layout.
4. **Characters**: upload a sprite sheet and enter the frame size; it's cut into a grid. Pick a motion and click cells to add frames to it.
5. **Colors and CSS** (optional)
6. Check the motions in the preview, then press **Download zip** or **Install now**.

The studio runs the same checks as the server, so once you see "Ready to export", installing will pass too.

### 2. By hand

Gather files in the structure below and zip them. Zipping the whole folder works too.

```text
theme.json        manifest (required)
preview.png       gallery thumbnail (required, 500×240 recommended)
assets/*.png      backdrop layers, sprite sheets, portraits
theme.css         custom CSS (optional)
LICENSE.txt       full license text (optional)
```

## Motions

A theme works with **just `idle` (standing)** for each character. Missing motions are replaced by the nearest motion, following the fallback column.

| Group | Motion | When | If missing |
|---|---|---|---|
| Basic | `idle` | Standing (required) | — |
| | `walk` | Walking | idle |
| | `sit` | At their seat | idle |
| | `back` | From behind: walking toward the top of the room, or standing at the board, shelf or door | idle |
| | `walk_back` | Walking, seen from behind | walk |
| Staff status | `working` | Working | sit |
| | `collaborating` | Collaborating | working |
| | `waiting` | Waiting for their turn | idle |
| | `awaiting_approval` | Waiting for the user's approval | waiting |
| | `help_requested` | Asked for help | troubled |
| | `paused` | Paused | idle |
| | `error` | Error | panic |
| Expressions | `smile` | Smiling | idle |
| | `focus` | Focused | working |
| | `sweat` | Sweating | troubled |
| | `troubled` | Troubled | idle |
| | `panic` | Flustered | sweat |
| | `thanks` | Got help | smile |
| | `celebrate` | Celebrating | smile |
| Work moments | `step.brief` | Starting the brief step | working |
| | `step.research` | Starting research | focus |
| | `step.draft` | Starting the draft | working |
| | `step.review` | Starting review | focus |
| | `review.rejected` | Their result was sent back | troubled |
| | `task.approved` | A task finished (everyone) | celebrate |
| | `budget.exceeded` | The budget ran out | panic |

Work-moment motions play for about 2.4 seconds, then return to the previous state. The app adds movement such as walking, bobbing and celebration jumps, so 2–3 frames are enough.

## theme.json

```json
{
  "format": "avataragent-theme",
  "version": 1,
  "id": "cozy-office",
  "themeVersion": "1.0.0",
  "name": "Cozy office",
  "author": "Your name",
  "license": "CC-BY-4.0",
  "description": "A warm wooden office",
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
      "name": "Mina",
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

- **Coordinates**: the office uses a 1000×480 coordinate system. Seats and break spots are where the character's **feet** go.
- **Roles**: `manager`, `researcher`, `writer`, `reviewer`. Roles and places you don't set use the default layout.
- **`spots`**: the board (`board`, where the task title is written), the shelf (`shelf`, staff walk there to research), the safe (`safe`, profit is shown there) and the archive (`archive`, finished papers fly there).
- **Work and break areas** (optional): add `"area": "work"` or `"area": "lounge"` to backdrop layers to give the two areas separate backdrops, and put each area's region in `scene.areas` (e.g. `"areas": { "work": { "x": 0, "y": 0, "w": 760, "h": 480 }, "lounge": { "x": 760, "y": 0, "w": 240, "h": 480 } }`). The team color tints only the work area's backdrop, and when both areas exist, staff walk straight between their seat and break spot without going through the door. Without areas, the first layer is treated as the whole room.
- **`anchor`**: where the feet touch within the frame (0–1). The default is bottom center.
- **`head`**: the top of the head within the frame (0–1). The staff member's AI-provider hat sits here.
- **`scaleMode`**: `nearest` for pixel art, `linear` for illustrations.
- **`tokens`**: site screen colors. Only color values (#hex, rgb(), hsl()) are accepted. See [Site screens](#site-screens-tokens-site-optional) below.
- **`hand`**: the hand that holds things, within the frame (0–1). The default is `{ "x": 0.8, "y": 0.6 }`.
- **`portraits`** (optional): portraits per expression (`normal`, `smile`, `focus`, `sweat`, `troubled`, `panic`, `thanks`, `celebrate`). They appear in the help request window and on staff cards. A missing expression is looked up in the same order as motions (e.g. `thanks` → `smile`), then `normal`, and failing that the standing frame is shown. Around 128×128 is recommended.
- **Character assignment**: on the Staff tab you can choose a theme character for each staff member. Staff without a choice are assigned in role order (manager → first character, …).

### Parts and outfits (`parts`, `outfits`, `dress`, optional)

You can split a character into head, body and leg layers, and define outfits to change into.

```json
{
  "id": "mina",
  "sheet": "assets/mina-legs.png",
  "parts": { "body": "assets/mina-body.png", "head": "assets/mina-head.png" },
  "outfits": [
    { "id": "casual", "name": { "ko": "캐주얼", "en": "Casual" }, "parts": { "body": "assets/mina-cardigan.png" } },
    { "id": "pumpkin", "name": "Pumpkin suit", "sheet": "assets/mina-pumpkin.png" }
  ],
  "frames": { "...": "..." }
}
```

- **`parts`**: sheets for the `legs`, `body` and `head` parts, stacked on top of `sheet` in the order legs → body → head. Every part sheet must have **exactly the same size and frame layout** as `sheet`, and be transparent outside its own part (a paper-doll approach, like LPC). With parts, `sheet` becomes the bottom layer (legs or bare body).
- **`outfits`**: up to 16 per character. `parts` replaces only those parts; `sheet` replaces the whole image (the character's parts are then not stacked, only the outfit's `parts`). Outfit images use the character's frame layout as-is.
- Use the same outfit ids across characters (`casual`, `suit`…). When you choose an outfit for a staff member under **Outfit** on the Staff tab, only characters that have an outfit with that id change.
- **`dress`** (top level of the theme, up to 32): changes outfits automatically by condition. Rules are read from the top, and the first rule pointing to **an outfit that character has** wins over the outfit the staff member was given. With no matching rule, the chosen outfit is used, and failing that the default.

```json
"dress": [
  { "when": { "place": "lounge" }, "outfit": "casual" },
  { "when": { "weekdays": [5] }, "outfit": "casual" }
]
```

Put `dress` in a seasonal variant (e.g. `pumpkin` for Halloween) and those rules are read first during that period. Portraits stay the same whatever the outfit.

### Looks per model (`forms`, optional)

A character can change its whole look with the staff member's model (like Super Saiyan 1, 2, 3, 4). Set them per character, by tier (`tiers`) and by model id (`models`).

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

- A model's own look is used instead of its tier's. With neither, the character looks as usual.
- `sheet` replaces the whole sprite (over any outfit); `parts` swaps single layers over the outfit. Both use the same frame layout as the character's `sheet`.
- With `accessories`, that look wears this list instead of the theme's accessories (`accessories`, `modelAccessories`); without it, the theme's accessories stay.
- `portraits` replace the dialog portraits too. `name` shows on the model cards in staff management.
- Each look needs at least one of `sheet`, `parts`, `accessories`, `portraits`; up to 64 per-model looks per character.

### AI-provider accessories (`accessories`, optional)

By default, a staff member's AI provider and tier show as a pixel hat. If the theme defines accessories, they're layered on instead of the hat.

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

- Keys are provider ids (`claude`, `gpt`, `grok`, `gemini`, or the id of a company you added); `*` means every other company.
- Tiers stack: a tier-3 model wears the tier 1, 2 and 3 layers.
- The number of tiers is open: keys are tier numbers from 1 to 99, so tiers 4 and up made in the models and API keys screen can be used as they are. A tier the theme leaves out follows the nearest tier below it (`forms.tiers` and `accessoryLabels.tiers` too); for example, in a theme with only 1, 2 and 3, a tier 5 model takes the tier 3 look.
- `at` is `head` (top of the head) or `hand`; `x` and `y` shift from that point in pixels (±512), and `scale` is the size factor. Images are attached by their center.
- Up to 8 layers per company and tier, and up to 16 companies. Companies without a set wear the pixel hat; a company with a set but no layers for that tier wears nothing.
- The theme studio has no accessory editor yet. Add them by hand to the `theme.json` in the zip you download from the studio.

#### Per-model accessories (`modelAccessories`, optional)

To give one model its own accessories, list them by model id.

```json
"modelAccessories": {
  "claude-opus": [{ "image": "assets/gold-crown.png", "at": "head", "y": -6 }],
  "gpt-pro": [{ "image": "assets/star-wand.png", "at": "hand", "x": 6, "y": -12 }]
}
```

- Keys are model ids (`claude-opus`, `gpt-pro`, …, including models you added in the models and API keys screen).
- A model with its own set wears only that list instead of its company and tier set (tiers don't stack on top).
- Layers use the same format as `accessories`; up to 8 per model and 64 models. Seasonal variants can set them too.

#### Accessory descriptions (`accessoryLabels`, optional)

When this theme is picked in "Pick a model" under staff management, these lines replace the pixel-hat descriptions.

```json
"accessoryLabels": {
  "summary": { "ko": "최상위 모델은 별 마법 지팡이를 들어요.", "en": "Top-tier models hold a star magic wand." },
  "companies": { "claude": "주황 리본", "*": "머리핀" },
  "tiers": { "1": "리본", "2": "리본 + 망토", "3": "리본 + 망토 + 지팡이" },
  "models": { "claude-opus": "황금 지팡이" }
}
```

- `summary` is the one line above the model picker (200 characters).
- `companies` goes next to each company's name (60 characters); `*` covers the rest.
- `tiers` (by tier) and `models` (by model id) show on each model card (60 characters). A model's own line wins over its tier's.
- Each text is a string or an object per language (`ko`, `en`, `ja`, `zh`).

## Site screens (`tokens`, `site`, optional)

How the screens outside the office look. Values you don't set use the default look.

```json
"tokens": { "topbar": "#5a3f33", "topbarInk": "#fff8ee", "tab": "#f7e9d6", "note": "#ffe6b8" },
"site": {
  "font": "rounded",
  "radius": 8,
  "background": { "image": "assets/paper.png", "repeat": true }
}
```

| Color token | Used for |
|---|---|
| `bg` | Page background |
| `paper` | Panel and card background |
| `surface` | Button and input background |
| `ink`, `muted` | Text, faint text |
| `line` | Borders and shadows |
| `topbar`, `topbarInk`, `topbarLine` | Top bar background, text, bottom border (menu tabs use a mix of the background and text) |
| `tabBar`, `tab` | Office tab strip background, tabs inside panels |
| `yellow` | Selected tab |
| `note`, `hover` | Selected item and notes, item under the mouse |
| `accent`, `primary`, `green`, `red`, `blue` | Emphasis, primary button, profit and loss etc. |

- **`font`**: one of `default`, `rounded`, `serif` or `mono`, or a font file in the package: `{ "file": "fonts/hand.woff2" }`. Font files must be WOFF2, up to 4MB. Presets use fonts installed on the device and fall back to the default font.
- **`radius`**: corner rounding of panels, buttons and tabs (0–20px). The default is square (0).
- **`background`**: page background image. With `repeat: true` it's tiled at its original size; otherwise it's stretched to cover the screen.
- Badge colors with fixed meanings, such as progress and urgency, don't change.

## Conditions (`when`)

Head icons, the interaction menu, event reactions and seasonal variants below all use the same conditions (`when`). **All** the conditions you write must match, and for a list, **any one** value is enough. For a single value you can write a string instead of a list.

| Condition | Values | Example |
|---|---|---|
| `status` | Staff status: `idle`, `waiting`, `working`, `collaborating`, `awaiting_approval`, `help_requested`, `paused`, `off_duty`, `capacity_exhausted`, `error` | `["working", "collaborating"]` |
| `place` | `desk` (their seat) or `lounge` (break room) | `"lounge"` |
| `role` | `manager`, `researcher`, `writer`, `reviewer` | `["manager"]` |
| `character` | A character id in this theme | `["mina"]` |
| `expression` | Expression: `normal`, `smile`, `focus`, `sweat`, `troubled`, `panic`, `thanks`, `celebrate` | `"celebrate"` |
| `team` | Office team: `dev`, `hr`, `mgmt`, `support`, `welfare` | `["dev"]` |
| `walking` | Whether they're walking | `false` |
| `hours` | [start hour, end hour) in the viewer's local time; may wrap past midnight | `[22, 6]` |
| `weekdays` | Day of the week, 0 (Sun) to 6 (Sat) | `[0, 6]` |
| `dates` | ["MM-DD", "MM-DD"], both ends included; may wrap past New Year | `["12-24", "12-25"]` |

A rule list is **read from the top, and the first matching rule** is used. Put specific rules above broad ones.

Text (`say`, `label`) can be a single string or per language: `{ "ko": "안녕하세요!", "en": "Hello!", "ja": "こんにちは!", "zh": "你好!" }`. If the viewer's language is missing, Korean is shown, and failing that whichever one exists. With several lines in `say`, one is picked each time.

## Head icons and lines (`emotes`, optional)

Sets the icon above a staff member's head and the things they say now and then. Theme rules are read before the app's default rules. The defaults are `?` for a help request, `!` for awaiting approval, `!` for errors, `II` for paused, ⭐ for celebrating, 💗 for thanks, a work icon per role and a break icon per role.

```json
"emotes": [
  { "when": { "place": "lounge", "walking": false, "hours": [12, 13] }, "icon": "🍱", "say": ["Lunch is great~"], "every": 45 },
  { "when": { "status": "working", "character": "mina" }, "icon": { "image": "assets/coffee.png" } },
  { "when": { "status": "paused" }, "icon": null }
]
```

- `icon`: an emoji or short text (up to 8 characters), `{ "text": "!", "color": "#e74c3c" }` (a round badge), or `{ "image": "assets/…png" }` (scaled to fit 28px). `null` hides the icon.
- `say`: said once in a speech bubble when the rule starts matching. With `every` (seconds, 3–3600), it's said again at that interval while the rule matches.
- Icons and lines are looked up separately: the icon comes from the first rule with `icon`, the line from the first rule with `say`.
- If you change important signs such as help requests, keep them recognizable to users.

## Interaction menu (`interactions`, optional)

Adds items such as Say hello to the bottom of the menu you get by right-clicking (long-pressing) a staff member. These items **only show a reaction**; they don't touch tasks or data. The app has a default **Say hello** (`greet`) whose words and motion change with the time of day (morning, noon, evening, late night) and the staff member's status (working, troubled).

```json
"interactions": [
  {
    "id": "snack",
    "label": { "ko": "간식 주기", "en": "Give a snack" },
    "when": { "place": "lounge" },
    "reactions": [
      { "when": { "hours": [15, 17] }, "state": "celebrate", "say": ["Snack time!"], "effect": "hearts" },
      { "state": "smile", "say": ["Thank you!"] }
    ]
  },
  { "id": "greet", "hidden": true }
]
```

- An item appears in the menu only when its `when` matches. It's also hidden if none of its reactions match.
- `reactions` uses the first matching reaction from the top. `state` is the motion to play for about 2.4 seconds; `effect` is an effect.
- Effects: `sparkle`, `hearts`, `sweat`, `notes` (music notes), `confetti`, `zzz` (sleepy).
- An item with the same id as a default item replaces it, and `"hidden": true` removes it from the menu.

## Props (`props`, optional)

Place furniture piece by piece instead of baking it into the backdrop. Each prop can change its image, be swapped in a seasonal variant, and have per-state images.

```json
"props": [
  { "id": "door", "image": "assets/door.png", "x": 881, "y": 66, "spot": "door", "states": { "open": "assets/door-open.png" } },
  { "id": "sofa", "image": "assets/sofa.png", "x": 800, "y": 262 },
  { "id": "desk-1", "image": "assets/desk.png", "x": 85, "y": 232, "front": true }
]
```

- `x` and `y` are the image's top left. Props are drawn over the backdrop layers in the order listed, so list the farthest first.
- `front: true` draws it in front of the staff. Several props may share an image.
- `spot` is the place the prop stands for (`board`, `shelf`, `safe`, `archive`, `door`). The place's coordinates are still set by `scene.spots` and `scene.door`.
- If a prop with `spot: "door"` has an `open` state image, it briefly shows the open image when staff pass through the door arriving or leaving.
- Make state images the same size as the base image and overlay them at the same top left. Up to 8 per prop; switch them with `prop` in event reactions.

## Event reactions (`events`, optional)

Sets staff motions, lines and effects, and prop states, for office events. The app's default effects (stamps, coins, carrying papers) still play, and the theme's motion plays on top. `"replace": true` turns off the app's default effect for that event.

```json
"events": [
  { "on": "agent.arrived", "say": ["Good morning!"] },
  { "on": "task.completed", "when": { "role": "manager" }, "say": ["Great work, everyone!"], "effect": "confetti" },
  { "on": "review.rejected", "state": "panic", "say": ["I'll redo it…"], "replace": true },
  { "on": "value.recognized", "prop": { "id": "safe", "state": "open", "ms": 2000 } }
]
```

| Event | When | Who reacts |
|---|---|---|
| `task.created` | A task was created | Staff involved in creating it (otherwise an effect in the middle of the scene) |
| `task.completed` | A task finished | Everyone at their seats |
| `task.handed_off` | Handing off to the next step | The staff member handing off |
| `review.approved` / `review.rejected` | Review passed / sent back | The reviewer / the staff member sent back |
| `approval.requested` / `approval.denied` | User approval requested / changes requested | The staff member involved |
| `agent.help_received` | Got help | The staff member who got help |
| `value.recognized` | Profit was made | The staff member involved |
| `mail.received` / `inquiry.received` | Mail or an inquiry arrived | The staff member in charge |
| `budget.exceeded` | The budget ran out | The staff member involved |
| `cost.recorded` | A cost was incurred | The staff member involved |
| `agent.arrived` / `agent.left` | Coming in through the door / heading out | That staff member |

- With several rules for one event, each staff member uses the first rule that matches them. Staff conditions in `when` refer to the reacting staff member.
- `ms` in `prop` is how long to show that state (100–10000, default 1500).

## Walking paths (`scene.waypoints`, `scene.links`, optional)

By default, staff walk straight to their destination. Define points and links and they follow that path (aisles between desks, the spot in front of the door and so on).

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

- Staff go to the point nearest the start, follow the links along the shortest path to the point nearest the destination, then go to the destination.
- If the destination is closer than the nearest point, or the two points aren't connected, they walk straight there.
- With paths defined, the corridor (door) route between the work area and the break room isn't used. Up to 48 points and 128 links.
- `walkSpeed` is pixels per second (40–600, default 170).

## Seasonal variants (`variants`, optional)

Lets the same theme look partly different by date, weekday or time (Halloween, Christmas, Friday night…). `when` can only use `dates`, `weekdays` and `hours`, and the first matching variant from the top applies. The office screen checks every minute and redraws when the variant changes.

```json
"variants": [
  {
    "id": "halloween",
    "name": "Halloween",
    "when": { "dates": ["10-24", "10-31"] },
    "tokens": { "topbar": "#2b1a3d", "topbarInk": "#ffd9a8", "accent": "#ff7a1a" },
    "addLayers": [{ "image": "assets/cobweb.png", "x": 0, "y": 0, "front": true }],
    "props": [{ "id": "plant", "image": "assets/pumpkin.png", "x": 20, "y": 420 }],
    "wear": [{ "image": "assets/witch-hat.png", "at": "head", "y": -6 }],
    "emotes": [{ "when": { "place": "lounge" }, "icon": "🎃", "say": ["Trick or treat!"] }],
    "interactions": [{ "id": "candy", "label": "Give candy", "reactions": [{ "state": "celebrate", "effect": "confetti" }] }]
  }
]
```

| Field | How it applies |
|---|---|
| `layers` | Replaces all backdrop layers |
| `addLayers` | Added after the backdrop layers |
| `props`, `characters`, `interactions` | Same ids are replaced, new ids are added |
| `accessories` | Replaced per provider |
| `modelAccessories` | Replaced per model |
| `wear` | Worn by every staff member over the provider accessories (instead of the pixel hat) |
| `emotes`, `events`, `dress` | Read before the theme's rules |
| `tokens`, `site` | Only the values given change (site screens change during that period too) |

### Scheduled themes (company setting)

To swap the whole theme, set a period (MM-DD to MM-DD) and a theme under **Scheduled themes** at the bottom of the Themes tab (owner only). During that period, every office that follows the shared theme shows the scheduled one. Offices with their own theme stay as they are. This works together with seasonal variants inside a theme.

## Limits

| Item | Limit |
|---|---|
| Zip size | 20MB |
| Number of files | 300 |
| Image side | 4096px |
| Image formats | PNG, WebP (file contents are checked too) |
| Fonts | WOFF2, 4MB per file |
| CSS size | 64KB |
| Characters | 16 |
| Backdrop layers | 32 |
| Frames per motion | 32 |
| Provider accessories | 16 companies, 8 layers per company and tier |
| Office props | 32, 8 state images per prop |
| Head icons / event reactions | 64 each |
| Interaction menu | 16 items, 16 reactions per item |
| Walking paths | 48 points, 128 links |
| Outfits / outfit rules | 16 per character / 32 |
| Seasonal variants | 12 |
| Scheduled themes | 12 |

On install, files `theme.json` doesn't use, other than LICENSE and CREDITS, are dropped.

## Custom CSS rules

The server rewrites your CSS on install.

- Every rule applies only **inside offices that use the theme**. `:root`, `html` and `body` are changed to mean the office area.
- Removed: `@import`, `url()` pointing outside the package (external addresses and `data:` included), `image-set()`, `expression()`, `javascript:`, `position: fixed`.
- `z-index` is capped at 100.
- Selectors targeting the approval, sharing, modal, billing and key screens (`.approval*`, `.share*`, `.modal*`, `.billing*`, `.key*`, `.login*`) are dropped.
- `@media`, `@supports`, `@keyframes`, `@container` and `@font-face` (fonts inside the package only) are allowed.

## Making art with local AI

With a local image AI (for example ComfyUI with an SDXL-family anime model), you can make characters and backdrops on your own.

- **Works well**: character design, expression portraits, still poses such as standing, sitting and celebrating, backdrops and props.
- **Hard**: continuous frames such as walking. Clothing folds and hair change from frame to frame and look jittery. Cut down to 2–3 frames and let the app's added movement do the rest.
- **Keeping the same character**: using a reference image (IP-Adapter) together with a pose skeleton (OpenPose) keeps the character looking like the same person across poses. To change only the expression, editing just the face with an image-editing model is more stable.
- **Background removal**: characters must be transparent PNGs. Use a background-removal node (BiRefNet, rembg etc.).
- **License**: check that the license of the models you used allows sharing the results, and write the model names in `CREDITS.txt`.

### The generation pipeline in the repository

The official sample theme "Illustrated office" was made this way. A single recipe draws the backdrop, props, characters, expression portraits and provider accessories, and builds the theme zip.

1. Download and unpack [ComfyUI](https://github.com/Comfy-Org/ComfyUI) Windows portable (NVIDIA), and put a checkpoint (e.g. `animagine-xl-4.0.safetensors`) in `ComfyUI/models/checkpoints`. For SDXL, 8GB of VRAM or more is recommended.
2. Install the background-removal packages into ComfyUI's embedded Python: `python_embeded\python.exe -m pip install rembg onnxruntime`
3. Start ComfyUI: `python_embeded\python.exe -s ComfyUI\main.py --listen 127.0.0.1 --port 8188`
4. Build the theme from a recipe at the repository root:
   ```
   <ComfyUI>\python_embeded\python.exe scripts/art/make_theme.py art/themes/illust-office/art.json
   ```
5. When `art/build/<id>.zip` appears, install it on the app's Themes tab.

In the recipe (`art/themes/<id>/art.json`), each character gets a look (`look`) and a seed, and poses and expressions are shared by all characters. Using the same seed and look description keeps them looking like the same person across poses. Results are saved in `art/build/<id>/raw`, so a rerun draws only what changed. To redraw an image you don't like, change its seed in the recipe or use `--redo <key>` (e.g. `--redo mina-idle`).

Furniture in the recipe (`props`) is exported as individual props, leaving only the walls and floor in the backdrop layer. Give the door `"door": true` and `"states": { "open": { "swing": true } }` and an open-door image is made from the closed one (image models are bad at drawing matching open doors). `emotes`, `interactions`, `events`, `dress` and `paths` (`waypoints`, `links`, `walkSpeed`) go into the package as-is, and `props` and `wear` in `variants` are drawn and added.

- **Stage style**: in `room.stage`, `wallStyle` is `stripes` (wood-panel wallpaper), `glass` (glass partitions) or `panels` (metal panels with light strips), and `floorStyle` is `boards` (wooden floor), `carpet` (carpet tiles) or `grid` (glowing grid). They can be set per area (`areas`); `panels` and `grid` use `colors.glow` as the light color.
- **Outfits**: give a character `"outfits": [{ "id", "name", "look" }]` and it's redrawn with the same seed in different clothes, producing outfit sheets with the same frame layout.
- **Splitting parts**: give a character `"split": { "head": 0.46, "legs": 0.76 }` (ratios of the image height from the top of the head) and the sheet is cut into leg (`sheet`), body and head layers.
- **Seeds per pose**: if only one pose looks wrong, change just that pose's seed with `"poseSeeds": { "back": 8121 }` (works for outfits too). Views from behind break often, so always check the `back` frames after a build.
- **Background color**: pale hair such as silver tends to fade and vanish in back views on a white background. Give a character `"background": "dark gray background"` to draw that character's poses on a plain gray background (the background is cut away).

The "Corporate office" (`corp-office`) and "SF office" (`sf-office`) recipes in the same repository are examples of these features.

## License

The `license` field is required. A theme is its creator's work and separate from the app's license (AGPL-3.0). When you use someone else's images, follow their license and credit the source in `CREDITS.txt`.
