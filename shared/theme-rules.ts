import type { Language } from './i18n.ts';
import type { AgentStatus, Expression, Role, TeamId } from './types.ts';

export type Place = 'desk' | 'lounge';

/**
 * When a theme rule applies. Every listed condition must hold; lists match any of their values.
 * `hours` is [from, to) in local hours and may wrap past midnight; `dates` is an inclusive `MM-DD` range that may wrap past new year.
 */
export interface When {
  status?: AgentStatus[];
  place?: Place[];
  role?: Role[];
  character?: string[];
  expression?: Expression[];
  team?: TeamId[];
  walking?: boolean;
  hours?: [number, number];
  weekdays?: number[];
  dates?: [string, string];
}

/** What a rule is checked against. Rules about a person fail when there is no person, as for seasonal variants. */
export interface RuleContext {
  status?: AgentStatus;
  place?: Place;
  role?: Role;
  character?: string;
  expression?: Expression;
  team?: TeamId;
  walking?: boolean;
  now: Date;
}

/** Text a theme writes once, or once per language. */
export type LocalText = string | Partial<Record<Language, string>>;

export function localText(text: LocalText, language: Language): string {
  if (typeof text === 'string') return text;
  return text[language] ?? text.ko ?? Object.values(text).find(Boolean) ?? '';
}

const DAY = /^(\d{2})-(\d{2})$/;

export const isMonthDay = (v: unknown): v is string => {
  const m = typeof v === 'string' ? DAY.exec(v) : null;
  return Boolean(m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31);
};

const monthDay = (v: string) => Number(v.slice(0, 2)) * 100 + Number(v.slice(3, 5));

export function inDates([from, to]: [string, string], now: Date): boolean {
  const day = (now.getMonth() + 1) * 100 + now.getDate();
  const a = monthDay(from);
  const b = monthDay(to);
  return a <= b ? day >= a && day <= b : day >= a || day <= b;
}

export function inHours([from, to]: [number, number], now: Date): boolean {
  const hour = now.getHours() + now.getMinutes() / 60;
  if (from === to) return true;
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

const has = <T>(list: readonly T[] | undefined, value: T | undefined) => !list || (value !== undefined && list.includes(value));

export function matches(when: When | undefined, ctx: RuleContext): boolean {
  if (!when) return true;
  return (
    has(when.status, ctx.status) &&
    has(when.place, ctx.place) &&
    has(when.role, ctx.role) &&
    has(when.character, ctx.character) &&
    has(when.expression, ctx.expression) &&
    has(when.team, ctx.team) &&
    (when.walking === undefined || when.walking === Boolean(ctx.walking)) &&
    (!when.hours || inHours(when.hours, ctx.now)) &&
    has(when.weekdays, ctx.now.getDay()) &&
    (!when.dates || inDates(when.dates, ctx.now))
  );
}

/** Rules are read top to bottom; the first one that holds wins. */
export function firstMatch<T extends { when?: When }>(rules: readonly T[], ctx: RuleContext, usable: (rule: T) => boolean = () => true): T | undefined {
  return rules.find((rule) => usable(rule) && matches(rule.when, ctx));
}

export const pickOne = <T>(list: readonly T[]): T | undefined => list[Math.floor(Math.random() * list.length)];

export interface Waypoints {
  waypoints: Record<string, { x: number; y: number }>;
  links: [string, string][];
}

/**
 * The points to walk through from `from` to `to` along a theme's paths: on at the waypoint nearest the start,
 * the shortest way through the links, off at the waypoint nearest the goal. Without a connected path, straight there.
 */
export function findRoute({ waypoints, links }: Waypoints, from: { x: number; y: number }, to: { x: number; y: number }) {
  const ids = Object.keys(waypoints);
  if (!ids.length) return [to];
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  const nearest = (p: { x: number; y: number }) => ids.reduce((best, id) => (dist(waypoints[id], p) < dist(waypoints[best], p) ? id : best));
  const start = nearest(from);
  const goal = nearest(to);
  if (start === goal || dist(from, to) <= dist(from, waypoints[start])) return [to];

  const cost = new Map<string, number>([[start, 0]]);
  const prev = new Map<string, string>();
  const open = new Set([start]);
  while (open.size) {
    const here = [...open].reduce((a, b) => (cost.get(a)! <= cost.get(b)! ? a : b));
    open.delete(here);
    if (here === goal) break;
    for (const [a, b] of links) {
      const next = a === here ? b : b === here ? a : null;
      if (!next) continue;
      const c = cost.get(here)! + dist(waypoints[here], waypoints[next]);
      if (c < (cost.get(next) ?? Infinity)) {
        cost.set(next, c);
        prev.set(next, here);
        open.add(next);
      }
    }
  }
  if (!cost.has(goal)) return [to];
  const path: { x: number; y: number }[] = [];
  for (let id: string | undefined = goal; id; id = prev.get(id)) path.unshift(waypoints[id]);
  return [...path, to];
}
