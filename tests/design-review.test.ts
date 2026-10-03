import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'avataragent-design-'));
process.env.AI_PROVIDER = 'mock';
process.env.MOCK_DELAY_MS = '0';

const { store } = await import('../server/store.ts');
const { designReport, setPdfRenderer } = await import('../server/exports/designer.ts');
const { buildExport } = await import('../server/exports/index.ts');

const long = Array.from({ length: 6 }, (_, i) => `- ${i + 1}번째 검토 항목은 ${'설명이 꽤 길어서 슬라이드 한 장에 모두 담기 어려운 문장이고 '.repeat(8)}끝입니다`).join('\n');
const REPORT = `# 협업 도구 검토\n\n## 요약\n- 월 비용 1,200,000원\n- 만족도 81점\n\n## 비교\n| 후보 | 월 비용(원) | 만족도 |\n| --- | --- | --- |\n| A안 | 1,500,000 | 72 |\n| B안 | 1,200,000 | 81 |\n\n## 검토 항목\n${long}\n\n## 결론\nB안을 도입한다.\n`;

function addTask() {
  const writer = store.data.agents.find((a) => a.officeId === 'office_dev' && a.role === 'writer')!;
  const id = `task_design_${Math.random().toString(36).slice(2)}`;
  store.addTask({
    id,
    officeId: 'office_dev',
    title: '협업 도구 검토',
    description: '',
    taskType: 'research_report',
    status: 'completed',
    plan: [],
    planMode: 'template',
    planNote: '',
    currentStepId: null,
    inputText: '',
    inputIds: [],
    artifacts: [{ id: `${id}_a`, agentId: writer.id, kind: 'draft', title: '보고서', content: REPORT, version: 1, createdAt: new Date().toISOString() }],
    reviews: [],
    help: null,
    clarifications: [],
    userChangeRequests: [],
    proposal: null,
    costKrw: 0,
    costByAgent: {},
    value: null,
    failureReason: null,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  });
  return id;
}

test('the visual review renders, sends the PDF to the reviewer and lets the writer fix what was flagged', async () => {
  const rendered: string[] = [];
  setPdfRenderer(async (file, ext) => {
    rendered.push(ext);
    assert.equal(file.subarray(0, 2).toString(), 'PK');
    return Buffer.from('%PDF-1.7 stub');
  });
  const id = addTask();
  const before = store.task(id).costKrw;
  const { review } = await designReport(id, 'deck', { review: true });
  assert.ok(review);
  assert.equal(review.rounds, 2);
  assert.equal(review.passed, true);
  assert.ok(review.fixed.some((i) => i.includes('나눴어요')));
  assert.deepEqual(rendered, ['pptx', 'pptx']);
  const task = store.task(id);
  assert.ok(task.costKrw > before);
  assert.equal(task.designs?.deck?.review?.passed, true);
  const pptx = await buildExport(task, store.office(task.officeId), 'pptx');
  assert.equal(pptx.designed, true);
  setPdfRenderer(null);
});

test('spreadsheet design needs a table and cannot be visually reviewed', async () => {
  const id = addTask();
  await assert.rejects(designReport(id, 'sheet', { review: true }), /문서와 슬라이드/);
  const { review } = await designReport(id, 'sheet');
  assert.equal(review, undefined);
  assert.ok(store.task(id).designs?.sheet?.spec.sheets[0].totals?.length);
});
