import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import type { ChartData } from '../../shared/design.ts';
import type { Theme } from './theme.ts';

/**
 * The docx library cannot place charts, so the document is written with a marker paragraph per chart and the
 * native DrawingML chart parts (the same kind PowerPoint uses) are added to the package afterwards. Each chart
 * carries its data as an embedded workbook so "Edit Data" in Word works.
 */

const NS = {
  c: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
};
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CHART_TYPE = 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const chartMarker = (i: number) => `[[CHART:${i}]]`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const col = (i: number) => String.fromCharCode(65 + i);
const fillOf = (hex: string) => `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`;
const noLine = '<a:ln><a:noFill/></a:ln>';

function txPr(theme: Theme, size: number, color: string, bold = false) {
  const face = esc(theme.font);
  return `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${size * 100}" b="${bold ? 1 : 0}">${fillOf(color)}<a:latin typeface="${face}"/><a:ea typeface="${face}"/></a:defRPr></a:pPr><a:endParaRPr lang="ko-KR"/></a:p></c:txPr>`;
}

function numFormat(chart: ChartData) {
  const whole = chart.series.every((s) => s.values.every(Number.isInteger));
  const unit = chart.unit ? `"${chart.unit.replace(/"/g, '')}"` : '';
  return esc(`${whole ? '#,##0' : '#,##0.0'}${unit}`);
}

function strCache(ref: string, values: string[]) {
  return `<c:strRef><c:f>${ref}</c:f><c:strCache><c:ptCount val="${values.length}"/>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef>`;
}

function numCache(ref: string, values: number[]) {
  return `<c:numRef><c:f>${ref}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numCache></c:numRef>`;
}

function labels(theme: Theme, format: string, pos: string | null, percent: boolean) {
  return (
    `<c:dLbls><c:numFmt formatCode="${percent ? '0%' : format}" sourceLinked="0"/><c:spPr><a:noFill/>${noLine}</c:spPr>${txPr(theme, 9, percent ? 'FFFFFF' : theme.ink, true)}` +
    `${pos ? `<c:dLblPos val="${pos}"/>` : ''}<c:showLegendKey val="0"/><c:showVal val="${percent ? 0 : 1}"/><c:showCatName val="0"/><c:showSerName val="0"/>` +
    `<c:showPercent val="${percent ? 1 : 0}"/><c:showBubbleSize val="0"/></c:dLbls>`
  );
}

function axes(theme: Theme, format: string) {
  const axisLine = `<c:spPr><a:ln w="9525">${fillOf('D1D5DB')}</a:ln></c:spPr>`;
  return (
    `<c:catAx><c:axId val="5001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>` +
    `<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${axisLine}${txPr(theme, 9, theme.muted)}` +
    `<c:crossAx val="5002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>` +
    `<c:valAx><c:axId val="5002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>` +
    `<c:majorGridlines><c:spPr><a:ln w="6350">${fillOf('EEF0F3')}</a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="${format}" sourceLinked="0"/>` +
    `<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr>${noLine}</c:spPr>${txPr(theme, 8, theme.muted)}` +
    `<c:crossAx val="5001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`
  );
}

export function chartXml(chart: ChartData, theme: Theme) {
  const n = chart.labels.length;
  const cat = `<c:cat>${strCache(`Sheet1!$A$2:$A$${n + 1}`, chart.labels)}</c:cat>`;
  const format = numFormat(chart);
  const head = (si: number) => `<c:idx val="${si}"/><c:order val="${si}"/><c:tx>${strCache(`Sheet1!$${col(si + 1)}$1`, [chart.series[si].name])}</c:tx>`;
  const val = (si: number) => `<c:val>${numCache(`Sheet1!$${col(si + 1)}$2:$${col(si + 1)}$${n + 1}`, chart.series[si].values)}</c:val>`;
  let plot: string;

  if (chart.kind === 'pie') {
    const points = chart.labels
      .map((_, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr>${fillOf(theme.chart[i % theme.chart.length])}<a:ln w="19050">${fillOf('FFFFFF')}</a:ln></c:spPr></c:dPt>`)
      .join('');
    plot = `<c:doughnutChart><c:varyColors val="1"/><c:ser>${head(0)}${points}${labels(theme, format, null, true)}${cat}${val(0)}</c:ser><c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>`;
  } else if (chart.kind === 'line') {
    const series = chart.series
      .map((_, si) => {
        const color = theme.chart[si % theme.chart.length];
        return (
          `<c:ser>${head(si)}<c:spPr><a:ln w="31750" cap="rnd">${fillOf(color)}<a:round/></a:ln></c:spPr>` +
          `<c:marker><c:symbol val="circle"/><c:size val="7"/><c:spPr>${fillOf(color)}<a:ln w="12700">${fillOf('FFFFFF')}</a:ln></c:spPr></c:marker>` +
          `${chart.series.length === 1 ? labels(theme, format, 't', false) : ''}${cat}${val(si)}<c:smooth val="0"/></c:ser>`
        );
      })
      .join('');
    plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}<c:marker val="1"/><c:axId val="5001"/><c:axId val="5002"/></c:lineChart>${axes(theme, format)}`;
  } else {
    const single = chart.series.length === 1;
    const top = chart.series[0].values.indexOf(Math.max(...chart.series[0].values));
    const series = chart.series
      .map((s, si) => {
        const base = single ? theme.chart.at(-1)! : theme.chart[si % theme.chart.length];
        const points = single ? s.values.map((_, i) => `<c:dPt><c:idx val="${i}"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/><c:spPr>${fillOf(i === top ? theme.accent : base)}</c:spPr></c:dPt>`).join('') : '';
        return `<c:ser>${head(si)}<c:spPr>${fillOf(base)}</c:spPr><c:invertIfNegative val="0"/>${points}${labels(theme, format, 'outEnd', false)}${cat}${val(si)}</c:ser>`;
      })
      .join('');
    plot = `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series}<c:gapWidth val="${single ? 80 : 60}"/><c:axId val="5001"/><c:axId val="5002"/></c:barChart>${axes(theme, format)}`;
  }

  const legend = chart.kind === 'pie' || chart.series.length > 1 ? `<c:legend><c:legendPos val="${chart.kind === 'pie' ? 'r' : 'b'}"/><c:overlay val="0"/>${txPr(theme, 9, theme.ink)}</c:legend>` : '';
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="${NS.c}" xmlns:a="${NS.a}" xmlns:r="${NS.r}">` +
    `<c:date1904 val="0"/><c:lang val="ko-KR"/><c:roundedCorners val="0"/>` +
    `<c:chart><c:autoTitleDeleted val="1"/><c:plotArea><c:layout/>${plot}<c:spPr><a:noFill/>${noLine}</c:spPr></c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>` +
    `<c:spPr><a:noFill/>${noLine}</c:spPr>${txPr(theme, 9, theme.muted)}` +
    `<c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData></c:chartSpace>`
  );
}

async function chartWorkbook(chart: ChartData) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(['', ...chart.series.map((s) => s.name)]);
  chart.labels.forEach((label, i) => ws.addRow([label, ...chart.series.map((s) => s.values[i])]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Full text width of an A4 page with the 2cm margins renderDocx uses, in EMU. */
const WIDTH_EMU = (11906 - 1134 * 2) * 635;

function drawing(i: number, chart: ChartData) {
  const cy = Math.round(WIDTH_EMU * (chart.kind === 'pie' ? 0.42 : 0.48));
  return (
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="${NS.wp}"><wp:extent cx="${WIDTH_EMU}" cy="${cy}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${9000 + i}" name="${esc(chart.title || `차트 ${i + 1}`)}"/><wp:cNvGraphicFramePr/>` +
    `<a:graphic xmlns:a="${NS.a}"><a:graphicData uri="${NS.c}"><c:chart xmlns:c="${NS.c}" xmlns:r="${NS.r}" r:id="rIdChart${i + 1}"/></a:graphicData></a:graphic>` +
    `</wp:inline></w:drawing></w:r>`
  );
}

export async function injectCharts(file: Buffer, charts: ChartData[], theme: Theme): Promise<Buffer> {
  if (!charts.length) return file;
  const zip = await JSZip.loadAsync(file);
  let doc = await zip.file('word/document.xml')!.async('string');
  let rels = await zip.file('word/_rels/document.xml.rels')!.async('string');
  let types = await zip.file('[Content_Types].xml')!.async('string');

  for (const [i, chart] of charts.entries()) {
    const marker = esc(chartMarker(i));
    const run = new RegExp(`<w:r>(?:(?!</w:r>).)*?${marker.replace(/[[\]]/g, '\\$&')}(?:(?!</w:r>).)*?</w:r>`, 's');
    if (!run.test(doc)) throw new Error(`차트 자리를 찾지 못했어요 (${i + 1})`);
    doc = doc.replace(run, drawing(i, chart));
    const n = i + 1;
    zip.file(`word/charts/chart${n}.xml`, chartXml(chart, theme));
    zip.file(`word/embeddings/Microsoft_Excel_Worksheet${n}.xlsx`, await chartWorkbook(chart));
    zip.file(
      `word/charts/_rels/chart${n}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="${REL}/package" Target="../embeddings/Microsoft_Excel_Worksheet${n}.xlsx"/></Relationships>`,
    );
    rels = rels.replace('</Relationships>', `<Relationship Id="rIdChart${n}" Type="${REL}/chart" Target="charts/chart${n}.xml"/></Relationships>`);
    types = types.replace('</Types>', `<Override PartName="/word/charts/chart${n}.xml" ContentType="${CHART_TYPE}"/></Types>`);
  }
  if (!/Extension="xlsx"/.test(types)) types = types.replace('</Types>', `<Default Extension="xlsx" ContentType="${XLSX_TYPE}"/></Types>`);

  zip.file('word/document.xml', doc);
  zip.file('word/_rels/document.xml.rels', rels);
  zip.file('[Content_Types].xml', types);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
