import { Application, Container, Graphics, Text, type FederatedPointerEvent } from 'pixi.js';
import { TEAMS, type TeamMeta } from '../../../shared/teams.ts';
import { DEFAULT_THEME, type Point, type ThemeState } from '../../../shared/theme-pack.ts';
import { currentStepLabel, planProgress } from '../../../shared/workflow.ts';
import { type Agent, type OfficeEvent, type Role, type Snapshot, type StepKind, type TeamId } from '../../../shared/types.ts';
import { krw } from '../format.ts';
import { loadTheme, type CharacterArt, type Layout, type OfficeTheme } from './theme.ts';

export const SCENE_W = 1000;
export const SCENE_H = 480;

const FONT = '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

const WORK_GLYPH: Record<Role, string> = { manager: '📋', researcher: '🔍', writer: '✏️', reviewer: '🧐' };
const LOUNGE_GLYPH: Record<Role, string> = { manager: '☕', researcher: '📖', writer: '💧', reviewer: '☕' };

/** How long an event moment (a stamp, a thank-you) shows before the character goes back to its status. */
const MOMENT_MS = 2400;
const STEP_MOMENT: Record<StepKind, ThemeState | null> = {
  brief: 'step.brief',
  research: 'step.research',
  draft: 'step.draft',
  review: 'step.review',
  approval: null,
};

export interface SceneCallbacks {
  onAgentClick: (agentId: string) => void;
  onAgentContextMenu: (agentId: string) => void;
  onBoardClick: () => void;
}

interface Walk extends Point {
  done: () => void;
}

const LONG_PRESS_MS = 500;

type Place = 'desk' | 'lounge';

class CharacterView {
  root = new Container();
  sprite = new Container();
  icon = new Container();
  iconBg = new Graphics();
  iconText: Text;
  label: Text;
  labelBg = new Graphics();
  roleTag = new Container();
  roleBg = new Graphics();
  roleText: Text;
  iconY = -40;
  pos: Point;
  walks: Walk[] = [];
  phase = Math.random() * 10;
  expression: Agent['expression'] = 'normal';
  status: Agent['status'] = 'idle';
  place: Place;
  private moment: { state: ThemeState; until: number } | null = null;
  private offDuty = false;

  constructor(
    public agent: Agent,
    callbacks: SceneCallbacks,
    roleTitle: string,
    startInLounge: boolean,
    private art: CharacterArt,
    private door: Point,
    public home: Point,
    public rest: Point,
    startOffDuty = false,
  ) {
    this.place = startInLounge ? 'lounge' : 'desk';
    this.pos = startInLounge ? { ...rest } : { ...home };
    this.offDuty = startOffDuty;
    this.root.visible = !startOffDuty;
    this.sprite.addChild(art.view);
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
    this.root.hitArea = { contains: (x: number, y: number) => x > -this.art.hit.halfW && x < this.art.hit.halfW && y > -this.art.hit.h && y < 24 };
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
    this.art.apply(agent);
    this.iconY = this.art.tagY - 22;
    this.expression = agent.expression;
    this.status = agent.status;
    this.label.text = agent.name;
    this.labelBg.clear();
    this.labelBg
      .roundRect(-this.label.width / 2 - 5, 6, this.label.width + 10, this.label.height + 4, 4)
      .fill({ color: '#2b2b3a', alpha: 0.75 });
    this.root.alpha = agent.paused ? 0.55 : 1;
    this.updateIcon();
  }

  /** Plays a short event moment, such as being thanked or having work sent back. */
  play(state: ThemeState) {
    this.moment = { state, until: performance.now() + MOMENT_MS };
  }

  setPlace(place: Place) {
    if (this.offDuty) return;
    if (place === this.place) return;
    this.place = place;
    void this.walkTo(this.door);
    void this.walkTo(place === 'lounge' ? this.rest : this.home);
  }

  setOffDuty(value: boolean) {
    if (value === this.offDuty) return;
    this.offDuty = value;
    if (value) {
      void this.walkTo(this.door).then(() => { if (this.offDuty) this.root.visible = false; });
    } else {
      this.root.visible = true;
      this.pos = { ...this.door };
      void this.walkTo(this.place === 'lounge' ? this.rest : this.home);
    }
  }

  moveSeat(home: Point, rest: Point) {
    if (home.x === this.home.x && home.y === this.home.y) return;
    this.home = home;
    this.rest = rest;
    void this.walkTo(this.place === 'lounge' ? rest : home);
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

    if (this.moment && performance.now() > this.moment.until) this.moment = null;
    this.art.update(this.phase, {
      walking: Boolean(walk),
      place: this.place,
      status: this.status,
      expression: this.expression,
      moment: this.moment?.state ?? null,
    });

    this.root.position.set(Math.round(this.pos.x), Math.round(this.pos.y));
    this.sprite.y = offsetY;
    this.sprite.rotation = rotation;
    this.roleTag.y = this.iconY + 22;
    this.icon.y = this.iconY + Math.sin(this.phase * 4) * 2;
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
  private theme!: OfficeTheme;
  private layout!: Layout;
  private chars = new Map<string, CharacterView>();
  private roleOf = new Map<string, Role>();
  private charLayer = new Container();
  private deskLayer = new Container();
  private extraDesks: Container[] = [];
  private fxLayer = new Container();
  private fxs: Fx[] = [];
  private boardTitle!: Text;
  private boardLines!: Text;
  private postIt = new Graphics();
  private safeText!: Text;
  private pending: Snapshot | null = null;
  private tasks: Snapshot['tasks'] = [];

  private team: TeamMeta;

  constructor(
    private callbacks: SceneCallbacks,
    private officeId: string,
    team: TeamId,
    private themeId: string = DEFAULT_THEME,
  ) {
    this.team = TEAMS[team];
  }

  async init(host: HTMLElement) {
    this.theme = await loadTheme(this.themeId);
    this.layout = this.theme.layout;
    if (this.destroyed) return;
    await this.app.init({
      width: SCENE_W,
      height: SCENE_H,
      background: this.theme.background(this.team),
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

    const room = this.theme.buildRoom(this.team);
    this.app.stage.addChild(room.back);
    this.buildOverlay();
    this.deskLayer.addChild(room.front, ...room.extraDesks);
    this.extraDesks = room.extraDesks;
    this.app.stage.addChild(this.charLayer, this.deskLayer, this.fxLayer);
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
    this.tasks = snapshot.tasks;
    // While the task waits on the user, only the agent who is waiting stays at the desk.
    const officeBusy = snapshot.tasks.some((t) => t.officeId === this.officeId && t.status === 'running');
    const present = new Set(snapshot.agents.map((a) => a.id));
    for (const [id, view] of this.chars) {
      if (present.has(id)) continue;
      view.root.destroy({ children: true });
      this.chars.delete(id);
    }
    const seated = new Set<Role>();
    let extra = 0;
    for (const agent of snapshot.agents) {
      this.roleOf.set(agent.id, agent.role);
      let home: Point;
      let rest: Point;
      if (!seated.has(agent.role)) {
        seated.add(agent.role);
        home = this.layout.seats[agent.role];
        rest = this.layout.lounge[agent.role];
      } else {
        const i = Math.min(extra++, this.layout.extraSeats.length - 1);
        home = this.layout.extraSeats[i];
        rest = this.layout.extraLounge[i];
      }
      const resting = !officeBusy && agent.status === 'idle' && agent.expression !== 'celebrate';
      const offDuty = agent.status === 'off_duty' || agent.status === 'capacity_exhausted';
      const existing = this.chars.get(agent.id);
      if (existing) {
        existing.apply(agent);
        existing.moveSeat(home, rest);
        existing.setOffDuty(offDuty);
        existing.setPlace(resting ? 'lounge' : 'desk');
      } else {
        const art = this.theme.createCharacter();
        const view = new CharacterView(agent, this.callbacks, this.team.roleTitles[agent.role], resting, art, this.layout.door, home, rest, offDuty);
        this.chars.set(agent.id, view);
        this.charLayer.addChild(view.root);
      }
    }
    this.extraDesks.forEach((g, i) => (g.visible = i < extra));
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
      return role ? { x: this.layout.seats[role].x, y: this.layout.seats[role].y - 24 } : null;
    };
    const agentChar = event.agentId ? this.chars.get(event.agentId) : undefined;
    const { board: BOARD, shelf: SHELF, safe: SAFE, archive: ARCHIVE } = this.layout.spots;
    const boardSpot = { x: BOARD.x + BOARD.w / 2, y: BOARD.y + BOARD.h + 30 };

    switch (event.type) {
      case 'task.assigned': {
        const kind = this.tasks.find((t) => t.id === event.taskId)?.plan.find((s) => s.id === p.step)?.kind;
        const moment = kind ? STEP_MOMENT[kind] : null;
        if (agentChar && moment) agentChar.play(moment);
        break;
      }
      case 'budget.exceeded':
        agentChar?.play('budget.exceeded');
        break;
      case 'task.created':
        if (p.queued) this.floatText(`대기열 +1: ${String(p.title ?? '')}`, BOARD.x + BOARD.w / 2, BOARD.y + BOARD.h + 16, '#4b3f80', 13);
        break;
      case 'queue.started': {
        const manager = [...this.chars.values()].find((c) => c.agent.role === 'manager');
        if (manager) {
          manager.setPlace('desk');
          void manager.walkTo(boardSpot).then(() => {
            this.paperFly({ x: boardSpot.x, y: BOARD.y + 40 }, { x: manager.pos.x, y: manager.pos.y - 40 }, '#ffe066');
            return manager.walkTo(manager.home);
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
        if (agentChar && agentChar.place === 'desk') void agentChar.walkTo(agentChar.home);
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
        if (p.returnTo) this.chars.get(String(p.returnTo))?.play('review.rejected');
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
        agentChar?.play('troubled');
        break;
      }
      case 'agent.help_received':
        if (agentChar) this.floatText('고마워요!', agentChar.pos.x, agentChar.pos.y - 120, '#e75480', 14);
        agentChar?.play('thanks');
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
        for (const c of this.chars.values()) {
          this.sparkle(c.pos.x, c.pos.y - 70);
          c.play('task.approved');
        }
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

  /** Board text, its click area and the profit figure: shared by every theme, placed by its layout. */
  private buildOverlay() {
    const { board: BOARD, safe: SAFE } = this.layout.spots;
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

    this.safeText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 13, fontWeight: 'bold', fill: '#1e8449' } });
    this.safeText.anchor.set(1, 1);
    this.safeText.position.set(SAFE.x + SAFE.w, SAFE.y - 4);
    this.app.stage.addChild(this.safeText);
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
