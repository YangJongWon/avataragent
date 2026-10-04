import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultMilestones, projectProgress } from '../shared/project.ts';
import type { Office, Task } from '../shared/types.ts';

const milestones = defaultMilestones('dev');
const office: Office = { id: 'o1', team: 'dev', name: '개발', autoRun: false, budgetKrw: null, spentKrw: 0, valueKrw: 0, milestones };

function task(id: string, milestoneId: string | null, statuses: Task['plan'][number]['status'][], status: Task['status'] = 'running'): Task {
  return {
    id, officeId: office.id, title: id, description: '', taskType: 'feature', milestoneId, status,
    plan: statuses.map((stepStatus, index) => ({ id: `${id}_${index}`, kind: index === statuses.length - 1 ? 'approval' : 'draft', label: `${index}`, agentId: null, instructions: '', status: stepStatus })),
    planMode: 'template', planNote: '', currentStepId: null, inputText: '', inputIds: [], artifacts: [], reviews: [], help: null,
    clarifications: [], userChangeRequests: [], proposal: null, costKrw: 0, costByAgent: {}, value: null, failureReason: null,
    createdAt: new Date(0).toISOString(), completedAt: null,
  };
}

test('프로젝트 진행률은 고정 마일스톤 가중치와 연결된 업무만 계산한다', () => {
  const result = projectProgress(office, [
    task('design', milestones[0].id, ['done', 'done'], 'completed'),
    task('body', milestones[1].id, ['done', 'pending']),
    task('old', null, ['done', 'done'], 'completed'),
  ]);
  assert.equal(result.percent, 25); // 설계 15% + 선체 20%의 절반
  assert.deepEqual(result.unclassified.map((item) => item.id), ['old']);
});

test('실패 업무는 진행률을 올리지 않고 새 미분류 업무도 기존 퍼센트를 바꾸지 않는다', () => {
  const base = [task('design', milestones[0].id, ['done'], 'completed')];
  assert.equal(projectProgress(office, base).percent, 15);
  assert.equal(projectProgress(office, [...base, task('future', null, ['pending'], 'queued')]).percent, 15);
  assert.equal(projectProgress(office, [...base, task('failed', milestones[1].id, ['done', 'error'], 'failed')]).percent, 15);
});
