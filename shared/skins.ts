import { t } from './i18n.ts';
import { splitPackSkin } from './theme-pack.ts';

export type Skin = 'pixel' | 'bishoujo' | 'pinkgirl';

export interface SkinMeta {
  id: Skin;
  name: string;
  preview: string;
  credit: string | null;
  note: string;
}

export const SKINS: SkinMeta[] = [
  { id: 'pixel', name: '기본 픽셀', preview: '🧑‍💼', credit: null, note: '역할별 소품과 표정이 있는 기본 직원' },
  { id: 'bishoujo', name: '미소녀', preview: '👧', credit: null, note: '긴 머리·큰 눈 픽셀 미소녀. 표정과 역할 소품 지원' },
  {
    id: 'pinkgirl',
    name: '핑크 소녀 (CC0)',
    preview: '🎀',
    credit: 'draganasgamesart, "Girl with Clothes", OpenGameArt.org, CC0',
    note: '무료 공개 스프라이트. 걷기 애니메이션 지원, 표정 변화 없음',
  },
];

export const isSkin = (id: unknown): id is Skin => SKINS.some((s) => s.id === id);

/** What an agent wears: a built-in skin, or a character of an installed theme as `<themeId>:<characterId>`. */
export type AgentSkin = Skin | `${string}:${string}`;
export const isAgentSkin = (id: unknown): id is AgentSkin => isSkin(id) || (typeof id === 'string' && splitPackSkin(id) !== null);
/** The built-in skin to draw where theme characters cannot be shown (pixel offices, previews). */
export const builtinSkin = (skin: AgentSkin): Skin => (isSkin(skin) ? skin : 'pixel');

/** Korean in `SKINS` is the catalogue key, so display goes through `t()`. */
export const skinName = (id: AgentSkin | undefined) => t(SKINS.find((s) => s.id === id)?.name ?? '');
export const skinNote = (id: AgentSkin | undefined) => t(SKINS.find((s) => s.id === id)?.note ?? '');
