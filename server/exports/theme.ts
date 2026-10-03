import type { TeamId } from '../../shared/types.ts';

export interface Theme {
  accent: string;
  soft: string;
  ink: string;
  muted: string;
  good: string;
  warn: string;
  font: string;
  chart: string[];
}

const ACCENTS: Record<TeamId, [string, string]> = {
  dev: ['4F46B8', 'ECEBFA'],
  hr: ['1F6FB2', 'E6F0F9'],
  mgmt: ['8A5A1F', 'F5ECDD'],
  support: ['2E7D4F', 'E4F2E9'],
  welfare: ['B44A6E', 'F9E7ED'],
};

/** Hex without '#', the form docx and pptxgenjs expect. */
export function themeOf(team: TeamId): Theme {
  const [accent, soft] = ACCENTS[team];
  return {
    accent,
    soft,
    ink: '1F2328',
    muted: '6B7280',
    good: '2E7D4F',
    warn: 'B45309',
    font: '맑은 고딕',
    chart: [accent, 'E0A030', '3A9D8F', 'C2554D', '7C8BA1'],
  };
}
