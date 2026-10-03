import type { Block, ChartData, DocSpec } from '../../shared/design.ts';
import { captionOf } from './spec.ts';
import type { Theme } from './theme.ts';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const fmt = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });

export function chartSvg(chart: ChartData, theme: Theme) {
  const W = 640;
  const H = 300;
  const color = (i: number) => `#${theme.chart[i % theme.chart.length]}`;
  const unit = chart.unit ?? '';
  if (chart.kind === 'pie') {
    const values = chart.series[0].values;
    const total = values.reduce((a, b) => a + b, 0) || 1;
    let angle = -Math.PI / 2;
    const cx = 150;
    const cy = H / 2;
    const r = 120;
    const parts = values.map((v, i) => {
      const sweep = (v / total) * Math.PI * 2;
      const [x1, y1] = [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
      angle += sweep;
      const [x2, y2] = [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
      const path =
        values.length === 1
          ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color(i)}"/>`
          : `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2},${y2} Z" fill="${color(i)}" stroke="#fff" stroke-width="2"/>`;
      const legend = `<rect x="310" y="${40 + i * 26}" width="14" height="14" rx="3" fill="${color(i)}"/><text x="332" y="${52 + i * 26}">${esc(chart.labels[i])} · ${fmt(v)}${esc(unit)} (${Math.round((v / total) * 100)}%)</text>`;
      return path + legend;
    });
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">${parts.join('')}</svg>`;
  }

  const pad = { l: 56, r: 16, t: 16, b: 48 };
  const all = chart.series.flatMap((s) => s.values);
  const max = Math.max(0, ...all);
  const min = Math.min(0, ...all);
  const span = max - min || 1;
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const y = (v: number) => pad.t + plotH - ((v - min) / span) * plotH;
  const step = plotW / chart.labels.length;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const v = min + span * f;
    return `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="#e5e7eb"/><text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end" class="axis">${fmt(v)}</text>`;
  });
  const labels = chart.labels.map(
    (l, i) => `<text x="${pad.l + step * (i + 0.5)}" y="${H - pad.b + 18}" text-anchor="middle" class="axis">${esc(l.length > 10 ? `${l.slice(0, 9)}…` : l)}</text>`,
  );
  let marks: string[];
  if (chart.kind === 'line') {
    marks = chart.series.map((s, si) => {
      const pts = s.values.map((v, i) => `${pad.l + step * (i + 0.5)},${y(v)}`);
      const dots = s.values.map((v, i) => `<circle cx="${pad.l + step * (i + 0.5)}" cy="${y(v)}" r="4" fill="${color(si)}"/>`);
      return `<polyline points="${pts.join(' ')}" fill="none" stroke="${color(si)}" stroke-width="3"/>${dots.join('')}`;
    });
  } else {
    const n = chart.series.length;
    const bw = (step * 0.7) / n;
    marks = chart.series.flatMap((s, si) =>
      s.values.map((v, i) => {
        const x = pad.l + step * i + step * 0.15 + bw * si;
        const top = Math.min(y(v), y(0));
        const h = Math.abs(y(v) - y(0));
        return `<rect x="${x}" y="${top}" width="${bw - 2}" height="${Math.max(h, 1)}" rx="3" fill="${color(si)}"/><text x="${x + bw / 2 - 1}" y="${top - 4}" text-anchor="middle" class="val">${fmt(v)}</text>`;
      }),
    );
  }
  const legend =
    chart.series.length > 1
      ? chart.series.map((s, i) => `<rect x="${pad.l + i * 120}" y="${H - 16}" width="12" height="12" rx="2" fill="${color(i)}"/><text x="${pad.l + i * 120 + 18}" y="${H - 6}" class="axis">${esc(s.name)}</text>`)
      : [];
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">${grid.join('')}${marks.join('')}${labels.join('')}${legend.join('')}</svg>`;
}

function block(b: Block, theme: Theme, prev: Block | undefined): string {
  switch (b.type) {
    case 'heading':
      return `<h2>${esc(b.text)}</h2>`;
    case 'subheading':
      return `<h3>${esc(b.text)}</h3>`;
    case 'paragraph':
      return `<p>${esc(b.text)}</p>`;
    case 'bullets': {
      const tag = b.ordered ? 'ol' : 'ul';
      return `<${tag}>${b.items.map((i) => `<li>${esc(i)}</li>`).join('')}</${tag}>`;
    }
    case 'kpis':
      return `<div class="kpis">${b.items
        .map((k) => `<div class="kpi"><div class="kpi-value">${esc(k.value)}</div><div class="kpi-label">${esc(k.label)}</div>${k.note ? `<div class="kpi-note">${esc(k.note)}</div>` : ''}</div>`)
        .join('')}</div>`;
    case 'callout':
      return `<div class="callout ${b.tone}">${b.title ? `<b>${esc(b.title)}</b>` : ''}<p>${esc(b.text)}</p></div>`;
    case 'quote':
      return `<blockquote>${esc(b.text)}${b.by ? `<cite>— ${esc(b.by)}</cite>` : ''}</blockquote>`;
    case 'table': {
      const caption = captionOf(b.table.title, prev);
      return `<figure>${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}<table><thead><tr>${b.table.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${b.table.rows
        .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table></figure>`;
    }
    case 'chart':
      return `<figure>${b.chart.title ? `<figcaption>${esc(b.chart.title)}</figcaption>` : ''}${chartSvg(b.chart, theme)}</figure>`;
    case 'timeline':
      return `<ol class="timeline">${b.items.map((i) => `<li><span class="when">${esc(i.when)}</span><span>${esc(i.what)}</span></li>`).join('')}</ol>`;
    case 'compare':
      return `<div class="compare">${[b.left, b.right]
        .map((s) => `<div><h4>${esc(s.title)}</h4><ul>${s.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`)
        .join('')}</div>`;
  }
}

/** A standalone print page: the browser's "PDF로 저장" turns it into the PDF. */
export function renderHtml(doc: DocSpec, theme: Theme, autoPrint: boolean) {
  const a = `#${theme.accent}`;
  const css = `
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
body { font-family: 'Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; color: #${theme.ink}; line-height: 1.65; margin: 0; font-size: 10.5pt; }
main { max-width: 780px; margin: 0 auto; padding: 32px 24px; }
header.cover { border-left: 8px solid ${a}; padding: 8px 0 8px 18px; margin-bottom: 28px; }
header.cover h1 { margin: 0; font-size: 24pt; line-height: 1.3; }
header.cover .sub { color: #${theme.muted}; margin-top: 6px; }
.summary { background: #${theme.soft}; border-radius: 10px; padding: 14px 20px; margin-bottom: 24px; }
.summary b { color: ${a}; }
h2 { font-size: 15pt; color: ${a}; border-bottom: 2px solid #${theme.soft}; padding-bottom: 4px; margin: 28px 0 10px; break-after: avoid; }
h3 { font-size: 12pt; margin: 18px 0 6px; break-after: avoid; }
h4 { margin: 0 0 6px; color: ${a}; }
ul, ol { padding-left: 22px; }
figure { margin: 16px 0; break-inside: avoid; }
figcaption { font-weight: 700; margin-bottom: 6px; }
table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
th { background: ${a}; color: #fff; text-align: left; padding: 6px 8px; }
td { border-bottom: 1px solid #e5e7eb; padding: 6px 8px; vertical-align: top; }
tbody tr:nth-child(even) td { background: #fafafa; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 16px 0; break-inside: avoid; }
.kpi { border: 1px solid #e5e7eb; border-top: 4px solid ${a}; border-radius: 10px; padding: 12px 14px; }
.kpi-value { font-size: 20pt; font-weight: 800; color: ${a}; line-height: 1.2; }
.kpi-label { font-weight: 700; }
.kpi-note { color: #${theme.muted}; font-size: 9pt; }
.callout { border-radius: 10px; padding: 12px 16px; margin: 16px 0; background: #eef2ff; border-left: 5px solid #6366f1; break-inside: avoid; }
.callout.good { background: #ecfdf3; border-color: #${theme.good}; }
.callout.warn { background: #fff7ed; border-color: #${theme.warn}; }
.callout p { margin: 4px 0 0; }
blockquote { margin: 16px 0; padding: 8px 18px; border-left: 4px solid ${a}; color: #374151; font-style: italic; }
blockquote cite { display: block; font-style: normal; color: #${theme.muted}; margin-top: 4px; }
.timeline { list-style: none; padding: 0; border-left: 3px solid ${a}; margin: 16px 0 16px 8px; }
.timeline li { position: relative; padding: 4px 0 10px 20px; }
.timeline li::before { content: ''; position: absolute; left: -9px; top: 9px; width: 15px; height: 15px; border-radius: 50%; background: #fff; border: 3px solid ${a}; }
.timeline .when { font-weight: 700; color: ${a}; margin-right: 10px; }
.compare { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 16px 0; break-inside: avoid; }
.compare > div { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 14px; }
.chart { width: 100%; height: auto; font-size: 11px; }
.chart .axis { fill: #${theme.muted}; font-size: 11px; }
.chart .val { fill: #${theme.ink}; font-size: 10px; }
.sources { margin-top: 32px; font-size: 9pt; color: #${theme.muted}; }
.toolbar { position: sticky; top: 0; background: #fff; border-bottom: 1px solid #e5e7eb; padding: 10px 24px; text-align: right; }
.toolbar button { font: inherit; padding: 6px 14px; border-radius: 8px; border: 1px solid ${a}; background: ${a}; color: #fff; cursor: pointer; }
@media print { .toolbar { display: none; } main { padding: 0; } }
`;
  const summary = doc.summary.length ? `<section class="summary"><b>핵심 요약</b><ul>${doc.summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></section>` : '';
  const sources = doc.sources.length ? `<section class="sources"><h3>출처</h3><ol>${doc.sources.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></section>` : '';
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>${css}</style></head>
<body><div class="toolbar"><button onclick="print()">PDF로 저장 / 인쇄</button></div><main>
<header class="cover"><h1>${esc(doc.title)}</h1><div class="sub">${esc(doc.subtitle)}</div></header>
${summary}${doc.blocks.map((b, i) => block(b, theme, doc.blocks[i - 1])).join('\n')}${sources}
</main>${autoPrint ? '<script>addEventListener("load",()=>setTimeout(()=>print(),300))</script>' : ''}</body></html>`;
}
