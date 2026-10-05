import { useEffect, useRef, useState } from 'react';
import { TEAMS } from '../../../shared/teams.ts';
import { officeTheme } from '../../../shared/theme-pack.ts';
import type { Agent, Office, OfficeEvent, Snapshot } from '../../../shared/types.ts';
import { OfficeScene, SCENE_H, SCENE_W } from './OfficeScene.ts';

export interface OfficeActions {
  onNewTask: () => void;
  onHelp: (agentId: string) => void;
  onShowTask: () => void;
  onEditRules: (agentId: string) => void;
  onShowCard: (agentId: string) => void;
  onTogglePause: (agent: Agent) => void;
}

interface Props extends OfficeActions {
  snapshot: Snapshot;
  office: Office;
  onEvent: (listener: (event: OfficeEvent) => void) => () => void;
}

/** Dev builds only: `?theme=<id>` overrides the office's theme, to preview one without switching it. */
const devTheme = () => (import.meta.env.DEV ? (new URLSearchParams(location.search).get('theme') ?? undefined) : undefined);

const pct = (x: number, y: number) => ({ left: `${(x / SCENE_W) * 100}%`, top: `${(y / SCENE_H) * 100}%` });
const bubbleAt = (x: number, y: number) => pct(Math.min(Math.max(x, SCENE_W * 0.12), SCENE_W * 0.88), y);

/** Beside the character, opening upward in the lower half; it never reaches past the office, scrolling itself if the office is small. */
function menuAt(x: number, y: number) {
  const left = pct(x > SCENE_W * 0.6 ? x - 40 : x + 40, 0).left;
  if (y > SCENE_H / 2) {
    const bottom = ((SCENE_H - y) / SCENE_H) * 100;
    return { left, bottom: `${bottom}%`, maxHeight: `${100 - bottom}%` };
  }
  const top = ((y + 30) / SCENE_H) * 100;
  return { left, top: `${top}%`, maxHeight: `${100 - top}%` };
}

export function OfficeView({ snapshot, office, onEvent, ...actions }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<OfficeScene | null>(null);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const [bubbleAgent, setBubbleAgent] = useState<string | null>(null);
  const [menuAgent, setMenuAgent] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const themeId = devTheme() ?? officeTheme(office, snapshot.theme, snapshot.themeBookings);
  const [themeLoads, setThemeLoads] = useState(0);

  // Rebuilt when the office switches theme or a dated variant comes due; the latest snapshot is applied once the new scene is ready.
  useEffect(() => {
    const scene = new OfficeScene({
      onAgentClick: (id) => {
        setMenuAgent(null);
        setBubbleAgent((current) => (current === id ? null : id));
      },
      onAgentContextMenu: (id) => {
        setBubbleAgent(null);
        setMenuAgent(id);
      },
      onBoardClick: () => actionsRef.current.onNewTask(),
      onThemeStale: () => setThemeLoads((n) => n + 1),
    }, office.id, office.team, themeId);
    sceneRef.current = scene;
    scene.applySnapshot(snapshotRef.current);
    if (hostRef.current) void scene.init(hostRef.current);
    return () => {
      scene.destroy();
      sceneRef.current = null;
    };
  }, [themeId, themeLoads]);

  useEffect(() => {
    sceneRef.current?.applySnapshot(snapshot);
  }, [snapshot]);

  useEffect(() => onEvent((event) => sceneRef.current?.handleEvent(event)), [onEvent]);

  const helpAgents = snapshot.agents.filter((a) => a.status === 'help_requested');
  const overlayActive = bubbleAgent !== null || menuAgent !== null || helpAgents.length > 0;

  useEffect(() => {
    if (!overlayActive) return;
    const timer = setInterval(() => setTick((t) => t + 1), 80);
    return () => clearInterval(timer);
  }, [overlayActive]);

  useEffect(() => {
    if (!bubbleAgent) return;
    const timer = setTimeout(() => setBubbleAgent(null), 7000);
    return () => clearTimeout(timer);
  }, [bubbleAgent]);

  const agentById = (id: string | null) => snapshot.agents.find((a) => a.id === id);
  const anchor = (id: string) => sceneRef.current?.anchorOf(id) ?? null;
  const helpTaskAgent = snapshot.tasks.find((t) => t.help)?.help?.agentId;

  const bubble = agentById(bubbleAgent);
  const bubblePos = bubble ? anchor(bubble.id) : null;
  const menu = agentById(menuAgent);
  const menuPos = menu ? anchor(menu.id) : null;
  const friendly = menu ? (sceneRef.current?.interactionsFor(menu.id) ?? []) : [];

  return (
    <div className="office-scroll">
    <div className="office" onClick={(e) => e.target === e.currentTarget && setMenuAgent(null)}>
      <div ref={hostRef} className="office-canvas" />

      {helpAgents
        .filter((a) => a.id !== bubbleAgent)
        .map((a) => {
          const pos = anchor(a.id);
          if (!pos) return null;
          return (
            <button key={a.id} className="bubble bubble-help" style={bubbleAt(pos.x, pos.y)} onClick={() => actions.onHelp(a.id)}>
              도와주세요…! <span className="bubble-cta">도와주기</span>
            </button>
          );
        })}

      {bubble && bubblePos && (
        <div className="bubble" style={bubbleAt(bubblePos.x, bubblePos.y)} onClick={() => setBubbleAgent(null)}>
          <div className="bubble-name">
            {bubble.name} · {TEAMS[office.team].roleTitles[bubble.role]}
          </div>
          <div>{bubble.activity}</div>
          {bubble.status === 'help_requested' && (
            <button className="pixel-btn small primary" onClick={() => actions.onHelp(bubble.id)}>
              도와주기
            </button>
          )}
        </div>
      )}

      {menu && menuPos && (
        <div
          className={`context-menu${menuPos.x > SCENE_W * 0.6 ? ' flip' : ''}`}
          style={menuAt(menuPos.x, menuPos.y)}
          tabIndex={-1}
          onBlur={(e) => {
            // Don't close if focus moves to something inside the menu
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            setMenuAgent(null);
          }}
          onMouseLeave={() => setMenuAgent(null)}
        >
          <div className="context-title">
            <span>{menu.name}</span>
            <button className="context-close" onClick={() => setMenuAgent(null)} aria-label="닫기">X</button>
          </div>
          {[
            { label: '상태 보기', run: () => setBubbleAgent(menu.id) },
            { label: '도와주기', run: () => actions.onHelp(menu.id), disabled: helpTaskAgent !== menu.id, highlight: helpTaskAgent === menu.id },
            { label: '현재 업무 보기', run: () => actions.onShowTask() },
            { label: '규칙 보기·편집', run: () => actions.onEditRules(menu.id) },
            { label: '손익 카드', run: () => actions.onShowCard(menu.id) },
            { label: menu.paused ? '다시 일하기' : '일시정지', run: () => actions.onTogglePause(menu) },
          ].map((item) => (
            <button
              key={item.label}
              className={`context-item${item.highlight ? ' highlight' : ''}`}
              disabled={item.disabled}
              onClick={() => {
                setMenuAgent(null);
                item.run();
              }}
            >
              {item.label}
            </button>
          ))}
          {friendly.length > 0 && <div className="context-sep" />}
          {friendly.map((item) => (
            <button
              key={item.id}
              className="context-item friendly"
              onClick={() => {
                setMenuAgent(null);
                sceneRef.current?.interact(menu.id, item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      <button className="pixel-btn new-task-btn" onClick={actions.onNewTask}>
        + 업무 등록
      </button>
      <div className="office-hint">
        <span className="hint-mouse">직원 클릭: 상태 · 우클릭: 메뉴 · 칠판 클릭: 업무 등록</span>
        <span className="hint-touch">직원 탭: 상태 · 길게 누르기: 메뉴 · 칠판 탭: 업무 등록</span>
      </div>
    </div>
    </div>
  );
}
