import PptxGenJS from 'pptxgenjs';
import type { DeckSpec } from '../../shared/design.ts';
import { bulletsHeight, fitDeck, heightFor, linesFor, SLIDE, type PlannedSlide } from './fit.ts';
import type { Theme } from './theme.ts';

type Pptx = InstanceType<typeof PptxGenJS>;
type PSlide = ReturnType<Pptx['addSlide']>;

const { W, H, X, TOP, BODY_H: CH } = SLIDE;
const CW = SLIDE.CW;

/** Blends two hex colors; t=0 gives a, t=1 gives b. */
function mix(a: string, b: string, t: number) {
  const ch = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  return [0, 2, 4].map((i) => Math.round(ch(a, i) * (1 - t) + ch(b, i) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
}

const SHADOW = { type: 'outer', color: '000000', opacity: 0.1, blur: 10, offset: 2, angle: 90 } as const;

/** White raised card: content sits on these, the tinted page shows around them. */
function card(pptx: Pptx, slide: PSlide, x: number, y: number, w: number, h: number, fill = 'FFFFFF') {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h, fill: { color: fill }, line: { color: fill }, rectRadius: 0.15, shadow: { ...SHADOW } });
}

/** The deck's motif: numbered accent circles, repeated on rows, timelines, dividers and the cover. */
function circle(pptx: Pptx, slide: PSlide, x: number, y: number, d: number, label: string, fill: string, color: string, theme: Theme) {
  slide.addShape(pptx.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill } });
  if (label) slide.addText(label, { x, y, w: d, h: d, margin: 0, align: 'center', valign: 'middle', fontFace: theme.headFont, fontSize: d * 26, bold: true, color, isTextBox: true });
}

function body(pptx: Pptx, slide: PSlide, s: PlannedSlide, theme: Theme) {
  const f = theme.font;
  const b = s.block!;
  const pt = s.pt;
  const text = { fontFace: f, color: theme.ink, isTextBox: true } as const;
  switch (b.type) {
    case 'heading':
    case 'subheading':
    case 'paragraph':
      slide.addText(b.text, { ...text, x: X, y: TOP, w: CW, h: CH, fontSize: pt, valign: 'top' });
      return;
    case 'bullets': {
      if (s.rows) {
        const rowH = Math.min(1.1, (CH - 0.1) / b.items.length);
        b.items.forEach((item, i) => {
          const y = TOP + i * rowH;
          const h = rowH - 0.2;
          card(pptx, slide, X, y, CW, h);
          circle(pptx, slide, X + 0.25, y + (h - 0.55) / 2, 0.55, b.ordered === false ? '' : String(i + 1), theme.accent, 'FFFFFF', theme);
          slide.addText(item, { ...text, x: X + 1.1, y, w: CW - 1.4, h, fontSize: pt, valign: 'middle', margin: 0 });
        });
        return;
      }
      slide.addText(
        b.items.map((t, i) => ({ text: t, options: { bullet: b.ordered ? { type: 'number' as const } : { code: '25CF' }, paraSpaceAfter: 10, breakLine: i < b.items.length - 1 } })),
        { ...text, x: X, y: TOP, w: CW, h: CH, fontSize: pt, valign: 'top' },
      );
      return;
    }
    case 'kpis': {
      const n = b.items.length;
      const gap = 0.3;
      const w = (CW - gap * (n - 1)) / n;
      const y = TOP + 0.5;
      b.items.forEach((k, i) => {
        const x = X + i * (w + gap);
        card(pptx, slide, x, y, w, 3.8);
        slide.addText(k.value, { ...text, x: x + 0.2, y: y + 0.45, w: w - 0.4, h: 1.5, fontFace: theme.headFont, fontSize: n > 3 ? 40 : 54, bold: true, color: theme.accent, align: 'center', valign: 'middle', fit: 'shrink' });
        slide.addText(k.label, { ...text, x: x + 0.2, y: y + 2.0, w: w - 0.4, h: 0.9, fontSize: 16, bold: true, align: 'center', valign: 'top' });
        if (k.note) slide.addText(k.note, { ...text, x: x + 0.2, y: y + 2.85, w: w - 0.4, h: 0.85, fontSize: 12, color: theme.muted, align: 'center', valign: 'top' });
      });
      return;
    }
    case 'callout': {
      const color = b.tone === 'good' ? theme.good : b.tone === 'warn' ? theme.warn : theme.accent;
      const textW = CW - 3.2;
      const textH = heightFor(linesFor(b.text, textW, pt), pt) + (b.title ? heightFor(1, pt - 2) + 0.12 : 0);
      const h = Math.min(CH - 0.4, Math.max(1.9, textH + 1.0));
      const y = TOP + 0.3;
      card(pptx, slide, X + 0.6, y, CW - 1.2, h);
      circle(pptx, slide, X + 1.1, y + h / 2 - 0.4, 0.8, b.tone === 'warn' ? '!' : '✓', color, 'FFFFFF', theme);
      slide.addText(
        [...(b.title ? [{ text: b.title, options: { bold: true, color, fontSize: pt - 2, breakLine: true } }] : []), { text: b.text, options: { fontSize: pt, color: theme.ink } }],
        { ...text, x: X + 2.3, y, w: textW, h, valign: 'middle', margin: 0, paraSpaceAfter: 8 },
      );
      return;
    }
    case 'quote':
      slide.addText('“', { ...text, x: X + 0.1, y: 0.7, w: 2, h: 2, margin: 0, fontFace: 'Georgia', fontSize: 180, bold: true, color: theme.accent, valign: 'top' });
      slide.addText(
        [
          { text: b.text, options: { fontSize: pt, bold: true, breakLine: Boolean(b.by) } },
          ...(b.by ? [{ text: `— ${b.by}`, options: { fontSize: 16, color: theme.soft, paraSpaceBefore: 18 } }] : []),
        ],
        { ...text, x: X + 0.3, y: 2.3, w: CW - 4.2, h: 3.6, margin: 0, valign: 'top', fontFace: theme.headFont, color: 'FFFFFF', lineSpacingMultiple: 1.2 },
      );
      return;
    case 'table': {
      const { columns, rows } = b.table;
      slide.addTable(
        [
          columns.map((c) => ({ text: c, options: { bold: true, color: 'FFFFFF', fill: { color: theme.accent } } })),
          ...rows.map((r, ri) => columns.map((_, i) => ({ text: r[i] ?? '', options: { fill: { color: ri % 2 ? mix(theme.soft, 'FFFFFF', 0.45) : 'FFFFFF' } } }))),
        ],
        {
          x: X,
          y: TOP,
          w: CW,
          colW: columns.map(() => CW / columns.length),
          ...(pt >= 18 ? { rowH: Math.min(0.75, CH / (rows.length + 1)) } : {}),
          fontFace: f,
          fontSize: pt,
          color: theme.ink,
          border: { type: 'solid', pt: 0.5, color: 'E5E7EB' },
          valign: 'middle',
          autoPage: false,
        },
      );
      return;
    }
    case 'chart': {
      const c = b.chart;
      const type = c.kind === 'line' ? pptx.ChartType.line : c.kind === 'pie' ? pptx.ChartType.doughnut : pptx.ChartType.bar;
      const single = c.series.length === 1 && c.kind === 'bar';
      card(pptx, slide, X, TOP - 0.1, CW, CH);
      slide.addChart(
        type,
        c.series.map((x) => ({ name: x.name, labels: c.labels, values: x.values })),
        {
          x: X + 0.3,
          y: TOP + 0.1,
          w: CW - 0.6,
          h: CH - 0.45,
          chartColors: single ? c.labels.map((_, i) => (i === c.series[0].values.indexOf(Math.max(...c.series[0].values)) ? theme.accent : theme.chart.at(-1)!)) : theme.chart,
          showValue: c.kind !== 'pie',
          showPercent: c.kind === 'pie',
          showLegend: c.kind === 'pie' || c.series.length > 1,
          legendPos: c.kind === 'pie' ? 'r' : 'b',
          legendFontFace: f,
          legendFontSize: 14,
          catAxisLabelFontFace: f,
          catAxisLabelFontSize: 14,
          catAxisLabelColor: theme.muted,
          valAxisLabelFontFace: f,
          valAxisLabelFontSize: 12,
          valAxisLabelColor: theme.muted,
          valAxisLabelFormatCode: '#,##0',
          dataLabelFontFace: f,
          dataLabelFontSize: 13,
          dataLabelColor: theme.ink,
          dataLabelFormatCode: c.unit ? `#,##0"${c.unit.replace(/"/g, '')}"` : '#,##0.##',
          valGridLine: { color: 'E5E7EB', size: 0.5 },
          catGridLine: { style: 'none' },
          barGapWidthPct: 60,
          lineSize: 3,
          lineDataSymbolSize: 9,
          holeSize: 55,
        },
      );
      return;
    }
    case 'timeline': {
      const n = b.items.length;
      const step = CW / n;
      const lineY = TOP + 1.9;
      slide.addShape(pptx.ShapeType.line, { x: X + step / 2, y: lineY, w: CW - step, h: 0, line: { color: mix(theme.soft, theme.accent, 0.3), width: 6 } });
      b.items.forEach((item, i) => {
        const cx = X + step * (i + 0.5);
        circle(pptx, slide, cx - 0.32, lineY - 0.32, 0.64, String(i + 1), theme.accent, 'FFFFFF', theme);
        slide.addText(item.when, { ...text, x: cx - step / 2, y: lineY - 1.25, w: step, h: 0.8, fontSize: pt + 2, bold: true, color: theme.accent, align: 'center', valign: 'bottom' });
        slide.addText(item.what, { ...text, x: cx - step / 2 + 0.1, y: lineY + 0.5, w: step - 0.2, h: 2.6, fontSize: pt, align: 'center', valign: 'top' });
      });
      return;
    }
    case 'compare': {
      const w = (CW - 1.2) / 2;
      const listH = Math.max(bulletsHeight(b.left.items, pt, w - 0.9), bulletsHeight(b.right.items, pt, w - 0.9));
      const h = Math.min(CH - 0.2, Math.max(2.8, listH + 1.7));
      [b.left, b.right].forEach((side, i) => {
        const x = X + i * (w + 1.2);
        card(pptx, slide, x, TOP, w, h);
        slide.addText(side.title, { ...text, x: x + 0.3, y: TOP + 0.25, w: w - 0.6, h: 0.7, fontFace: theme.headFont, fontSize: 22, bold: true, color: i ? theme.accent : theme.ink });
        slide.addText(
          side.items.map((t, j) => ({ text: t, options: { bullet: { code: '25CF' }, paraSpaceAfter: 8, breakLine: j < side.items.length - 1 } })),
          { ...text, x: x + 0.3, y: TOP + 1.1, w: w - 0.6, h: h - 1.4, fontSize: pt, valign: 'top' },
        );
      });
      circle(pptx, slide, X + w + 0.25, TOP + h / 2 - 0.35, 0.7, 'VS', theme.dark, 'FFFFFF', theme);
      return;
    }
  }
}

function darkSlide(pptx: Pptx, theme: Theme) {
  const slide = pptx.addSlide();
  slide.background = { color: theme.dark };
  slide.addShape(pptx.ShapeType.ellipse, { x: W - 4.2, y: -1.6, w: 6, h: 6, fill: { color: theme.accent, transparency: 35 }, line: { color: theme.accent, transparency: 100 } });
  slide.addShape(pptx.ShapeType.ellipse, { x: W - 2.2, y: H - 2.6, w: 3.2, h: 3.2, fill: { color: theme.accent, transparency: 65 }, line: { color: theme.accent, transparency: 100 } });
  return slide;
}

/** Content page: a faint palette tint with two large motif circles bleeding off the right edge, behind everything. */
function lightSlide(pptx: Pptx, theme: Theme) {
  const slide = pptx.addSlide({ masterName: 'BODY' });
  const faint = (transparency: number) => ({ fill: { color: theme.accent, transparency }, line: { color: theme.accent, transparency: 100 } });
  slide.addShape(pptx.ShapeType.ellipse, { x: W - 3.4, y: H - 3.0, w: 5.2, h: 5.2, ...faint(93) });
  slide.addShape(pptx.ShapeType.ellipse, { x: W - 1.5, y: -0.9, w: 2.6, h: 2.6, ...faint(88) });
  return slide;
}

function heading(slide: PSlide, title: string, pt: number, kicker: string, theme: Theme) {
  if (kicker) slide.addText(kicker, { x: X, y: 0.3, w: CW, h: 0.35, fontFace: theme.font, fontSize: 12, bold: true, color: theme.accent, charSpacing: 1, margin: 0, isTextBox: true });
  slide.addText(title, { x: X, y: kicker ? 0.6 : 0.45, w: CW, h: 0.95, fontFace: theme.headFont, fontSize: pt, bold: true, color: theme.ink, valign: 'middle', margin: 0, fit: 'shrink', isTextBox: true });
}

export async function renderPptx(deck: DeckSpec, theme: Theme): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = deck.title;
  pptx.company = 'AI 에이전트 오피스';
  pptx.theme = { headFontFace: theme.headFont, bodyFontFace: theme.font };
  pptx.defineSlideMaster({
    title: 'BODY',
    background: { color: mix(theme.soft, 'FFFFFF', 0.55) },
    slideNumber: { x: W - 1.0, y: H - 0.5, w: 0.6, h: 0.3, fontFace: theme.font, fontSize: 10, color: theme.muted },
  });

  const cover = darkSlide(pptx, theme);
  cover.addText(deck.title, { x: X + 0.2, y: 2.0, w: CW - 3.5, h: 2.4, fontFace: theme.headFont, fontSize: 40, bold: true, color: 'FFFFFF', valign: 'bottom', fit: 'shrink', isTextBox: true });
  cover.addText(deck.subtitle, { x: X + 0.2, y: 4.6, w: CW - 3.5, h: 0.8, fontFace: theme.font, fontSize: 18, color: theme.soft, isTextBox: true });

  const { slides } = fitDeck(deck);
  let section = 0;
  let sectionTitle = '';
  for (const s of slides) {
    if (!s.block) {
      section++;
      sectionTitle = s.title;
      const divider = darkSlide(pptx, theme);
      circle(pptx, divider, X + 0.2, 2.75, 1.0, String(section), theme.accent, 'FFFFFF', theme);
      divider.addText(s.title, { x: X + 1.5, y: 2.5, w: CW - 5, h: 1.5, fontFace: theme.headFont, fontSize: 36, bold: true, color: 'FFFFFF', valign: 'middle', isTextBox: true });
      if (s.notes) divider.addNotes(s.notes);
      continue;
    }
    const kicker = section && sectionTitle !== s.title ? `${String(section).padStart(2, '0')}  ${sectionTitle}` : '';
    const dark = s.block.type === 'quote';
    const slide = dark ? darkSlide(pptx, theme) : lightSlide(pptx, theme);
    if (!dark) heading(slide, s.title, s.titlePt, kicker, theme);
    body(pptx, slide, s, theme);
    if (s.notes) slide.addNotes(s.notes);
  }

  if (deck.sources.length) {
    const slide = lightSlide(pptx, theme);
    heading(slide, '출처', 30, '', theme);
    slide.addText(
      deck.sources.slice(0, 14).map((t, i, all) => ({ text: t, options: { bullet: { type: 'number' as const }, paraSpaceAfter: 6, breakLine: i < all.length - 1 } })),
      { x: X, y: TOP, w: CW, h: CH, fontFace: theme.font, fontSize: 13, color: theme.muted, valign: 'top', isTextBox: true },
    );
  }
  return (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
}
