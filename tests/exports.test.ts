import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { buildExport } from '../server/exports/index.ts';
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
