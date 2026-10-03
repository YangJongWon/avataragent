import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IBorderOptions,
} from 'docx';
import type { Block, ChartData, DocSpec } from '../../shared/design.ts';
import { captionOf } from './spec.ts';
import type { Theme } from './theme.ts';

const NONE: IBorderOptions = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };
const thin = (color: string): IBorderOptions => ({ style: BorderStyle.SINGLE, size: 4, color });
const fill = (color: string) => ({ type: ShadingType.CLEAR, color: 'auto', fill: color });
const full = { size: 100, type: WidthType.PERCENTAGE };
const pct = (size: number) => ({ size, type: WidthType.PERCENTAGE });
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

const text = (s: string, opts: { bold?: boolean; color?: string; size?: number; italics?: boolean } = {}) => new TextRun({ text: s, ...opts });
const para = (s: string, opts: ConstructorParameters<typeof Paragraph>[0] & object = {}) =>
  new Paragraph({ spacing: { after: 120 }, ...opts, children: [text(s)] });

function grid(rows: string[][], header: string[] | null, theme: Theme) {
  const cols = Math.max(header?.length ?? 0, ...rows.map((r) => r.length));
  const width = pct(Math.floor(100 / Math.max(cols, 1)));
  const line = thin('E5E7EB');
  return new Table({
    width: full,
    borders: { top: line, bottom: line, left: NONE, right: NONE, insideHorizontal: line, insideVertical: NONE },
    rows: [
      ...(header
        ? [
            new TableRow({
              tableHeader: true,
              children: header.map(
                (h) =>
                  new TableCell({ width, shading: fill(theme.accent), margins: cellMargins, children: [new Paragraph({ children: [text(h, { bold: true, color: 'FFFFFF' })] })] }),
              ),
            }),
          ]
        : []),
      ...rows.map(
        (r, ri) =>
          new TableRow({
            children: Array.from({ length: cols }, (_, i) =>
              new TableCell({
                width,
                margins: cellMargins,
                shading: ri % 2 ? fill('FAFAFA') : undefined,
                children: [new Paragraph({ children: [text(r[i] ?? '')] })],
              }),
            ),
          }),
      ),
    ],
  });
}

/** Word has no native chart here; a bar of block characters keeps the comparison readable and editable. */
function chartTable(chart: ChartData, theme: Theme) {
  const all = chart.series.flatMap((s) => s.values.map(Math.abs));
  const max = Math.max(...all, 1);
  const total = chart.series[0].values.reduce((a, b) => a + b, 0) || 1;
  const unit = chart.unit ?? '';
  const rows: TableRow[] = [];
  chart.labels.forEach((label, i) => {
    chart.series.forEach((s, si) => {
      const v = s.values[i];
      const bar = '█'.repeat(Math.max(1, Math.round((Math.abs(v) / max) * 24)));
      const value = `${v.toLocaleString('ko-KR')}${unit}${chart.kind === 'pie' ? ` (${Math.round((v / total) * 100)}%)` : ''}`;
      rows.push(
        new TableRow({
          children: [
            new TableCell({ width: pct(28), margins: cellMargins, children: [new Paragraph({ children: [text(si === 0 ? label : '')] })] }),
            new TableCell({
              width: pct(52),
              margins: cellMargins,
              children: [new Paragraph({ children: [text(bar, { color: theme.chart[si % theme.chart.length] }), ...(chart.series.length > 1 ? [text(`  ${s.name}`, { color: theme.muted, size: 16 })] : [])] })],
            }),
            new TableCell({ width: pct(20), margins: cellMargins, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [text(value, { bold: true })] })] }),
          ],
        }),
      );
    });
  });
  return new Table({ width: full, borders: noBorders, rows });
}

function card(children: Paragraph[], shade: string, edge: string) {
  return new Table({
    width: full,
    borders: { ...noBorders, left: { style: BorderStyle.SINGLE, size: 24, color: edge } },
    rows: [new TableRow({ children: [new TableCell({ shading: fill(shade), margins: { top: 140, bottom: 140, left: 240, right: 240 }, children })] })],
  });
}

const gap = () => new Paragraph({ spacing: { after: 120 }, children: [] });

function block(b: Block, theme: Theme, prev: Block | undefined): (Paragraph | Table)[] {
  switch (b.type) {
    case 'heading':
      return [new Paragraph({ heading: HeadingLevel.HEADING_1, children: [text(b.text)] })];
    case 'subheading':
      return [new Paragraph({ heading: HeadingLevel.HEADING_2, children: [text(b.text)] })];
    case 'paragraph':
      return [para(b.text)];
    case 'bullets':
      return b.items.map((item, i) => (b.ordered ? para(`${i + 1}. ${item}`, { indent: { left: 360 } }) : para(item, { bullet: { level: 0 } })));
    case 'kpis': {
      const width = pct(Math.floor(100 / b.items.length));
      return [
        new Table({
          width: full,
          borders: { ...noBorders, insideVertical: { style: BorderStyle.SINGLE, size: 24, color: 'FFFFFF' } },
          rows: [
            new TableRow({
              children: b.items.map(
                (k) =>
                  new TableCell({
                    width,
                    shading: fill(theme.soft),
                    margins: { top: 160, bottom: 160, left: 200, right: 200 },
                    children: [
                      new Paragraph({ children: [text(k.value, { bold: true, size: 40, color: theme.accent })] }),
                      new Paragraph({ children: [text(k.label, { bold: true })] }),
                      ...(k.note ? [new Paragraph({ children: [text(k.note, { size: 18, color: theme.muted })] })] : []),
                    ],
                  }),
              ),
            }),
          ],
        }),
        gap(),
      ];
    }
    case 'callout': {
      const [shade, edge] = b.tone === 'good' ? ['ECFDF3', theme.good] : b.tone === 'warn' ? ['FFF7ED', theme.warn] : ['EEF2FF', '6366F1'];
      return [
        card([...(b.title ? [new Paragraph({ children: [text(b.title, { bold: true, color: edge })] })] : []), new Paragraph({ children: [text(b.text)] })], shade, edge),
        gap(),
      ];
    }
    case 'quote':
      return [
        new Paragraph({
          indent: { left: 400 },
          border: { left: { style: BorderStyle.SINGLE, size: 18, color: theme.accent, space: 12 } },
          spacing: { before: 120, after: 160 },
          children: [text(b.text, { italics: true }), ...(b.by ? [text(`  — ${b.by}`, { color: theme.muted })] : [])],
        }),
      ];
    case 'table': {
      const caption = captionOf(b.table.title, prev);
      return [
        ...(caption ? [new Paragraph({ spacing: { before: 120, after: 80 }, children: [text(caption, { bold: true })] })] : []),
        grid(b.table.rows, b.table.columns, theme),
        gap(),
      ];
    }
    case 'chart':
      return [
        ...(b.chart.title ? [new Paragraph({ spacing: { before: 120, after: 80 }, children: [text(`📊 ${b.chart.title}`, { bold: true })] })] : []),
        chartTable(b.chart, theme),
        gap(),
      ];
    case 'timeline':
      return [
        new Table({
          width: full,
          borders: { ...noBorders, insideHorizontal: thin('E5E7EB') },
          rows: b.items.map(
            (i) =>
              new TableRow({
                children: [
                  new TableCell({ width: pct(22), margins: cellMargins, borders: { left: { style: BorderStyle.SINGLE, size: 24, color: theme.accent } }, children: [new Paragraph({ children: [text(i.when, { bold: true, color: theme.accent })] })] }),
                  new TableCell({ width: pct(78), margins: cellMargins, children: [new Paragraph({ children: [text(i.what)] })] }),
                ],
              }),
          ),
        }),
        gap(),
      ];
    case 'compare':
      return [
        new Table({
          width: full,
          borders: { ...noBorders, insideVertical: { style: BorderStyle.SINGLE, size: 24, color: 'FFFFFF' } },
          rows: [
            new TableRow({
              children: [b.left, b.right].map(
                (s) =>
                  new TableCell({
                    width: pct(50),
                    shading: fill(theme.soft),
                    margins: { top: 140, bottom: 140, left: 200, right: 200 },
                    children: [new Paragraph({ children: [text(s.title, { bold: true, color: theme.accent })] }), ...s.items.map((i) => para(i, { bullet: { level: 0 } }))],
                  }),
              ),
            }),
          ],
        }),
        gap(),
      ];
  }
}

export async function renderDocx(doc: DocSpec, theme: Theme): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ spacing: { after: 80 }, border: { left: { style: BorderStyle.SINGLE, size: 48, color: theme.accent, space: 12 } }, children: [text(doc.title, { bold: true, size: 48 })] }),
    new Paragraph({ spacing: { after: 360 }, indent: { left: 0 }, children: [text(doc.subtitle, { color: theme.muted })] }),
  ];
  if (doc.summary.length) {
    children.push(
      card([new Paragraph({ children: [text('핵심 요약', { bold: true, color: theme.accent })] }), ...doc.summary.map((s) => para(s, { bullet: { level: 0 } }))], theme.soft, theme.accent),
      gap(),
    );
  }
  doc.blocks.forEach((b, i) => children.push(...block(b, theme, doc.blocks[i - 1])));
  if (doc.sources.length) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [text('출처')] }));
    doc.sources.forEach((s, i) => children.push(new Paragraph({ spacing: { after: 60 }, children: [text(`${i + 1}. ${s}`, { size: 18, color: theme.muted })] })));
  }

  const document = new Document({
    creator: 'AI 에이전트 오피스',
    title: doc.title,
    styles: {
      default: { document: { run: { font: theme.font, size: 21, color: theme.ink }, paragraph: { spacing: { line: 300 } } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 30, bold: true, color: theme.accent }, paragraph: { spacing: { before: 360, after: 120 }, keepNext: true } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 24, bold: true }, paragraph: { spacing: { before: 240, after: 80 }, keepNext: true } },
      ],
    },
    sections: [
      {
        properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        footers: {
          default: new Footer({
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], color: theme.muted, size: 16 })] })],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(document);
}
