import { Application, Container, Graphics, Sprite, Text, type FederatedPointerEvent, type Texture } from 'pixi.js';
import { currentLanguage, t, tpl } from '../../../shared/i18n.ts';
import { TEAMS, type TeamMeta } from '../../../shared/teams.ts';
import { DEFAULT_EMOTES, DEFAULT_INTERACTIONS } from '../../../shared/theme-defaults.ts';
import {
  DEFAULT_THEME,
  type DressRule,
  type EffectName,
  type EmoteRule,
  type EventRule,
  type IconSpec,
  type Interaction,
  type Point,
  type Reaction,
  THEME_EVENTS,
  type ThemeEvent,
  type ThemeState,
} from '../../../shared/theme-pack.ts';
import { findRoute, firstMatch, localText, matches, pickOne, type LocalText, type RuleContext } from '../../../shared/theme-rules.ts';
import { currentStepLabel, planProgress } from '../../../shared/workflow.ts';
import { type Agent, type OfficeEvent, type Role, type Snapshot, type StepKind, type TeamId } from '../../../shared/types.ts';
import { krw } from '../format.ts';
import { loadTheme, type CharacterArt, type Layout, type OfficeTheme, type PropArt } from './theme.ts';

export const SCENE_W = 1000;
export const SCENE_H = 480;

const FONT = '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

/** How long a line stays in a speech bubble. */
const SAY_MS = 3200;
/** How long a door stays open for someone walking through. */
const DOOR_MS = 1400;

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
  /** The theme's dated variant changed (Halloween began): the office should load the theme again. */
  onThemeStale?: () => void;
}

/** A leg of a walk; only the last leg of a trip resolves it. */
interface Walk extends Point {
  done?: () => void;
}

/** What every character shares from the scene. */
interface CharacterEnv {
  door: Point;
  passage: Point | null;
  speed: number;
  team: TeamId;
  emotes: EmoteRule[];
  dress: DressRule[];
  route(from: Point, to: Point): Point[];
  texture(path: string): Texture | undefined;
  /** Someone sets off for home or walks in; theme rules may have them say something. */
  onDoor(view: CharacterView, kind: 'agent.arrived' | 'agent.left'): void;
  /** Shows the door prop open for a moment, if the theme drew one. */
  openDoor(): void;
}

const say = (lines: LocalText[] | undefined) => {
  const line = lines && pickOne(lines);
  return line ? localText(line, currentLanguage()) : '';
};

const LONG_PRESS_MS = 500;

type Place = 'desk' | 'lounge';

/** A sheet of paper; staff carry these to each other instead of throwing them. */
function paper(color: string) {
  const g = new Graphics();
  g.rect(-7, -9, 14, 18).fill(color).stroke({ width: 1.5, color: '#7f8c8d' });
  g.rect(-4, -5, 8, 1.5).fill('#95a5a6');
  g.rect(-4, -1, 8, 1.5).fill('#95a5a6');
  g.rect(-4, 3, 6, 1.5).fill('#95a5a6');
  return g;
}

class CharacterView {
  root = new Container();
  sprite = new Container();
  icon = new Container();
  iconBg = new Graphics();
  iconText: Text;
  iconImage = new Sprite();
  private iconKey = '';
  private speech = new Container();
  private speechBg = new Graphics();
  private speechText: Text;
  private speechUntil = 0;
  private sayRule: EmoteRule | undefined;
  private nextSay = 0;
  private nextRules = 0;
  /** Outfits named by the dress rules that hold now, first match first. */
  private dress: string[] = [];
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
  private held: Graphics | null = null;
  private offDuty = false;
  /** Seen from behind: set by walking up the room, kept while standing where the walk ended, cleared back at the seat. */
  private back = false;

  constructor(
    public agent: Agent,
    callbacks: SceneCallbacks,
    roleTitle: string,
    startInLounge: boolean,
    private art: CharacterArt,
    private env: CharacterEnv,
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
    this.iconImage.anchor.set(0.5);
    this.icon.addChild(this.iconBg, this.iconText, this.iconImage);
    this.root.addChild(this.icon);

    this.speechText = new Text({
      text: '',
      style: { fontFamily: FONT, fontSize: 12, fontWeight: 'bold', fill: '#3d3449', wordWrap: true, wordWrapWidth: 170, breakWords: true },
    });
    this.speechText.anchor.set(0.5, 1);
    this.speech.addChild(this.speechBg, this.speechText);
    this.speech.visible = false;
    this.root.addChild(this.speech);

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
    this.nextRules = 0;
  }

  /** What theme rules about this person are checked against. */
  context(now = new Date()): RuleContext {
    return {
      status: this.agent.status,
      place: this.place,
      role: this.agent.role,
      character: this.art.characterId,
      expression: this.agent.expression,
      team: this.env.team,
      walking: this.walks.length > 0,
      now,
    };
  }

  /** Shows a line in a speech bubble over the head for a few seconds. */
  say(text: string) {
    if (!text) return;
    this.speechText.text = text;
    const w = this.speechText.width + 14;
    const h = this.speechText.height + 8;
    this.speechBg.clear();
    this.speechBg
      .roundRect(-w / 2, -h - 2, w, h, 8)
      .fill({ color: '#ffffff', alpha: 0.95 })
      .stroke({ width: 1.5, color: '#3d3449' })
      .poly([-5, -3, 5, -3, 0, 5])
      .fill('#ffffff');
    this.speechText.y = -6;
    this.speech.visible = true;
    this.speechUntil = performance.now() + SAY_MS;
  }

  /** Re-reads the emote rules: the first rule with an icon draws it, the first with lines may speak. */
  private updateRules() {
    const ctx = this.context();
    const dress = this.env.dress.filter((r) => matches(r.when, ctx)).map((r) => r.outfit);
    if (dress.join() !== this.dress.join()) this.dress = dress;
    this.showIcon(firstMatch(this.env.emotes, ctx, (r) => r.icon !== undefined)?.icon ?? null);
    const rule = firstMatch(this.env.emotes, ctx, (r) => Boolean(r.say));
    const now = performance.now();
    if (rule !== this.sayRule) {
      this.sayRule = rule;
      this.nextSay = rule ? now + 400 + Math.random() * 1600 : 0;
    }
    if (rule && this.nextSay && now >= this.nextSay && this.present) {
      this.say(say(rule.say));
      this.nextSay = rule.every ? now + rule.every * 1000 * (0.8 + Math.random() * 0.4) : 0;
    }
  }

  private showIcon(icon: IconSpec | null) {
    const key = icon ? `${icon.text ?? ''}|${icon.image ?? ''}|${icon.color ?? ''}` : '';
    if (key === this.iconKey) return;
    this.iconKey = key;
    const texture = icon?.image ? this.env.texture(icon.image) : undefined;
    this.iconImage.visible = Boolean(texture);
    if (texture) {
      this.iconImage.texture = texture;
      this.iconImage.scale.set(Math.min(1, 28 / Math.max(texture.width, texture.height)));
    }
    this.iconText.text = texture ? '' : (icon?.text ?? '');
    this.iconBg.clear();
    if (icon?.color && !texture) {
      this.iconBg.circle(0, 0, 12).fill(icon.color).stroke({ width: 2, color: '#ffffff' });
      this.iconText.style.fontSize = 16;
    } else {
      this.iconText.style.fontSize = 18;
    }
  }

  /** Plays a short event moment, such as being thanked or having work sent back. */
  play(state: ThemeState) {
    this.moment = { state, until: performance.now() + MOMENT_MS };
  }

  /** Holds a document in front of the body, or puts it away with null. */
  carry(color: string | null) {
    this.held?.destroy();
    this.held = null;
    if (!color) return;
    this.held = paper(color);
    this.held.position.set(12, -this.art.hit.h * 0.45);
    this.sprite.addChild(this.held);
  }

  /** Where this person is heading, or where they stand. */
  get destination(): Point {
    return this.walks.at(-1) ?? this.pos;
  }

  get seat(): Point {
    return this.place === 'lounge' ? this.rest : this.home;
  }

  get present() {
    return this.root.visible && !this.offDuty;
  }

  setPlace(place: Place) {
    if (this.offDuty) return;
    if (place === this.place) return;
    this.place = place;
    if (this.env.passage) void this.walkTo(this.env.passage);
    void this.walkTo(place === 'lounge' ? this.rest : this.home);
  }

  setOffDuty(value: boolean) {
    if (value === this.offDuty) return;
    this.offDuty = value;
    if (value) {
      this.env.onDoor(this, 'agent.left');
      void this.walkTo(this.env.door).then(() => {
        if (!this.offDuty) return;
        this.env.openDoor();
        this.root.visible = false;
      });
    } else {
      this.root.visible = true;
      this.pos = { ...this.env.door };
      this.env.openDoor();
      this.env.onDoor(this, 'agent.arrived');
      void this.walkTo(this.place === 'lounge' ? this.rest : this.home);
    }
  }

  moveSeat(home: Point, rest: Point) {
    if (home.x === this.home.x && home.y === this.home.y) return;
    this.home = home;
    this.rest = rest;
    void this.walkTo(this.place === 'lounge' ? rest : home);
  }

  /** Walks to `target` along the theme's paths. Falling three trips behind, they skip ahead and stand there. */
  walkTo(target: Point) {
    if (this.walks.filter((w) => w.done).length >= 3) {
      for (const w of this.walks) w.done?.();
      this.walks = [];
      this.pos = { ...target };
      this.back = false;
      return Promise.resolve();
    }
    const legs = this.env.route(this.destination, target);
    return new Promise<void>((resolve) => legs.forEach((p, i) => this.walks.push({ x: p.x, y: p.y, done: i === legs.length - 1 ? resolve : undefined })));
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
      const step = (this.env.speed * dt) / 1000;
      if (dist <= step) {
        this.pos = { x: walk.x, y: walk.y };
        this.walks.shift();
        walk.done?.();
        if (this.walks.length === 0) {
          if (this.pos.x === this.seat.x && this.pos.y === this.seat.y) this.back = false;
          this.nextRules = 0;
        }
      } else {
        this.pos.x += (dx / dist) * step;
        this.pos.y += (dy / dist) * step;
        this.sprite.scale.x = dx < -1 ? -1 : dx > 1 ? 1 : this.sprite.scale.x;
        this.back = dy < -Math.abs(dx) * 0.5;
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
      back: this.back,
      place: this.place,
      status: this.status,
      expression: this.expression,
      moment: this.moment?.state ?? null,
      dress: this.dress,
    });

    this.root.position.set(Math.round(this.pos.x), Math.round(this.pos.y));
    this.sprite.y = offsetY;
    this.sprite.rotation = rotation;
    this.roleTag.y = this.iconY + 22;
    this.icon.y = this.iconY + Math.sin(this.phase * 4) * 2;
    this.speech.y = this.iconY - 14;

    const now = performance.now();
    if (now >= this.nextRules) {
      this.nextRules = now + 300;
      this.updateRules();
    }
    if (this.speech.visible && now > this.speechUntil) this.speech.visible = false;
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
  private env!: CharacterEnv;
  private interactions: Interaction[] = [];
  private events: EventRule[] = [];
  private props = new Map<string, PropArt>();
  private propTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private variantCheck = 0;

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
    this.props = room.props ?? new Map();
    const own = this.theme.interactions ?? [];
    this.interactions = [...DEFAULT_INTERACTIONS.filter((d) => !own.some((o) => o.id === d.id)), ...own].filter((i) => !i.hidden);
    this.events = this.theme.events ?? [];
    const { waypoints, links } = this.layout;
    this.env = {
      door: this.layout.door,
      passage: this.layout.passage,
      speed: this.layout.walkSpeed,
      team: this.team.id,
      emotes: [...(this.theme.emotes ?? []), ...DEFAULT_EMOTES],
      dress: this.theme.dress ?? [],
      route: (from, to) => findRoute({ waypoints, links }, from, to),
      texture: (path) => this.theme.texture?.(path),
      onDoor: (view, kind) => this.themeEvent(kind, [view]),
      openDoor: () => {
        const door = [...this.props.entries()].find(([, p]) => p.spot === 'door' && p.has('open'));
        if (door) this.setProp(door[0], 'open', DOOR_MS);
      },
    };
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
    for (const timer of this.propTimers.values()) clearTimeout(timer);
    if (this.ready) this.app.destroy(true, { children: true });
  }

  /** The friendly menu items (greet…) that fit this person right now. */
  interactionsFor(agentId: string): { id: string; label: string }[] {
    const c = this.chars.get(agentId);
    if (!c || !c.present) return [];
    const ctx = c.context();
    return this.interactions
      .filter((i) => firstMatch([i], ctx) && firstMatch(i.reactions, ctx))
      .map((i) => ({ id: i.id, label: localText(i.label, currentLanguage()) }));
  }

  /** Plays how this person answers an interaction. Nothing leaves the screen: it is only a reaction. */
  interact(agentId: string, interactionId: string) {
    const c = this.chars.get(agentId);
    const interaction = this.interactions.find((i) => i.id === interactionId);
    if (!c || !interaction) return;
    const reaction = firstMatch(interaction.reactions, c.context());
    if (reaction) this.perform(c, reaction);
  }

  private perform(c: CharacterView, reaction: Reaction) {
    if (reaction.state) c.play(reaction.state);
    c.say(say(reaction.say));
    if (reaction.effect) this.effect(reaction.effect, c.pos.x, c.pos.y + c.iconY);
  }

  /**
   * Runs the theme's rules for an event on the people it is about (or once, for events about nobody).
   * The app's own effect plays first unless a rule replaces it, so a rule's motion wins.
   */
  private themeEvent(type: ThemeEvent, people: (CharacterView | undefined)[], appEffect?: () => void) {
    const rules = this.events.filter((r) => r.on === type);
    const now = new Date();
    const targets = people.filter((c): c is CharacterView => Boolean(c));
    const hits = rules.length
      ? (targets.length ? targets : [null]).flatMap((target) => {
          const rule = firstMatch(rules, target ? target.context(now) : { now });
          return rule ? [{ target, rule }] : [];
        })
      : [];
    if (!hits.some((h) => h.rule.replace)) appEffect?.();
    for (const { target, rule } of hits) {
      if (target) this.perform(target, rule);
      else if (rule.effect) this.effect(rule.effect, SCENE_W / 2, SCENE_H / 3);
      if (rule.prop) this.setProp(rule.prop.id, rule.prop.state, rule.prop.ms);
    }
  }

  private setProp(id: string, state: string, ms: number) {
    const prop = this.props.get(id);
    if (!prop || !prop.has(state)) return;
    prop.setState(state);
    clearTimeout(this.propTimers.get(id));
    this.propTimers.set(id, setTimeout(() => prop.setState(null), ms));
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
        const view = new CharacterView(agent, this.callbacks, this.team.roleTitles[agent.role], resting, art, this.env, home, rest, offDuty);
        this.chars.set(agent.id, view);
        this.charLayer.addChild(view.root);
      }
    }
    this.extraDesks.forEach((g, i) => (g.visible = i < extra));
    this.updateBoard(snapshot);
    const profit = office ? office.valueKrw - office.spentKrw : 0;
    this.safeText.text = tpl('이익 {v}{v2}', { v: profit >= 0 ? '+' : '', v2: krw(profit) });
    this.safeText.style.fill = profit >= 0 ? '#1e8449' : '#c0392b';
  }

  handleEvent(event: OfficeEvent) {
    if (!this.ready) return;
    const p = event.payload as Record<string, unknown>;
    const agentChar = event.agentId ? this.chars.get(event.agentId) : undefined;
    if (!(THEME_EVENTS as readonly string[]).includes(event.type) || event.type === 'agent.arrived' || event.type === 'agent.left') {
      this.appEffect(event, agentChar);
      return;
    }
    const people =
      event.type === 'task.completed'
        ? [...this.chars.values()].filter((c) => c.present)
        : event.type === 'review.rejected'
          ? [this.chars.get(String(p.returnTo))]
          : [agentChar];
    this.themeEvent(event.type as ThemeEvent, people, () => this.appEffect(event, agentChar));
  }

  /** The app's own animation for an event: stamps, coins, papers carried around. */
  private appEffect(event: OfficeEvent, agentChar: CharacterView | undefined) {
    const p = event.payload as Record<string, unknown>;
    const deskOf = (id: unknown) => {
      const c = this.chars.get(String(id));
      if (c) return { x: c.pos.x, y: c.pos.y - 24 };
      const role = this.roleOf.get(String(id));
      return role ? { x: this.layout.seats[role].x, y: this.layout.seats[role].y - 24 } : null;
    };
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
        if (p.queued) this.floatText(tpl('대기열 +1: {v}', { v: String(p.title ?? '') }), BOARD.x + BOARD.w / 2, BOARD.y + BOARD.h + 16, '#4b3f80', 13);
        break;
      case 'queue.started': {
        const manager = [...this.chars.values()].find((c) => c.agent.role === 'manager');
        if (manager) {
          manager.setPlace('desk');
          void manager.walkTo(boardSpot).then(() => {
            manager.carry('#ffe066');
            return manager.walkTo(manager.home).then(() => manager.carry(null));
          });
        }
        break;
      }
      case 'task.handed_off': {
        void this.handOver(p.from, p.to, '#ffffff');
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
        if (at) this.stamp(t('반려'), at, '#c0392b');
        if (p.returnTo) this.chars.get(String(p.returnTo))?.play('review.rejected');
        if (p.returnTo) setTimeout(() => void this.handOver(event.agentId, p.returnTo, '#ffd6d6'), 700);
        break;
      }
      case 'review.approved': {
        const at = deskOf(event.agentId);
        if (at) this.stamp(t('통과'), at, '#1e8449');
        break;
      }
      case 'approval.requested': {
        const reviewer = [...this.roleOf.entries()].find(([, r]) => r === 'reviewer')?.[0];
        void this.handOver(reviewer, event.agentId, '#d6eaff');
        break;
      }
      case 'approval.denied': {
        const at = deskOf(event.agentId);
        if (at) this.stamp(t('수정 요청'), at, '#d35400');
        agentChar?.play('troubled');
        break;
      }
      case 'agent.help_received':
        if (agentChar) this.floatText(t('고마워요!'), agentChar.pos.x, agentChar.pos.y - 120, '#e75480', 14);
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
        if (agentChar?.present) void this.fetch(agentChar, this.layout.door, event.type === 'mail.received' ? '#fff3c4' : '#d5f5e3');
        if (agentChar) this.floatText(event.type === 'mail.received' ? t('새 메일!') : t('새 문의!'), agentChar.pos.x, agentChar.pos.y - 120, '#2471a3', 13);
        break;
      }
      case 'team.applied':
        this.floatText(String(p.summary ?? ''), 400, ARCHIVE.y - 20, '#6c3483', 13);
        break;
      case 'task.completed': {
        const manager = [...this.chars.values()].find((c) => c.agent.role === 'manager' && c.present);
        if (manager) void this.file(manager, { x: ARCHIVE.x + ARCHIVE.w / 2 + 34, y: ARCHIVE.y + ARCHIVE.h }, '#b9f6ca');
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
      this.boardTitle.text = tpl('{emoji} {name} 칠판', { emoji: this.team.emoji, name: this.team.name });
      this.boardLines.text = t('여기를 눌러 첫 업무를 등록하세요');
      return;
    }
    const { done, total } = planProgress(task);
    const statusLine =
      task.status === 'awaiting_help'
        ? t('도움 요청 1건 - 직원을 눌러 도와주세요')
        : task.status === 'awaiting_approval'
          ? t('승인 대기 1건 - 오른쪽에서 승인')
          : task.status === 'completed'
            ? t('완료! 칠판을 눌러 새 업무 등록')
            : task.status === 'failed'
              ? t('중단됨 - 오른쪽에서 이어서 하기')
              : tpl('진행 중: {v}', { v: currentStepLabel(task) });
    this.boardTitle.text = `${t('목표')}: ${clip(t(task.title), 16)}`;
    this.boardLines.text = `${tpl('진행률 {done}/{total}', { done, total })}${queued ? ` · ${tpl('대기 {n}건', { n: queued })}` : ''}
${task.status === 'queued' ? t('곧 시작해요') : statusLine}`;
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
    this.variantCheck -= dt;
    if (this.variantCheck <= 0) {
      this.variantCheck = 60_000;
      if (this.theme.variantAt && this.theme.variantAt(new Date()) !== (this.theme.variant ?? null)) this.callbacks.onThemeStale?.();
    }
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

  /** The giver walks the document over to the receiver, hands it across and goes back to their seat. */
  private async handOver(giverId: unknown, receiverId: unknown, color: string) {
    const giver = this.chars.get(String(giverId));
    const receiver = this.chars.get(String(receiverId));
    if (!giver || !receiver || giver === receiver || !giver.present || !receiver.present) return;
    const at = receiver.destination;
    const side = at.x >= giver.pos.x ? -1 : 1;
    giver.carry(color);
    await giver.walkTo({ x: at.x + side * 46, y: at.y + 2 });
    giver.carry(null);
    receiver.carry(color);
    setTimeout(() => receiver.carry(null), 1400);
    await giver.walkTo(giver.seat);
  }

  /** Walks to `spot`, picks up a document and brings it back (mail at the door). */
  private async fetch(person: CharacterView, spot: Point, color: string) {
    await person.walkTo(spot);
    person.carry(color);
    await person.walkTo(person.seat);
    setTimeout(() => person.carry(null), 1200);
  }

  /** Carries a document to `spot` and leaves it there (finished work into the archive). */
  private async file(person: CharacterView, spot: Point, color: string) {
    person.carry(color);
    await person.walkTo(spot);
    person.carry(null);
    await person.walkTo(person.seat);
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

  /** A named effect a theme can ask for, around a point over someone's head. */
  private effect(name: EffectName, x: number, y: number) {
    const glyphs: Partial<Record<EffectName, string[]>> = { hearts: ['💗', '💕'], sweat: ['💦'], notes: ['♪', '♫'], zzz: ['z', 'Z'] };
    if (name === 'sparkle') return this.sparkle(x, y);
    if (name === 'confetti') return this.confetti(x, y);
    const list = glyphs[name] ?? [];
    for (let i = 0; i < 3; i++) {
      const t = new Text({ text: list[i % list.length], style: { fontFamily: FONT, fontSize: 16, fontWeight: 'bold', fill: '#5b4a8a' } });
      t.anchor.set(0.5);
      t.alpha = 0;
      this.fxLayer.addChild(t);
      const dx = (i - 1) * 16;
      setTimeout(() => {
        this.addFx(
          1300,
          (p) => {
            t.position.set(x + dx + Math.sin(p * 6 + i) * 5, y - p * 40);
            t.alpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
          },
          () => t.destroy(),
        );
      }, i * 180);
    }
  }

  private confetti(x: number, y: number) {
    const colors = ['#ff6b6b', '#f4d03f', '#5dade2', '#58d68d', '#ff9ff3'];
    for (let i = 0; i < 14; i++) {
      const g = new Graphics();
      g.rect(-3, -2, 6, 4).fill(colors[i % colors.length]);
      this.fxLayer.addChild(g);
      const vx = (Math.random() - 0.5) * 120;
      const vy = -60 - Math.random() * 60;
      this.addFx(
        1400,
        (t) => {
          g.position.set(x + vx * t, y + vy * t + 160 * t * t);
          g.rotation = t * 10 + i;
          g.alpha = 1 - t * t;
        },
        () => g.destroy(),
      );
    }
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
