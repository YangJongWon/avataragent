import type { DesignStyle, PaletteId } from '../../shared/design.ts';
import type { TeamId } from '../../shared/types.ts';

/** Hex without '#', the form docx, exceljs and pptxgenjs expect. */
export interface Theme {
  accent: string;
  soft: string;
  /** Cover and divider background; white text must read on it. */
  dark: string;
  ink: string;
  muted: string;
  good: string;
  warn: string;
  font: string;
  headFont: string;
  chart: string[];
}

type Swatch = Pick<Theme, 'accent' | 'soft' | 'dark' | 'chart'>;

const sw = (accent: string, soft: string, dark: string, ...rest: string[]): Swatch => ({ accent, soft, dark, chart: [accent, ...rest] });

const PALETTE_SWATCHES: Record<PaletteId, Swatch> = {
  midnight: sw('2B3A8C', 'E8ECFA', '141A40', '6F8BD8', 'F2A541', '8C9AAE', 'B8C6EE'),
  ocean: sw('065A82', 'E3F1F7', '0D2C4A', '1C9AC4', 'F0A04B', '6B8796', 'A5D3E6'),
  teal: sw('028090', 'E0F4F3', '024E57', '00A896', 'F4A259', '5C6B73', '9BC1BC'),
  forest: sw('2C5F2D', 'EAF2E3', '1B3A1C', '97BC62', 'D9A441', '5E8C9A', 'B5B5A8'),
  sage: sw('4F7F78', 'EAF2EF', '2E4A47', '84B59F', 'E2B04A', '7E98A6', 'B9CFC7'),
  coral: sw('D94F55', 'FDECEC', '2F3C7E', '2F3C7E', 'F2C14E', '5DA9A6', 'A3A3A3'),
  terracotta: sw('B85042', 'F6ECE6', '4A2620', 'A7BEAE', 'D9A35F', '6B7F8E', 'C9B8AE'),
  berry: sw('6D2E46', 'F4E9EC', '3D1A28', 'A26769', 'C9A227', '4F6D7A', 'D5B9B2'),
  cherry: sw('990011', 'FCEFEF', '2A1A3E', '2F3C7E', 'E0A030', '7C8BA1', 'D6A3A8'),
  charcoal: sw('36454F', 'F1F3F4', '1E272D', '8A9BA8', 'D97B29', '5A8F7B', 'C3CAD0'),
};

const TEAM_SWATCHES: Record<TeamId, Swatch> = {
  dev: sw('4F46B8', 'ECEBFA', '23205A', 'E0A030', '3A9D8F', 'C2554D', '9A98D8'),
  hr: sw('1F6FB2', 'E6F0F9', '0F3558', 'E0A030', '3A9D8F', 'C2554D', '8FB8DA'),
  mgmt: sw('8A5A1F', 'F5ECDD', '3E2A10', '3A6EA5', '3A9D8F', 'C2554D', 'CDB089'),
  support: sw('2E7D4F', 'E4F2E9', '173F28', 'E0A030', '3A6EA5', 'C2554D', '98C9AA'),
  welfare: sw('B44A6E', 'F9E7ED', '4F1F31', '3A9D8F', 'E0A030', '6A7FB0', 'DDA5B8'),
};

const SANS = '맑은 고딕';
const SERIF = '바탕';

export function themeOf(team: TeamId, style?: DesignStyle): Theme {
  const swatch = (style?.palette && PALETTE_SWATCHES[style.palette]) || TEAM_SWATCHES[team];
  return {
    ...swatch,
    ink: '1F2328',
    muted: '6B7280',
    good: '2E7D4F',
    warn: 'B45309',
    font: SANS,
    headFont: style?.fonts === 'classic' ? SERIF : SANS,
  };
}
