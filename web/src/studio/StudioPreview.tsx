import { Application, Container, Texture } from 'pixi.js';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { TEAMS } from '../../../shared/teams.ts';
import { THEME_SCENE, type Point, type Rect, type SpotName, type ThemeManifest, type ThemeState } from '../../../shared/theme-pack.ts';
import type { Agent, Role } from '../../../shared/types.ts';
import type { CharacterArt, Layout } from '../office/theme.ts';
import { createPackTheme } from '../office/themes/pack.ts';
import type { StudioImage } from './buildPackage.ts';

export type PlaceTarget = { kind: 'seat' | 'lounge'; role: Role } | { kind: 'door' } | { kind: 'spot'; spot: SpotName };

export const ROLES: Role[] = ['manager', 'researcher', 'writer', 'reviewer'];
export const ROLE_LABEL: Record<Role, string> = { manager: '매니저', researcher: '리서처', writer: '작가', reviewer: '리뷰어' };
export const SPOT_LABEL: Record<SpotName, string> = { board: '칠판', shelf: '자료실', safe: '금고', archive: '보관함' };

const textures = new WeakMap<Uint8Array, Promise<Texture>>();

/** Textures straight from uploaded bytes, cached per upload. */
function textureOf(image: StudioImage) {
  let texture = textures.get(image.bytes);
  if (!texture) {
    texture = new Promise<Texture>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(Texture.from(img));
      img.onerror = () => reject(new Error(`${image.path} 이미지를 읽지 못했어요.`));
      img.src = URL.createObjectURL(new Blob([image.bytes as BlobPart], { type: image.path.endsWith('.webp') ? 'image/webp' : 'image/png' }));
    });
    textures.set(image.bytes, texture);
  }
  return texture;
}

const fakeAgent = (role: Role, i: number): Agent =>
  ({ id: `preview-${role}`, officeId: 'preview', name: ROLE_LABEL[role], role, model: '', rules: '', personality: 'balanced', skin: 'pixel', status: 'idle', expression: 'normal', activity: '', paused: false, costKrw: 0, valueKrw: 0, tasksDone: i }) as Agent;

interface Props {
  manifest: ThemeManifest | null;
  images: Map<string, StudioImage>;
  layout: Layout;
  state: ThemeState;
  target: PlaceTarget | null;
  onPlace: (target: PlaceTarget, value: Point | Rect) => void;
  /** Hands the studio a way to take a PNG of the scene for the gallery preview. */
  onCapture: (capture: (() => Promise<Uint8Array>) | null) => void;
}

export function StudioPreview({ manifest, images, layout, state, target, onPlace, onCapture }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const charsRef = useRef<CharacterArt[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [ready, setReady] = useState(false);
  const [drag, setDrag] = useState<{ from: Point; to: Point } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const app = new Application();
    let live = true;
    void app.init({ width: THEME_SCENE.w, height: THEME_SCENE.h, background: '#2b2b3a', antialias: false, resolution: 1 }).then(() => {
      if (!live) return app.destroy(true);
      app.canvas.style.width = '100%';
      app.canvas.style.height = 'auto';
      app.canvas.style.display = 'block';
      host.current?.prepend(app.canvas);
      let phase = 0;
      app.ticker.add((ticker) => {
        phase += ticker.deltaMS / 1000;
        const look = { walking: stateRef.current === 'walk', place: 'desk' as const, status: 'idle' as const, expression: 'normal' as const, moment: stateRef.current };
        for (const c of charsRef.current) c.update(phase, look);
      });
      appRef.current = app;
      setReady(true);
    });
    return () => {
      live = false;
      onCapture(null);
      if (appRef.current) appRef.current.destroy(true, { children: true });
      appRef.current = null;
    };
  }, []);

  useEffect(() => {
    const app = appRef.current;
    if (!ready || !app) return;
    let live = true;
    app.stage.removeChildren().forEach((child) => child.destroy({ children: true }));
    charsRef.current = [];
    setError(null);
    if (!manifest) return;
    void createPackTheme(manifest, (path) => textureOf(images.get(path)!))
      .then((theme) => {
        if (!live) return;
        const room = theme.buildRoom(TEAMS.dev);
        const people = new Container();
        ROLES.forEach((role, i) => {
          const art = theme.createCharacter();
          art.apply(fakeAgent(role, i));
          art.view.position.set(layout.seats[role].x, layout.seats[role].y);
          people.addChild(art.view);
          charsRef.current.push(art);
        });
        people.children.sort((a, b) => a.y - b.y);
        app.stage.addChild(room.back, people, room.front);
        onCapture(async () => {
          const canvas = app.renderer.extract.canvas({ target: app.stage, frame: undefined }) as HTMLCanvasElement;
          const small = document.createElement('canvas');
          small.width = THEME_SCENE.w / 2;
          small.height = THEME_SCENE.h / 2;
          small.getContext('2d')!.drawImage(canvas, 0, 0, small.width, small.height);
          const blob = await new Promise<Blob | null>((resolve) => small.toBlob(resolve, 'image/png'));
          if (!blob) throw new Error('미리보기 이미지를 만들지 못했어요.');
          return new Uint8Array(await blob.arrayBuffer());
        });
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [ready, manifest, images, layout]);

  const toScene = (e: ReactPointerEvent<SVGSVGElement>): Point => {
    const box = e.currentTarget.getBoundingClientRect();
    const clamp = (v: number, max: number) => Math.round(Math.min(max, Math.max(0, v)));
    return { x: clamp(((e.clientX - box.left) / box.width) * THEME_SCENE.w, THEME_SCENE.w), y: clamp(((e.clientY - box.top) / box.height) * THEME_SCENE.h, THEME_SCENE.h) };
  };

  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!target) return;
    const at = toScene(e);
    if (target.kind === 'spot') {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ from: at, to: at });
    } else onPlace(target, at);
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => drag && setDrag({ ...drag, to: toScene(e) });
  const up = () => {
    if (!drag || target?.kind !== 'spot') return setDrag(null);
    const x = Math.min(drag.from.x, drag.to.x);
    const y = Math.min(drag.from.y, drag.to.y);
    const w = Math.abs(drag.to.x - drag.from.x);
    const h = Math.abs(drag.to.y - drag.from.y);
    if (w >= 8 && h >= 8) onPlace(target, { x, y, w, h });
    setDrag(null);
  };

  const marker = (p: Point, label: string, kind: string) => (
    <g key={`${kind}:${label}`} className={`studio-marker ${kind}`} transform={`translate(${p.x} ${p.y})`}>
      <circle r={6} />
      <text y={-10}>{label}</text>
    </g>
  );

  return (
    <div className="studio-preview" ref={host}>
      <svg
        className={`studio-overlay${target ? ' placing' : ''}`}
        viewBox={`0 0 ${THEME_SCENE.w} ${THEME_SCENE.h}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
      >
        {(Object.keys(layout.spots) as SpotName[]).map((name) => {
          const r = layout.spots[name];
          return (
            <g key={name} className={`studio-spot${target?.kind === 'spot' && target.spot === name ? ' active' : ''}`}>
              <rect x={r.x} y={r.y} width={r.w} height={r.h} />
              <text x={r.x + 4} y={r.y + 14}>
                {SPOT_LABEL[name]}
              </text>
            </g>
          );
        })}
        {ROLES.map((role) => marker(layout.seats[role], `${ROLE_LABEL[role]} 좌석`, 'seat'))}
        {ROLES.map((role) => marker(layout.lounge[role], `${ROLE_LABEL[role]} 휴식`, 'lounge'))}
        {marker(layout.door, '문', 'door')}
        {drag && (
          <rect className="studio-drag" x={Math.min(drag.from.x, drag.to.x)} y={Math.min(drag.from.y, drag.to.y)} width={Math.abs(drag.to.x - drag.from.x)} height={Math.abs(drag.to.y - drag.from.y)} />
        )}
      </svg>
      {!manifest && <div className="studio-empty">배경 이미지와 idle 프레임이 있는 캐릭터를 하나 이상 넣으면 여기에 보여요.</div>}
      {error && <div className="studio-empty neg">{error}</div>}
    </div>
  );
}
