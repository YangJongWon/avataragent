import { Application, Container, Graphics, Sprite, Text, type FederatedPointerEvent } from 'pixi.js';
import { TEAMS, type TeamMeta } from '../../../shared/teams.ts';
import { currentStepLabel, planProgress } from '../../../shared/workflow.ts';
import { type Agent, type OfficeEvent, type Role, type Skin, type Snapshot, type TeamId } from '../../../shared/types.ts';
import { krw } from '../format.ts';
import { companyOf, modelOf, type HatShape, type Tier } from '../../../shared/models.ts';
import { drawBody, drawFace, drawHat, drawHatGlow, HAT_TOP, S } from './pixelArt.ts';
import { loadPinkGirl, type SpriteSkin } from './skinSprites.ts';

export const SCENE_W = 1000;
export const SCENE_H = 480;

const FONT = '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

const DESK: Record<Role, { x: number; y: number }> = {
  manager: { x: 400, y: 190 },
  researcher: { x: 180, y: 300 },
  writer: { x: 400, y: 395 },
  reviewer: { x: 620, y: 300 },
};

const BOARD = { x: 260, y: 14, w: 280, h: 86 };
const SHELF = { x: 690, y: 22, w: 80, h: 92 };
const SAFE = { x: 700, y: 392, w: 70, h: 62 };
const ARCHIVE = { x: 30, y: 404, w: 64, h: 44 };

const OFFICE_W = 800;
const LOUNGE_X = 810;
const DOOR = { x: 805, y: 248 };
const LOUNGE: Record<Role, Point> = {
  manager: { x: 862, y: 342 },
  researcher: { x: 942, y: 342 },
  writer: { x: 940, y: 162 },
  reviewer: { x: 864, y: 162 },
};

const WORK_GLYPH: Record<Role, string> = { manager: '📋', researcher: '🔍', writer: '✏️', reviewer: '🧐' };
const LOUNGE_GLYPH: Record<Role, string> = { manager: '☕', researcher: '📖', writer: '💧', reviewer: '☕' };

export interface SceneCallbacks {
  onAgentClick: (agentId: string) => void;
  onAgentContextMenu: (agentId: string) => void;
  onBoardClick: () => void;
}

interface Point {
  x: number;
  y: number;
}

interface Walk extends Point {
  done: () => void;
}

const homeOf = (role: Role): Point => ({ x: DESK[role].x, y: DESK[role].y + 4 });
const LONG_PRESS_MS = 500;

type Place = 'desk' | 'lounge';

class CharacterView {
  root = new Container();
  sprite = new Container();
  body = new Graphics();
  face = new Graphics();
  hat = new Graphics();
  glow = new Graphics();
  sparkles = new Graphics();
  icon = new Container();
  iconBg = new Graphics();
  iconText: Text;
  label: Text;
  labelBg = new Graphics();
  roleTag = new Container();
  roleBg = new Graphics();
  roleText: Text;
  iconY = -40 * S;
  pos: Point;
  walks: Walk[] = [];
  phase = Math.random() * 10;
  expression: Agent['expression'] | null = null;
  status: Agent['status'] = 'idle';
  modelId: string | null = null;
  hatShape: HatShape = 'beanie';
  skin: Skin | null = null;
  tier: Tier = 1;
  hatOffset = 0;
  place: Place;
  girl: Sprite | null = null;

  constructor(
    public agent: Agent,
    callbacks: SceneCallbacks,
    roleTitle: string,
    startInLounge: boolean,
    private pinkGirl: SpriteSkin | null,
  ) {
    this.place = startInLounge ? 'lounge' : 'desk';
    this.pos = startInLounge ? { ...LOUNGE[agent.role] } : homeOf(agent.role);
    if (pinkGirl) {
      this.girl = new Sprite(pinkGirl.idle);
      this.girl.anchor.set(0.5, 1);
      this.girl.scale.set(pinkGirl.scale);
      this.girl.visible = false;
    }
    this.sprite.addChild(this.glow, this.body, this.face);
    if (this.girl) this.sprite.addChild(this.girl);
    this.sprite.addChild(this.hat, this.sparkles);
    this.root.addChild(this.sprite);

    this.roleText = new Text({ text: roleTitle, style: { fontFamily: FONT, fontSize: 11, fontWeight: 'bold', fill: '#3d3449' } });
    this.roleText.anchor.set(0.5);
    this.roleBg
      .roundRect(-this.roleText.width / 2 - 5, -this.roleText.height / 2 - 2, this.roleText.width + 10, this.roleText.height + 4, 3)
      .fill({ color: '#fffaf0', alpha: 0.92 })
      .stroke({ width: 1.5, color: '#3d3449' });
    this.roleTag.addChild(this.roleBg, this.roleText);
    this.root.addChild(this.roleTag);

    this.iconText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 16, fontWeight: 'bold', fill: '#ffffff' } });
    this.iconText.anchor.set(0.5);
    this.icon.addChild(this.iconBg, this.iconText);
    this.root.addChild(this.icon);

    this.label = new Text({ text: '', style: { fontFamily: FONT, fontSize: 12, fontWeight: 'bold', fill: '#ffffff' } });
    this.label.anchor.set(0.5, 0);
    this.label.y = 8;
    this.root.addChild(this.labelBg, this.label);

    this.root.eventMode = 'static';
    this.root.cursor = 'pointer';
    this.root.hitArea = { contains: (x: number, y: number) => x > -10 * S && x < 10 * S && y > -34 * S && y < 24 };
    let pressTimer: ReturnType<typeof setTimeout> | undefined;
    let longPressed = false;
    const cancelPress = () => clearTimeout(pressTimer);
    this.root.on('pointerdown', (e: FederatedPointerEvent) => {
      longPressed = false;
      if (e.pointerType !== 'touch') return;
      pressTimer = setTimeout(() => {
        longPressed = true;
        callbacks.onAgentContextMenu(this.agent.id);
      }, LONG_PRESS_MS);
    });
    this.root.on('pointerup', cancelPress);
    this.root.on('pointerupoutside', cancelPress);
    this.root.on('pointerleave', cancelPress);
    this.root.on('pointercancel', cancelPress);
    this.root.on('pointertap', (e: FederatedPointerEvent) => {
      if (e.button === 0 && !longPressed) callbacks.onAgentClick(this.agent.id);
    });
    this.root.on('rightclick', () => callbacks.onAgentContextMenu(this.agent.id));
    this.apply(agent);
  }

  apply(agent: Agent) {
    this.agent = agent;
    const skinChanged = agent.skin !== this.skin;
    if (skinChanged) {
      this.skin = agent.skin;
      const useSprite = agent.skin === 'pinkgirl' && this.girl !== null;
      const drawn = agent.skin === 'pinkgirl' && !useSprite ? 'bishoujo' : agent.skin;
      drawBody(this.body, agent.role, drawn);
      if (this.girl) this.girl.visible = useSprite;
      this.hatOffset = useSprite ? 2 * S : 0;
      this.hat.y = this.glow.y = this.sparkles.y = this.hatOffset;
      this.expression = null;
    }
    if (agent.expression !== this.expression) {
      this.expression = agent.expression;
      const drawn = agent.skin === 'pinkgirl' && !this.girl ? 'bishoujo' : agent.skin;
      drawFace(this.face, agent.role, agent.expression, drawn);
    }
    const model = modelOf(agent.model);
    const company = companyOf(model.vendor);
    const hatKey = `${company.hat}:${company.color}:${model.tier}`;
    if (hatKey !== this.modelId || skinChanged) {
      this.modelId = hatKey;
      this.tier = model.tier;
      this.hatShape = company.hat;
      drawHat(this.hat, company.hat, company.color, model.tier);
      if (model.tier === 3) drawHatGlow(this.glow, company.hat);
      else this.glow.clear();
      this.sparkles.clear();
      const tagY = (HAT_TOP[company.hat] - (model.tier === 3 ? 9 : 6)) * S + this.hatOffset;
      this.roleTag.y = tagY;
      this.iconY = tagY - 22;
    }
    this.status = agent.status;
    this.label.text = agent.name;
    this.labelBg.clear();
    this.labelBg
      .roundRect(-this.label.width / 2 - 5, 6, this.label.width + 10, this.label.height + 4, 4)
      .fill({ color: '#2b2b3a', alpha: 0.75 });
    this.root.alpha = agent.paused ? 0.55 : 1;
    this.updateIcon();
  }

  setPlace(place: Place) {
    if (place === this.place) return;
    this.place = place;
    void this.walkTo(DOOR);
    void this.walkTo(place === 'lounge' ? LOUNGE[this.agent.role] : homeOf(this.agent.role));
  }

  private updateIcon() {
    const { status, expression, role } = this.agent;
    let text = '';
    let bg: string | null = null;
    if (status === 'help_requested') [text, bg] = ['?', '#f39c12'];
    else if (status === 'awaiting_approval') [text, bg] = ['!', '#3498db'];
    else if (status === 'error') [text, bg] = ['!', '#e74c3c'];
    else if (status === 'paused') [text, bg] = ['II', '#7f8c8d'];
    else if (expression === 'celebrate') text = '⭐';
    else if (expression === 'thanks') text = '💗';
    else if (status === 'working') text = WORK_GLYPH[role];
    else if (this.place === 'lounge' && this.walks.length === 0) text = LOUNGE_GLYPH[role];

    this.iconText.text = text;
    this.iconBg.clear();
    if (bg) {
      this.iconBg.circle(0, 0, 12).fill(bg).stroke({ width: 2, color: '#ffffff' });
      this.iconText.style.fontSize = 16;
    } else {
      this.iconText.style.fontSize = 18;
    }
  }

  walkTo(target: Point) {
    if (this.walks.length >= 3) {
      for (const w of this.walks) w.done();
      this.walks = [];
      this.pos = { ...target };
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.walks.push({ ...target, done: resolve }));
  }

  update(dt: number) {
    this.phase += dt / 1000;
    const walk = this.walks[0];
    let offsetY = 0;
    let rotation = 0;

    if (walk) {
      const dx = walk.x - this.pos.x;
      const dy = walk.y - this.pos.y;
      const dist = Math.hypot(dx, dy);
      const step = (170 * dt) / 1000;
      if (dist <= step) {
        this.pos = { x: walk.x, y: walk.y };
        this.walks.shift();
        walk.done();
        if (this.walks.length === 0) this.updateIcon();
      } else {
        this.pos.x += (dx / dist) * step;
        this.pos.y += (dy / dist) * step;
        this.sprite.scale.x = dx < -1 ? -1 : dx > 1 ? 1 : this.sprite.scale.x;
      }
      offsetY = -Math.abs(Math.sin(this.phase * 12)) * 4;
    } else if (this.status === 'working') {
      offsetY = Math.sin(this.phase * 22) * 1;
      this.sprite.scale.x = 1;
    } else if (this.status === 'help_requested') {
      rotation = Math.sin(this.phase * 5) * 0.06;
      offsetY = -Math.abs(Math.sin(this.phase * 3)) * 3;
    } else if (this.expression === 'celebrate') {
      offsetY = -Math.abs(Math.sin(this.phase * 8)) * 8;
    } else if (this.place === 'lounge') {
      offsetY = Math.sin(this.phase * 1.5) * 0.8;
    } else {
      offsetY = Math.sin(this.phase * 2.5) * 1.2;
      this.sprite.scale.x = 1;
    }

    if (this.tier === 3) this.updateAura();
    if (this.girl?.visible && this.pinkGirl) {
      this.girl.texture = walk ? this.pinkGirl.walk[Math.floor(this.phase * 8) % this.pinkGirl.walk.length] : this.pinkGirl.idle;
    }

    this.root.position.set(Math.round(this.pos.x), Math.round(this.pos.y));
    this.sprite.y = offsetY;
    this.sprite.rotation = rotation;
    this.roleTag.y = this.iconY + 22;
    this.icon.y = this.iconY + Math.sin(this.phase * 4) * 2;
  }

  private updateAura() {
    this.glow.alpha = 0.55 + Math.sin(this.phase * 3) * 0.35;
    const cy = (HAT_TOP[this.hatShape] - 22) * 0.5 * S;
    this.sparkles.clear();
    for (let i = 0; i < 3; i++) {
      const a = this.phase * 1.8 + (i * Math.PI * 2) / 3;
      const twinkle = (Math.sin(this.phase * 6 + i * 2) + 1) / 2;
      const size = 1.5 + twinkle * 2;
      this.sparkles.star(Math.cos(a) * 11 * S, cy + Math.sin(a) * 4 * S, 4, size + 1.5, size * 0.4).fill({ color: '#fff7b0', alpha: 0.4 + twinkle * 0.6 });
    }
  }
}

interface Fx {
  elapsed: number;
  duration: number;
  step: (t: number) => void;
  done?: () => void;
}

export class OfficeScene {
  private app = new Application();
  private ready = false;
  private destroyed = false;
  private pinkGirl: SpriteSkin | null = null;
  private chars = new Map<string, CharacterView>();
  private roleOf = new Map<string, Role>();
  private charLayer = new Container();
  private deskLayer = new Container();
  private fxLayer = new Container();
  private fxs: Fx[] = [];
  private boardTitle!: Text;
  private boardLines!: Text;
  private postIt = new Graphics();
  private safeText!: Text;
  private pending: Snapshot | null = null;

  private team: TeamMeta;

  constructor(
    private callbacks: SceneCallbacks,
    private officeId: string,
    team: TeamId,
  ) {
    this.team = TEAMS[team];
  }

  async init(host: HTMLElement) {
    await this.app.init({
      width: SCENE_W,
      height: SCENE_H,
      background: this.team.wall,
      antialias: false,
      resolution: Math.max(2, window.devicePixelRatio || 1),
      autoDensity: true,
    });
    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }
    const canvas = this.app.canvas;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.display = 'block';
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.app.renderer.events.autoPreventDefault = false;
    canvas.style.touchAction = 'manipulation';
    canvas.style.setProperty('-webkit-touch-callout', 'none');
    canvas.style.userSelect = 'none';
    host.appendChild(canvas);

    this.pinkGirl = await loadPinkGirl();
    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }
    this.buildRoom();
    this.app.stage.addChild(this.charLayer, this.deskLayer, this.fxLayer);
    this.buildDesks();
    this.app.ticker.add((ticker) => this.update(ticker.deltaMS));
    this.ready = true;
    if (this.pending) this.applySnapshot(this.pending);
  }

  destroy() {
    this.destroyed = true;
    if (this.ready) this.app.destroy(true, { children: true });
  }

  anchorOf(agentId: string): Point | null {
    const c = this.chars.get(agentId);
    if (!c) return null;
    return { x: c.pos.x, y: c.pos.y + c.iconY - 14 };
  }

  applySnapshot(snapshot: Snapshot) {
    if (!this.ready) {
      this.pending = snapshot;
      return;
    }
    const office = snapshot.offices.find((o) => o.id === this.officeId);
    const officeBusy = snapshot.tasks.some(
      (t) => t.officeId === this.officeId && ['running', 'awaiting_help', 'awaiting_approval'].includes(t.status),
    );
    for (const agent of snapshot.agents) {
      this.roleOf.set(agent.id, agent.role);
      const resting = !officeBusy && agent.status === 'idle' && agent.expression !== 'celebrate';
      const existing = this.chars.get(agent.id);
      if (existing) {
        existing.apply(agent);
        existing.setPlace(resting ? 'lounge' : 'desk');
      } else {
        const view = new CharacterView(agent, this.callbacks, this.team.roleTitles[agent.role], resting, this.pinkGirl);
        this.chars.set(agent.id, view);
        this.charLayer.addChild(view.root);
      }
    }
    this.updateBoard(snapshot);
    const profit = office ? office.valueKrw - office.spentKrw : 0;
    this.safeText.text = `이익 ${profit >= 0 ? '+' : ''}${krw(profit)}`;
    this.safeText.style.fill = profit >= 0 ? '#1e8449' : '#c0392b';
  }

  handleEvent(event: OfficeEvent) {
    if (!this.ready) return;
    const p = event.payload as Record<string, unknown>;
    const deskOf = (id: unknown) => {
      const c = this.chars.get(String(id));
      if (c) return { x: c.pos.x, y: c.pos.y - 24 };
      const role = this.roleOf.get(String(id));
      return role ? { x: DESK[role].x, y: DESK[role].y - 20 } : null;
    };
    const agentChar = event.agentId ? this.chars.get(event.agentId) : undefined;
    const boardSpot = { x: BOARD.x + BOARD.w / 2, y: BOARD.y + BOARD.h + 30 };

    switch (event.type) {
      case 'task.created':
        if (p.queued) this.floatText(`대기열 +1: ${String(p.title ?? '')}`, BOARD.x + BOARD.w / 2, BOARD.y + BOARD.h + 16, '#4b3f80', 13);
        break;
      case 'queue.started': {
        const manager = [...this.chars.values()].find((c) => c.agent.role === 'manager');
        if (manager) {
          manager.setPlace('desk');
          void manager.walkTo(boardSpot).then(() => {
            this.paperFly({ x: boardSpot.x, y: BOARD.y + 40 }, { x: manager.pos.x, y: manager.pos.y - 40 }, '#ffe066');
            return manager.walkTo(homeOf('manager'));
          });
        }
        break;
      }
      case 'task.handed_off': {
        const from = deskOf(p.from);
        const to = deskOf(p.to);
        if (from && to) this.paperFly(from, to, '#ffffff');
        break;
      }
      case 'tool.started':
        if (agentChar && p.tool === 'research') void agentChar.walkTo({ x: SHELF.x + 10, y: SHELF.y + SHELF.h + 40 });
        break;
      case 'tool.completed':
        if (agentChar && agentChar.place === 'desk') void agentChar.walkTo(homeOf(agentChar.agent.role));
        break;
      case 'cost.recorded':
        if (agentChar) {
          const amount = Number(p.amountKrw ?? 0);
          this.floatText(`-${krw(amount)}`, agentChar.pos.x + 26, agentChar.pos.y - 60, '#c0392b', 12);
        }
        break;
      case 'review.rejected': {
        const at = deskOf(event.agentId);
        const to = deskOf(p.returnTo);
        if (at) this.stamp('반려', at, '#c0392b');
        if (at && to) setTimeout(() => this.paperFly(at, to, '#ffd6d6'), 700);
        break;
      }
      case 'review.approved': {
        const at = deskOf(event.agentId);
        if (at) this.stamp('통과', at, '#1e8449');
        break;
      }
      case 'approval.requested': {
        const reviewer = [...this.roleOf.entries()].find(([, r]) => r === 'reviewer')?.[0];
        const from = deskOf(reviewer);
        const to = deskOf(event.agentId);
        if (from && to) this.paperFly(from, to, '#d6eaff');
        break;
      }
      case 'approval.denied': {
        const at = deskOf(event.agentId);
        if (at) this.stamp('수정 요청', at, '#d35400');
        break;
      }
      case 'agent.help_received':
        if (agentChar) this.floatText('고마워요!', agentChar.pos.x, agentChar.pos.y - 120, '#e75480', 14);
        break;
      case 'value.recognized': {
        const from = deskOf(event.agentId) ?? { x: 400, y: 200 };
        const to = { x: SAFE.x + SAFE.w / 2, y: SAFE.y + 20 };
        for (let i = 0; i < 5; i++) setTimeout(() => this.coinFly(from, to), i * 140);
        setTimeout(
          () => this.floatText(`+${krw(Number(p.amountKrw ?? 0))}`, to.x - 10, SAFE.y - 30, '#1e8449', 16),
          900,
        );
        break;
      }
      case 'mail.received':
      case 'inquiry.received': {
        const to = deskOf(event.agentId);
        if (to) this.paperFly({ x: 48, y: 90 }, to, event.type === 'mail.received' ? '#fff3c4' : '#d5f5e3');
        if (agentChar) this.floatText(event.type === 'mail.received' ? '새 메일!' : '새 문의!', agentChar.pos.x, agentChar.pos.y - 120, '#2471a3', 13);
        break;
      }
      case 'team.applied':
        this.floatText(String(p.summary ?? ''), 400, ARCHIVE.y - 20, '#6c3483', 13);
        break;
      case 'task.completed': {
        const manager = [...this.roleOf.entries()].find(([, r]) => r === 'manager')?.[0];
        const from = deskOf(manager);
        if (from) this.paperFly(from, { x: ARCHIVE.x + ARCHIVE.w / 2, y: ARCHIVE.y + 10 }, '#b9f6ca');
        for (const c of this.chars.values()) this.sparkle(c.pos.x, c.pos.y - 70);
        break;
      }
    }
  }

  private updateBoard(snapshot: Snapshot) {
    const isActive = (t: Snapshot['tasks'][number]) => ['running', 'awaiting_help', 'awaiting_approval'].includes(t.status);
    const queued = snapshot.tasks.filter((t) => t.status === 'queued').length;
    const task = snapshot.tasks.find(isActive) ?? snapshot.tasks.find((t) => t.status !== 'queued') ?? snapshot.tasks[0];
    const active = task && isActive(task);
    const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
    this.postIt.visible = Boolean(active);

    if (!task) {
      this.boardTitle.text = `${this.team.emoji} ${this.team.name} 칠판`;
      this.boardLines.text = '여기를 눌러 첫 업무를 등록하세요';
      return;
    }
    const { done, total } = planProgress(task);
    const statusLine =
      task.status === 'awaiting_help'
        ? '도움 요청 1건 - 직원을 눌러 도와주세요'
        : task.status === 'awaiting_approval'
          ? '승인 대기 1건 - 오른쪽에서 승인'
          : task.status === 'completed'
            ? '완료! 칠판을 눌러 새 업무 등록'
            : task.status === 'failed'
              ? '중단됨 - 칠판을 눌러 다시 등록'
              : `진행 중: ${currentStepLabel(task)}`;
    this.boardTitle.text = `목표: ${clip(task.title, 16)}`;
    this.boardLines.text = `진행률 ${done}/${total}${queued ? ` · 대기 ${queued}건` : ''}\n${task.status === 'queued' ? '곧 시작해요' : statusLine}`;
  }

  private buildRoom() {
    const g = new Graphics();
    for (let y = 120; y < SCENE_H; y += 32) {
      for (let x = 0; x < OFFICE_W; x += 32) {
        g.rect(x, y, 32, 32).fill(((x + y) / 32) % 2 === 0 ? this.team.floor[0] : this.team.floor[1]);
      }
    }
    g.rect(0, 0, SCENE_W, 120).fill(this.team.wall);
    g.rect(0, 112, SCENE_W, 8).fill('#a3896b');
    g.rect(0, 0, SCENE_W, 6).fill('#cbb593');

    g.rect(22, 30, 52, 82).fill('#8b5a2b');
    g.rect(28, 36, 40, 76).fill('#a86f3b');
    g.circle(60, 76, 3).fill('#f1c40f');

    g.rect(BOARD.x - 8, BOARD.y - 6, BOARD.w + 16, BOARD.h + 12).fill('#8b5a2b');
    g.rect(BOARD.x, BOARD.y, BOARD.w, BOARD.h).fill('#2f5d50');
    g.rect(BOARD.x + 20, BOARD.y + BOARD.h + 2, 50, 4).fill('#f5f5f5');

    g.rect(SHELF.x, SHELF.y, SHELF.w, SHELF.h).fill('#7a4f2a');
    const bookColors = ['#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad', '#16a085'];
    for (let row = 0; row < 3; row++) {
      const y = SHELF.y + 6 + row * 29;
      g.rect(SHELF.x + 4, y + 22, SHELF.w - 8, 3).fill('#5a3a1e');
      for (let i = 0; i < 8; i++) g.rect(SHELF.x + 6 + i * 9, y + 4, 7, 18).fill(bookColors[(i + row) % bookColors.length]);
    }

    g.rect(140, 30, 70, 54).fill('#a3896b');
    g.rect(145, 35, 60, 44).fill('#bfe3ff');
    g.rect(174, 35, 2, 44).fill('#a3896b');

    g.rect(SAFE.x, SAFE.y, SAFE.w, SAFE.h).fill('#5d6d7e');
    g.rect(SAFE.x + 5, SAFE.y + 5, SAFE.w - 10, SAFE.h - 10).fill('#85929e');
    g.circle(SAFE.x + SAFE.w / 2, SAFE.y + SAFE.h / 2, 10).fill('#d5d8dc').stroke({ width: 2, color: '#34495e' });

    g.rect(ARCHIVE.x, ARCHIVE.y, ARCHIVE.w, ARCHIVE.h).fill('#b9770e');
    g.rect(ARCHIVE.x + 4, ARCHIVE.y + 4, ARCHIVE.w - 8, 10).fill('#f5cba7');

    for (const [x, y] of [
      [110, 108],
      [620, 108],
    ]) {
      g.rect(x - 8, y - 4, 16, 14).fill('#a04000');
      g.circle(x, y - 12, 12).fill('#27ae60');
      g.circle(x - 7, y - 18, 7).fill('#2ecc71');
    }
    this.drawLounge(g);
    this.app.stage.addChild(g);

    const board = new Container();
    board.eventMode = 'static';
    board.cursor = 'pointer';
    board.hitArea = { contains: (x: number, y: number) => x >= BOARD.x && x <= BOARD.x + BOARD.w && y >= BOARD.y && y <= BOARD.y + BOARD.h };
    board.on('pointertap', () => this.callbacks.onBoardClick());
    this.boardTitle = new Text({ text: '', style: { fontFamily: FONT, fontSize: 15, fontWeight: 'bold', fill: '#fdfefe' } });
    this.boardTitle.position.set(BOARD.x + 14, BOARD.y + 10);
    this.boardLines = new Text({ text: '', style: { fontFamily: FONT, fontSize: 13, fill: '#d5f5e3', lineHeight: 20 } });
    this.boardLines.position.set(BOARD.x + 14, BOARD.y + 36);
    this.postIt.rect(BOARD.x + BOARD.w - 46, BOARD.y + 10, 32, 30).fill('#ffe066');
    this.postIt.rect(BOARD.x + BOARD.w - 42, BOARD.y + 18, 24, 2).fill('#c9a227');
    this.postIt.rect(BOARD.x + BOARD.w - 42, BOARD.y + 25, 18, 2).fill('#c9a227');
    board.addChild(this.boardTitle, this.boardLines, this.postIt);
    this.app.stage.addChild(board);

    const labels: [string, number, number][] = [
      ['금고', SAFE.x + SAFE.w / 2, SAFE.y + SAFE.h + 4],
      [this.team.stepLabels.done, ARCHIVE.x + ARCHIVE.w / 2, ARCHIVE.y + ARCHIVE.h + 4],
      ['자료실', SHELF.x + SHELF.w / 2, SHELF.y + SHELF.h + 2],
    ];
    for (const [text, x, y] of labels) {
      const t = new Text({ text, style: { fontFamily: FONT, fontSize: 11, fontWeight: 'bold', fill: '#5d4037' } });
      t.anchor.set(0.5, 0);
      t.position.set(x, y);
      this.app.stage.addChild(t);
    }
    const sign = new Graphics();
    sign.roundRect(14, 10, 70, 18, 3).fill('#5d4037');
    this.app.stage.addChild(sign);
    const signText = new Text({
      text: `${this.team.emoji} ${this.team.name}`,
      style: { fontFamily: FONT, fontSize: 11, fontWeight: 'bold', fill: '#fdf2e9' },
    });
    signText.anchor.set(0.5);
    signText.position.set(49, 19);
    this.app.stage.addChild(signText);

    this.safeText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 13, fontWeight: 'bold', fill: '#1e8449' } });
    this.safeText.anchor.set(1, 1);
    this.safeText.position.set(SAFE.x + SAFE.w, SAFE.y - 4);
    this.app.stage.addChild(this.safeText);

    const loungeSign = new Graphics();
    loungeSign.roundRect(LOUNGE_X + 10, 10, 84, 20, 4).fill('#6d4c41');
    this.app.stage.addChild(loungeSign);
    const loungeText = new Text({ text: '☕ 휴게실', style: { fontFamily: FONT, fontSize: 12, fontWeight: 'bold', fill: '#fff3e0' } });
    loungeText.anchor.set(0.5);
    loungeText.position.set(LOUNGE_X + 52, 20);
    this.app.stage.addChild(loungeText);
  }

  private drawLounge(g: Graphics) {
    const right = SCENE_W;
    for (let y = 120; y < SCENE_H; y += 16) {
      g.rect(LOUNGE_X, y, right - LOUNGE_X, 16).fill((y / 16) % 2 === 0 ? '#d4a373' : '#c9965f');
      for (let x = LOUNGE_X + ((y / 16) % 2 === 0 ? 30 : 70); x < right; x += 80) g.rect(x, y, 2, 16).fill('#b5834f');
    }
    g.rect(LOUNGE_X, 0, right - LOUNGE_X, 112).fill('#fbe7c6');
    g.rect(LOUNGE_X, 72, right - LOUNGE_X, 4).fill('#e6c89c');
    g.rect(LOUNGE_X, 112, right - LOUNGE_X, 8).fill('#a3896b');

    g.rect(OFFICE_W, 0, LOUNGE_X - OFFICE_W, 120).fill('#8d7356');
    g.rect(OFFICE_W, 120, LOUNGE_X - OFFICE_W, DOOR.y - 38 - 120).fill('#a3896b');
    g.rect(OFFICE_W, DOOR.y + 32, LOUNGE_X - OFFICE_W, SCENE_H - DOOR.y - 32).fill('#a3896b');
    g.rect(OFFICE_W - 2, DOOR.y - 42, LOUNGE_X - OFFICE_W + 4, 4).fill('#6d5843');
    g.rect(OFFICE_W - 2, DOOR.y + 32, LOUNGE_X - OFFICE_W + 4, 4).fill('#6d5843');

    g.rect(912, 22, 64, 46).fill('#a3896b');
    g.rect(916, 26, 56, 38).fill('#cdeaff');
    g.rect(943, 26, 2, 38).fill('#a3896b');
    g.rect(916, 50, 56, 3).fill('#ffffff');

    g.rect(828, 82, 88, 36).fill('#8d6e63');
    g.rect(824, 78, 96, 6).fill('#6d4c41');
    g.rect(838, 50, 30, 28).fill('#455a64');
    g.rect(842, 54, 22, 8).fill('#90a4ae');
    g.rect(848, 66, 10, 3).fill('#263238');
    g.rect(849, 70, 8, 8).fill('#fdfefe');
    g.rect(878, 68, 8, 10).fill('#e57373');
    g.rect(890, 68, 8, 10).fill('#81c784');
    g.rect(830, 90, 84, 2).fill('#5d4037');

    g.rect(950, 84, 26, 34).fill('#ecf0f1');
    g.rect(952, 60, 22, 26).fill('#aee1f9');
    g.rect(955, 63, 4, 18).fill('#e8f8ff');
    g.rect(958, 96, 8, 4).fill('#3498db');

    g.ellipse(902, 404, 82, 40).fill('#e8b4b8');
    g.ellipse(902, 404, 66, 30).fill('#f2c9cc');

    g.rect(838, 292, 128, 30).fill('#5d8aa8');
    g.rect(842, 296, 58, 22).fill('#6d9bb8');
    g.rect(904, 296, 58, 22).fill('#6d9bb8');

    g.rect(818, 452, 16, 14).fill('#a04000');
    g.circle(826, 440, 13).fill('#27ae60');
    g.circle(833, 433, 7).fill('#2ecc71');
  }

  private buildDesks() {
    for (const role of Object.keys(DESK) as Role[]) {
      const { x, y } = DESK[role];
      const g = new Graphics();
      g.rect(x - 44, y - 4, 88, 10).fill('#c68642');
      g.rect(x - 44, y + 6, 88, 22).fill('#a0522d');
      g.rect(x - 40, y + 28, 6, 8).fill('#7b3f1c');
      g.rect(x + 34, y + 28, 6, 8).fill('#7b3f1c');
      g.rect(x + 22, y - 22, 20, 16).fill('#34495e');
      g.rect(x + 24, y - 20, 16, 11).fill('#85c1e9');
      g.rect(x + 30, y - 6, 4, 3).fill('#34495e');
      g.rect(x - 38, y - 8, 14, 4).fill('#fdfefe');
      this.deskLayer.addChild(g);
    }

    const lounge = new Graphics();
    lounge.rect(834, 324, 136, 22).fill('#4a7391');
    lounge.rect(838, 324, 128, 5).fill('#5d8aa8');
    lounge.rect(830, 302, 14, 44).fill('#3f6680');
    lounge.rect(960, 302, 14, 44).fill('#3f6680');
    lounge.rect(838, 346, 6, 6).fill('#2c3e50');
    lounge.rect(960, 346, 6, 6).fill('#2c3e50');

    lounge.rect(899, 422, 8, 26).fill('#8d6e63');
    lounge.ellipse(903, 448, 16, 4).fill('#6d4c41');
    lounge.ellipse(903, 420, 30, 10).fill('#d7b98e');
    lounge.ellipse(903, 418, 30, 9).fill('#e6cba2');
    lounge.rect(890, 408, 8, 9).fill('#ffffff');
    lounge.rect(898, 410, 3, 4).fill('#ffffff');
    lounge.circle(914, 414, 4).fill('#c68642');
    lounge.circle(914, 414, 1.5).fill('#6d4c41');
    this.deskLayer.addChild(lounge);
  }

  private update(dt: number) {
    for (const c of this.chars.values()) c.update(dt);
    this.charLayer.children.sort((a, b) => a.y - b.y);
    this.fxs = this.fxs.filter((fx) => {
      fx.elapsed += dt;
      const t = Math.min(1, fx.elapsed / fx.duration);
      fx.step(t);
      if (t >= 1) {
        fx.done?.();
        return false;
      }
      return true;
    });
  }

  private addFx(duration: number, step: (t: number) => void, done?: () => void) {
    this.fxs.push({ elapsed: 0, duration, step, done });
  }

  private paperFly(from: Point, to: Point, color: string) {
    const g = new Graphics();
    g.rect(-7, -9, 14, 18).fill(color).stroke({ width: 1.5, color: '#7f8c8d' });
    g.rect(-4, -5, 8, 1.5).fill('#95a5a6');
    g.rect(-4, -1, 8, 1.5).fill('#95a5a6');
    g.rect(-4, 3, 6, 1.5).fill('#95a5a6');
    this.fxLayer.addChild(g);
    this.addFx(
      1000,
      (t) => {
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        g.position.set(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e - Math.sin(Math.PI * t) * 70);
        g.rotation = Math.sin(t * Math.PI * 2) * 0.3;
      },
      () => g.destroy(),
    );
  }

  private coinFly(from: Point, to: Point) {
    const g = new Graphics();
    g.circle(0, 0, 7).fill('#f4d03f').stroke({ width: 2, color: '#b7950b' });
    g.rect(-1, -4, 2, 8).fill('#b7950b');
    this.fxLayer.addChild(g);
    this.addFx(
      1100,
      (t) => {
        g.position.set(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * 90);
        g.scale.x = Math.cos(t * Math.PI * 6);
      },
      () => g.destroy(),
    );
  }

  private floatText(text: string, x: number, y: number, color: string, size: number) {
    const t = new Text({
      text,
      style: { fontFamily: FONT, fontSize: size, fontWeight: 'bold', fill: color, stroke: { color: '#ffffff', width: 3 } },
    });
    t.anchor.set(0.5);
    this.fxLayer.addChild(t);
    this.addFx(
      1500,
      (p) => {
        t.position.set(x, y - p * 34);
        t.alpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      },
      () => t.destroy(),
    );
  }

  private stamp(text: string, at: Point, color: string) {
    const c = new Container();
    const label = new Text({ text, style: { fontFamily: FONT, fontSize: 20, fontWeight: 'bold', fill: color } });
    label.anchor.set(0.5);
    const frame = new Graphics();
    frame.roundRect(-label.width / 2 - 8, -label.height / 2 - 4, label.width + 16, label.height + 8, 6).stroke({ width: 3, color });
    c.addChild(frame, label);
    c.position.set(at.x, at.y - 30);
    c.rotation = -0.2;
    this.fxLayer.addChild(c);
    this.addFx(
      1600,
      (t) => {
        const s = t < 0.15 ? 2.2 - (t / 0.15) * 1.2 : 1;
        c.scale.set(s);
        c.alpha = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
      },
      () => c.destroy({ children: true }),
    );
  }

  private sparkle(x: number, y: number) {
    for (let i = 0; i < 6; i++) {
      const g = new Graphics();
      g.star(0, 0, 5, 6, 2.5).fill(i % 2 ? '#f4d03f' : '#ff9ff3');
      this.fxLayer.addChild(g);
      const angle = (Math.PI * 2 * i) / 6;
      this.addFx(
        1200,
        (t) => {
          g.position.set(x + Math.cos(angle) * 30 * t, y + Math.sin(angle) * 30 * t - 10 * t);
          g.alpha = 1 - t;
          g.rotation = t * 4;
        },
        () => g.destroy(),
      );
    }
  }
}
