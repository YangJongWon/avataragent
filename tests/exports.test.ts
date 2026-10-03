import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { fitDeck, lintDoc } from '../server/exports/fit.ts';
import { buildExport } from '../server/exports/index.ts';
import { mockWorkbook, sanitizeWorkbook } from '../server/exports/sheet.ts';
import { deckFromDoc, docFromMarkdown, enrichDoc, sanitizeDeck, sanitizeDoc } from '../server/exports/spec.ts';
import type { Office, Task } from '../shared/types.ts';

const REPORT = `# 사내 메신저 도입 검토

## 요약
- 월 비용 1,200,000원으로 B안이 가장 저렴하다
- 응답 속도 38% 개선

## 비교
| 후보 | 월 비용(원) | 만족도 |
| --- | --- | --- |
| A안 | 1,500,000 | 72 |
| B안 | 1,200,000 | 81 |
| C안 | 1,800,000 | 65 |

### 고려 사항
- **보안 인증** 필요
- 도입 기간 [3주](https://example.com/plan)

## 결론
B안을 도입하고 2주간 시범 운영한다.

## 출처
1. 공급사 견적서 (2026)
`;

const office: Office = { id: 'o1', team: 'dev', name: '개발팀', autoRun: false, budgetKrw: null, spentKrw: 0, valueKrw: 0 };

function taskWith(content: string, designs?: Task['designs']): Task {
  return {
    id: 't1',
    officeId: 'o1',
    title: '메신저 검토',
    description: '',
    taskType: 'research_report',
    status: 'completed',
    plan: [],
    planMode: 'template',
    planNote: '',
    currentStepId: null,
    inputText: '',
    inputIds: [],
    artifacts: [{ id: 'a1', agentId: 'w', kind: 'draft', title: '보고서', content, version: 2, createdAt: '2026-10-04T00:00:00Z' }],
    reviews: [],
    help: null,
    clarifications: [],
    userChangeRequests: [],
    proposal: null,
    costKrw: 0,
    costByAgent: {},
    value: null,
    failureReason: null,
    designs,
    createdAt: '2026-10-04T00:00:00Z',
    completedAt: '2026-10-04T01:00:00Z',
  };
}

test('markdown keeps its sections, tables, summary and sources', () => {
  const doc = docFromMarkdown(REPORT, 'fallback', 'sub');
  assert.equal(doc.title, '사내 메신저 도입 검토');
  assert.deepEqual(doc.summary, ['월 비용 1,200,000원으로 B안이 가장 저렴하다', '응답 속도 38% 개선']);
  assert.deepEqual(doc.sources, ['공급사 견적서 (2026)']);
  const table = doc.blocks.find((b) => b.type === 'table');
  assert.ok(table && table.type === 'table');
  assert.deepEqual(table.table.columns, ['후보', '월 비용(원)', '만족도']);
  assert.equal(table.table.title, '비교');
  const bullets = doc.blocks.find((b) => b.type === 'bullets');
  assert.ok(bullets && bullets.type === 'bullets');
  assert.deepEqual(bullets.items, ['보안 인증 필요', '도입 기간 3주 (https://example.com/plan)']);
});

test('the designer may not show numbers the report does not have', () => {
  const raw = {
    title: '디자인',
    blocks: [
      { type: 'kpis', items: [{ label: '비용', value: '1,200,000원' }, { label: '개선', value: '38%' }] },
      { type: 'kpis', items: [{ label: '절감', value: '45%' }] },
      { type: 'chart', chart: { kind: 'bar', title: '비용', labels: ['A안', 'B안'], series: [{ name: '원', values: [1500000, 1200000] }] } },
      { type: 'chart', chart: { kind: 'bar', title: '틀린 개수', labels: ['A안'], series: [{ name: 'x', values: [1, 2] }] } },
      { type: 'script', text: '<b>무시</b>' },
    ],
  };
  const { spec, dropped } = sanitizeDoc(raw, REPORT, 't', 's');
  assert.equal(dropped, 1);
  assert.deepEqual(spec.blocks.map((b) => b.type), ['kpis', 'chart']);

  const deck = sanitizeDeck({ slides: [{ title: '결론', block: { type: 'paragraph', text: 'B안' } }, { title: '거짓', block: { type: 'kpis', items: [{ label: 'x', value: '99%' }] } }] }, REPORT, 't', 's');
  assert.equal(deck.dropped, 1);
  assert.deepEqual(deck.spec.slides[0].block, { type: 'bullets', items: ['B안'] });
});

test('enriched layout adds cards, a chart and a highlighted conclusion', () => {
  const doc = enrichDoc(docFromMarkdown(REPORT, 't', 's'));
  const types = doc.blocks.map((b) => b.type);
  assert.equal(types[0], 'kpis');
  assert.ok(types.includes('chart'));
  assert.ok(types.includes('callout'));
  assert.equal(sanitizeDoc(doc, REPORT, 't', 's').dropped, 0);
  const deck = deckFromDoc(doc);
  assert.equal(deck.slides[0].title, '핵심 요약');
  assert.ok(deck.slides.some((s) => s.block?.type === 'chart'));
});

test('every format opens and carries the report', async () => {
  const task = taskWith(`${REPORT}\n\`\`\`json\n{"internal":true}\n\`\`\``);

  const csv = await buildExport(task, office, 'csv');
  const csvText = csv.body.toString();
  assert.ok(csvText.startsWith('\uFEFF후보,월 비용(원),만족도'));
  assert.ok(csvText.includes('B안,"1,200,000",81'));
  assert.equal(csv.filename, '메신저 검토.csv');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildExport(task, office, 'xlsx')).body as Buffer);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['요약', '비교']);
  assert.equal(wb.getWorksheet('비교')!.getCell('B3').value, 1200000);

  const docx = await JSZip.loadAsync((await buildExport(task, office, 'docx')).body as Buffer);
  const xml = await docx.file('word/document.xml')!.async('string');
  assert.ok(xml.includes('사내 메신저 도입 검토') && xml.includes('공급사 견적서') && !xml.includes('internal'));

  const html = (await buildExport(task, office, 'pdf', { print: true })).body as string;
  assert.ok(html.includes('<h1>사내 메신저 도입 검토</h1>') && html.includes('print()'));

  const pptx = await JSZip.loadAsync((await buildExport(task, office, 'pptx')).body as Buffer);
  const slides = Object.keys(pptx.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  assert.ok(slides.length >= 4);
});

test('an AI layout is used only for the draft version it was made from', async () => {
  const doc = enrichDoc(docFromMarkdown(REPORT, 't', 's'));
  const deck = deckFromDoc(doc);
  const record = { dropped: 0, createdAt: '2026-10-04T00:00:00Z' };
  const current = taskWith(REPORT, { doc: { ...record, draftVersion: 2, spec: doc }, deck: { ...record, draftVersion: 2, spec: deck } });
  const stale = taskWith(REPORT, { doc: { ...record, draftVersion: 1, spec: doc } });

  const pptx = await buildExport(current, office, 'pptx');
  assert.equal(pptx.designed, true);
  const zip = await JSZip.loadAsync(pptx.body as Buffer);
  assert.ok(Object.keys(zip.files).some((f) => f.startsWith('ppt/charts/')));

  assert.equal((await buildExport(current, office, 'docx')).designed, true);
  assert.equal((await buildExport(stale, office, 'docx')).designed, false);
  assert.equal((await buildExport(current, office, 'csv')).designed, false);
});

test('a workbook plan keeps only steps that point at real columns', () => {
  const doc = docFromMarkdown(REPORT, 't', 's');
  const plan = sanitizeWorkbook(
    {
      sheets: [
        {
          table: 0,
          name: '후보 비교',
          sort: { column: '만족도', desc: true },
          computed: [
            { name: '비용 비중', op: 'share', a: '월 비용(원)' },
            { name: '이상한 열', op: 'diff', a: '후보', b: '만족도' },
          ],
          totals: [{ column: '월 비용(원)', fn: 'sum' }, { column: '비용 비중', fn: 'sum' }, { column: '없는 열', fn: 'sum' }, { column: '만족도', fn: 'median' }],
          highlight: [{ column: '만족도', op: '<', value: 70, tone: 'bad' }],
          bars: ['월 비용(원)', '후보'],
        },
        { table: 7 },
      ],
      style: { palette: 'ocean', fonts: 'serif' },
    },
    doc,
  );
  assert.equal(plan.sheets.length, 1);
  const s = plan.sheets[0];
  assert.deepEqual(s.computed, [{ name: '비용 비중', op: 'share', a: '월 비용(원)' }]);
  assert.deepEqual(s.totals, [{ column: '월 비용(원)', fn: 'sum' }, { column: '비용 비중', fn: 'sum' }]);
  assert.deepEqual(s.bars, ['월 비용(원)']);
  assert.deepEqual(plan.style, { palette: 'ocean' });
});

test('the designed workbook writes real formulas, sorting and conditional formats', async () => {
  const doc = docFromMarkdown(REPORT, 't', 's');
  const spec = sanitizeWorkbook(
    {
      sheets: [
        {
          table: 0,
          sort: { column: '만족도', desc: true },
          computed: [{ name: '비용 비중', op: 'share', a: '월 비용(원)' }],
          totals: [{ column: '월 비용(원)', fn: 'sum' }, { column: '만족도', fn: 'average' }],
          highlight: [{ column: '만족도', op: '<', value: 70, tone: 'bad' }],
          bars: ['월 비용(원)'],
        },
      ],
    },
    doc,
  );
  const task = taskWith(REPORT, { sheet: { draftVersion: 2, spec, dropped: 0, createdAt: '2026-10-04T00:00:00Z' } });
  const file = await buildExport(task, office, 'xlsx');
  assert.equal(file.designed, true);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file.body as Buffer);
  const ws = wb.getWorksheet('비교')!;
  assert.deepEqual([2, 3, 4].map((r) => ws.getCell(`A${r}`).value), ['B안', 'A안', 'C안']);
  assert.equal(ws.getCell('D1').value, '비용 비중');
  assert.deepEqual(ws.getCell('D2').value, { formula: 'IF(SUM(B$2:B$4)=0,"",B2/SUM(B$2:B$4))', result: 1200000 / 4500000 });
  assert.equal(ws.getCell('A5').value, '요약');
  assert.deepEqual(ws.getCell('B5').value, { formula: 'SUM(B2:B4)', result: 4500000 });
  assert.equal((ws.getCell('C5').value as { formula: string }).formula, 'AVERAGE(C2:C4)');
  const zip = await JSZip.loadAsync(file.body as Buffer);
  const sheetXml = await zip.file('xl/worksheets/sheet2.xml')!.async('string');
  assert.ok(sheetXml.includes('<dataBar') && sheetXml.includes('operator="lessThan"'));

  const mock = mockWorkbook(doc);
  assert.deepEqual(mock.sheets[0].totals, [{ column: '월 비용(원)', fn: 'sum' }, { column: '만족도', fn: 'average' }]);
});

test('slides that would overflow get split instead of shrinking below the floor', () => {
  const long = Array.from({ length: 24 }, (_, i) => `${i + 1}번째 항목은 설명이 길어서 한 줄에 다 들어가지 않을 수도 있는 긴 문장입니다`);
  const rows = Array.from({ length: 30 }, (_, i) => [`행 ${i + 1}`, '내용이 조금 긴 칸', String(i)]);
  const { slides, issues } = fitDeck({
    title: 't',
    subtitle: 's',
    sources: [],
    slides: [
      { title: '짧은 목록', block: { type: 'bullets', items: ['하나', '둘', '셋'] } },
      { title: '긴 목록', block: { type: 'bullets', items: long } },
      { title: '긴 표', block: { type: 'table', table: { columns: ['이름', '내용', '값'], rows } } },
    ],
  });
  assert.equal(slides[0].rows, true);
  const listParts = slides.filter((s) => s.title.startsWith('긴 목록'));
  assert.ok(listParts.length >= 2 && listParts.every((s) => s.pt >= 14));
  assert.deepEqual(listParts.flatMap((s) => (s.block?.type === 'bullets' ? s.block.items : [])), long);
  const tableParts = slides.filter((s) => s.title.startsWith('긴 표'));
  assert.ok(tableParts.length >= 2);
  assert.equal(tableParts.reduce((n, s) => n + (s.block?.type === 'table' ? s.block.table.rows.length : 0), 0), 30);
  assert.equal(issues.length, 2);
  assert.ok(lintDoc({ title: 't', subtitle: '', summary: [], sources: [], blocks: [{ type: 'paragraph', text: '가'.repeat(700) }] }).length >= 2);
});

test('the chosen palette and fonts reach the files', async () => {
  const doc = { ...enrichDoc(docFromMarkdown(REPORT, 't', 's')), style: { palette: 'forest' as const, fonts: 'classic' as const } };
  const deck = { ...deckFromDoc(doc), style: doc.style };
  const record = { dropped: 0, createdAt: '2026-10-04T00:00:00Z', draftVersion: 2 };
  const task = taskWith(REPORT, { doc: { ...record, spec: doc }, deck: { ...record, spec: deck } });
  const pptx = await JSZip.loadAsync((await buildExport(task, office, 'pptx')).body as Buffer);
  const cover = await pptx.file('ppt/slides/slide1.xml')!.async('string');
  assert.ok(cover.includes('1B3A1C') && cover.includes('바탕'));
  const html = (await buildExport(task, office, 'pdf')).body as string;
  assert.ok(html.includes('#2C5F2D') && html.includes('Batang'));
});

test('Word gets native charts with their data embedded', async () => {
  const doc = enrichDoc(docFromMarkdown(REPORT, 't', 's'));
  doc.blocks.push({ type: 'chart', chart: { kind: 'pie', title: '비중', labels: ['가', '나'], series: [{ name: '비중', values: [60, 40] }], unit: '%' } });
  const record = { dropped: 0, createdAt: '2026-10-04T00:00:00Z', draftVersion: 2 };
  const zip = await JSZip.loadAsync((await buildExport(taskWith(REPORT, { doc: { ...record, spec: doc } }), office, 'docx')).body as Buffer);
  const xml = await zip.file('word/document.xml')!.async('string');
  assert.ok(!xml.includes('[[CHART:'));
  assert.equal(xml.match(/<c:chart /g)?.length, 2);
  const bar = await zip.file('word/charts/chart1.xml')!.async('string');
  assert.ok(bar.includes('<c:barChart>') && bar.includes('<c:v>1200000</c:v>') && bar.includes('<c:externalData r:id="rId1">'));
  assert.ok((await zip.file('word/charts/chart2.xml')!.async('string')).includes('<c:doughnutChart>'));
  assert.ok((await zip.file('word/_rels/document.xml.rels')!.async('string')).includes('Target="charts/chart2.xml"'));
  assert.ok((await zip.file('[Content_Types].xml')!.async('string')).includes('/word/charts/chart1.xml'));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await zip.file('word/embeddings/Microsoft_Excel_Worksheet1.xlsx')!.async('nodebuffer'));
  assert.equal(wb.getWorksheet('Sheet1')!.getCell('B3').value, 1200000);
});
