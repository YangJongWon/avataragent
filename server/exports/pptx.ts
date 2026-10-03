import PptxGenJS from 'pptxgenjs';
import type { Block, DeckSpec } from '../../shared/design.ts';
import type { Theme } from './theme.ts';

type Pptx = InstanceType<typeof PptxGenJS>;
type PSlide = ReturnType<Pptx['addSlide']>;

const W = 13.333;
const X = 0.6;
const CW = W - X * 2;
const TOP = 1.55;
const CH = 5.35;

function body(pptx: Pptx, slide: PSlide, b: Block, theme: Theme) {
  const f = theme.font;
  switch (b.type) {
    case 'heading':
    case 'subheading':
    case 'paragraph':
      slide.addText(b.text, { x: X, y: TOP, w: CW, h: CH, fontFace: f, fontSize: 20, color: theme.ink, valign: 'top' });
      return;
    case 'bullets': {
      const size = b.items.length > 5 || b.items.some((i) => i.length > 80) ? 18 : 22;
      slide.addText(
        b.items.map((t) => ({ text: t, options: { bullet: b.ordered ? { type: 'number' as const } : { code: '25A0' }, paraSpaceAfter: 14 } })),
        { x: X, y: TOP, w: CW, h: CH, fontFace: f, fontSize: size, color: theme.ink, valign: 'top' },
      );
      return;
    }
    case 'kpis': {
      const n = b.items.length;
      const gap = 0.3;
      const w = (CW - gap * (n - 1)) / n;
      b.items.forEach((k, i) => {
        const x = X + i * (w + gap);
        slide.addShape(pptx.ShapeType.roundRect, { x, y: TOP + 0.6, w, h: 3.6, fill: { color: theme.soft }, line: { color: theme.soft }, rectRadius: 0.12 });
        slide.addShape(pptx.ShapeType.rect, { x, y: TOP + 0.6, w, h: 0.1, fill: { color: theme.accent }, line: { color: theme.accent } });
        slide.addText(k.value, { x, y: TOP + 1.0, w, h: 1.4, fontFace: f, fontSize: n > 3 ? 36 : 44, bold: true, color: theme.accent, align: 'center', fit: 'shrink' });
        slide.addText(k.label, { x: x + 0.2, y: TOP + 2.4, w: w - 0.4, h: 0.8, fontFace: f, fontSize: 18, bold: true, color: theme.ink, align: 'center', valign: 'top' });
        if (k.note) slide.addText(k.note, { x: x + 0.2, y: TOP + 3.15, w: w - 0.4, h: 0.9, fontFace: f, fontSize: 12, color: theme.muted, align: 'center', valign: 'top' });
      });
      return;
    }
    case 'callout': {
      const color = b.tone === 'good' ? theme.good : b.tone === 'warn' ? theme.warn : theme.accent;
      slide.addShape(pptx.ShapeType.roundRect, { x: X + 0.6, y: TOP + 0.5, w: CW - 1.2, h: 3.8, fill: { color: theme.soft }, line: { color, width: 2 }, rectRadius: 0.15 });
      slide.addText(
        [
          ...(b.title ? [{ text: b.title, options: { bold: true, color, fontSize: 22, breakLine: true } }] : []),
          { text: b.text, options: { fontSize: 24, color: theme.ink } },
        ],
        { x: X + 1.0, y: TOP + 0.7, w: CW - 2.0, h: 3.4, fontFace: f, valign: 'middle', paraSpaceAfter: 10 },
      );
      return;
    }
    case 'quote':
      slide.addText('“', { x: X, y: TOP - 0.2, w: 1.5, h: 1.5, fontFace: 'Georgia', fontSize: 96, color: theme.accent });
      slide.addText(
        [{ text: b.text, options: { italic: true, fontSize: 28, color: theme.ink, breakLine: Boolean(b.by) } }, ...(b.by ? [{ text: `— ${b.by}`, options: { fontSize: 16, color: theme.muted } }] : [])],
        { x: X + 1.2, y: TOP + 0.4, w: CW - 2.4, h: 4, fontFace: f, valign: 'middle' },
      );
      return;
    case 'table': {
      const { columns, rows } = b.table;
      const size = rows.length > 6 || columns.length > 5 ? 12 : 14;
      slide.addTable(
        [
          columns.map((c) => ({ text: c, options: { bold: true, color: 'FFFFFF', fill: { color: theme.accent } } })),
          ...rows.map((r, ri) => columns.map((_, i) => ({ text: r[i] ?? '', options: ri % 2 ? { fill: { color: 'F7F7F8' } } : {} }))),
        ],
        { x: X, y: TOP, w: CW, colW: columns.map(() => CW / columns.length), fontFace: f, fontSize: size, color: theme.ink, border: { type: 'solid', pt: 0.5, color: 'E5E7EB' }, valign: 'middle', autoPage: false },
      );
      return;
    }
    case 'chart': {
      const c = b.chart;
      const type = c.kind === 'line' ? pptx.ChartType.line : c.kind === 'pie' ? pptx.ChartType.doughnut : pptx.ChartType.bar;
      slide.addChart(
        type,
        c.series.map((s) => ({ name: s.name, labels: c.labels, values: s.values })),
        {
          x: X,
          y: TOP,
          w: CW,
          h: CH,
          chartColors: theme.chart,
          showValue: c.kind !== 'pie',
          showPercent: c.kind === 'pie',
          showLegend: c.kind === 'pie' || c.series.length > 1,
          legendPos: c.kind === 'pie' ? 'r' : 'b',
          legendFontFace: f,
          legendFontSize: 14,
          catAxisLabelFontFace: f,
          catAxisLabelFontSize: 14,
          valAxisLabelFontFace: f,
          valAxisLabelFontSize: 12,
          dataLabelFontFace: f,
          dataLabelFontSize: 12,
          dataLabelFormatCode: c.unit ? `#,##0"${c.unit.replace(/"/g, '')}"` : '#,##0.##',
          valGridLine: { color: 'E5E7EB', size: 0.5 },
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
      const lineY = TOP + 2.2;
      slide.addShape(pptx.ShapeType.line, { x: X, y: lineY, w: CW, h: 0, line: { color: theme.accent, width: 3 } });
      b.items.forEach((item, i) => {
        const cx = X + step * (i + 0.5);
        slide.addShape(pptx.ShapeType.ellipse, { x: cx - 0.17, y: lineY - 0.17, w: 0.34, h: 0.34, fill: { color: 'FFFFFF' }, line: { color: theme.accent, width: 3 } });
        slide.addText(item.when, { x: cx - step / 2, y: lineY - 1.1, w: step, h: 0.8, fontFace: f, fontSize: n > 6 ? 12 : 16, bold: true, color: theme.accent, align: 'center', valign: 'bottom' });
        slide.addText(item.what, { x: cx - step / 2 + 0.05, y: lineY + 0.4, w: step - 0.1, h: 2.6, fontFace: f, fontSize: n > 6 ? 11 : 14, color: theme.ink, align: 'center', valign: 'top' });
      });
      return;
    }
    case 'compare': {
      const w = (CW - 0.4) / 2;
      [b.left, b.right].forEach((s, i) => {
        const x = X + i * (w + 0.4);
        slide.addShape(pptx.ShapeType.roundRect, { x, y: TOP, w, h: CH - 0.2, fill: { color: theme.soft }, line: { color: theme.soft }, rectRadius: 0.12 });
        slide.addText(s.title, { x: x + 0.3, y: TOP + 0.2, w: w - 0.6, h: 0.7, fontFace: f, fontSize: 22, bold: true, color: theme.accent });
        slide.addText(
          s.items.map((t) => ({ text: t, options: { bullet: true, paraSpaceAfter: 10 } })),
          { x: x + 0.3, y: TOP + 1.0, w: w - 0.6, h: CH - 1.4, fontFace: f, fontSize: s.items.length > 5 ? 15 : 18, color: theme.ink, valign: 'top' },
        );
      });
      return;
    }
  }
}

export async function renderPptx(deck: DeckSpec, theme: Theme): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = deck.title;
  pptx.company = 'AI 에이전트 오피스';
  pptx.theme = { headFontFace: theme.font, bodyFontFace: theme.font };
  pptx.defineSlideMaster({
    title: 'BODY',
    background: { color: 'FFFFFF' },
    objects: [{ rect: { x: 0, y: 0, w: W, h: 0.12, fill: { color: theme.accent } } }],
    slideNumber: { x: W - 1.0, y: 7.0, w: 0.6, h: 0.3, fontFace: theme.font, fontSize: 10, color: theme.muted },
  });

  const cover = pptx.addSlide();
  cover.background = { color: theme.accent };
  cover.addText(deck.title, { x: X + 0.4, y: 2.2, w: CW - 0.8, h: 2.0, fontFace: theme.font, fontSize: 40, bold: true, color: 'FFFFFF', valign: 'bottom', fit: 'shrink' });
  cover.addShape(pptx.ShapeType.rect, { x: X + 0.4, y: 4.4, w: 1.2, h: 0.08, fill: { color: 'FFFFFF' }, line: { color: 'FFFFFF' } });
  cover.addText(deck.subtitle, { x: X + 0.4, y: 4.6, w: CW - 0.8, h: 0.8, fontFace: theme.font, fontSize: 18, color: 'FFFFFF' });

  for (const s of deck.slides) {
    if (!s.block) {
      const section = pptx.addSlide();
      section.background = { color: theme.soft };
      section.addShape(pptx.ShapeType.rect, { x: X, y: 3.0, w: 0.15, h: 1.5, fill: { color: theme.accent }, line: { color: theme.accent } });
      section.addText(s.title, { x: X + 0.4, y: 2.9, w: CW - 0.4, h: 1.7, fontFace: theme.font, fontSize: 36, bold: true, color: theme.ink, valign: 'middle' });
      if (s.notes) section.addNotes(s.notes);
      continue;
    }
    const slide = pptx.addSlide({ masterName: 'BODY' });
    slide.addText(s.title, { x: X, y: 0.4, w: CW, h: 0.95, fontFace: theme.font, fontSize: 28, bold: true, color: theme.ink, valign: 'middle', fit: 'shrink' });
    body(pptx, slide, s.block, theme);
    if (s.notes) slide.addNotes(s.notes);
  }

  if (deck.sources.length) {
    const slide = pptx.addSlide({ masterName: 'BODY' });
    slide.addText('출처', { x: X, y: 0.4, w: CW, h: 0.95, fontFace: theme.font, fontSize: 28, bold: true, color: theme.ink });
    slide.addText(
      deck.sources.slice(0, 14).map((t) => ({ text: t, options: { bullet: { type: 'number' as const }, paraSpaceAfter: 6 } })),
      { x: X, y: TOP, w: CW, h: CH, fontFace: theme.font, fontSize: 13, color: theme.muted, valign: 'top' },
    );
  }
  return (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
}
