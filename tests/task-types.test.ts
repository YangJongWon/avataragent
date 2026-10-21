import assert from 'node:assert/strict';
import test from 'node:test';
import { LANGUAGES, translate } from '../shared/i18n.ts';
import { GENERAL_TASK_TYPES, TASK_CATEGORIES, TEAM_TYPE_CATEGORY } from '../shared/task-types.ts';
import { isTeamTaskType, TEAM_ORDER, TEAMS, taskTypeOf } from '../shared/teams.ts';
import type { Agent } from '../shared/types.ts';
import { templatePlan, validatePlan } from '../shared/workflow.ts';
import { TYPE_ASKS } from '../server/task-type-asks.ts';
import { specFor, TEAM_SPECS } from '../server/teams.ts';

const agents = (['manager', 'researcher', 'writer', 'reviewer'] as const).map((role) => ({ id: role, role })) as Agent[];

test('업무 유형은 30가지가 넘고 id가 겹치지 않는다', () => {
  const ids = [...TEAM_ORDER.flatMap((team) => TEAMS[team].taskTypes.map((type) => type.id)), ...GENERAL_TASK_TYPES.map((type) => type.id)];
  assert.ok(ids.length >= 30, `${ids.length}가지`);
  assert.equal(new Set(ids).size, ids.length);
  for (const team of TEAM_ORDER) for (const type of TEAMS[team].taskTypes) assert.ok(TEAM_TYPE_CATEGORY[type.id], `${type.id} 분류`);
  for (const category of TASK_CATEGORIES) assert.ok(GENERAL_TASK_TYPES.some((type) => type.category === category.id), `${category.label} 유형`);
});

test('공용 유형은 어느 사무실에서든 그 유형으로 남고, 올바른 여정과 작성·검토 지시를 가진다', () => {
  for (const type of GENERAL_TASK_TYPES) {
    assert.ok(TYPE_ASKS[type.id], `${type.id} 지시`);
    for (const team of TEAM_ORDER) {
      assert.equal(taskTypeOf(team, type.id).id, type.id);
      assert.equal(isTeamTaskType(team, type.id), false);
      assert.equal(validatePlan(templatePlan(team, type.id, agents), agents), null, `${team}/${type.id}`);
    }
  }
});

test('인사팀 사무실의 채용 공고는 메일함이 아니라 요청 내용으로 일하고, 팀 고유 유형은 팀 방식 그대로다', () => {
  const posting = specFor('hr', 'job_posting');
  assert.notEqual(posting, TEAM_SPECS.hr);
  assert.equal(posting.gatherInputs('백엔드 개발자 채용', 'office_hr').text, '백엔드 개발자 채용');
  assert.match(posting.draftAsk, /채용 공고/);
  assert.match(posting.reviewAsk, /차별/);
  assert.equal(posting.defaultTitle, '채용 공고 작성');
  assert.equal(specFor('hr', 'mail_triage'), TEAM_SPECS.hr);
  assert.equal(specFor('hr', '모르는 유형'), TEAM_SPECS.hr, '모르는 유형은 팀 기본으로');
});

test('유형 이름·설명·단계·태그·분류는 네 언어로 보인다', () => {
  const keys = [
    ...TASK_CATEGORIES.map((c) => c.label),
    ...GENERAL_TASK_TYPES.flatMap((type) => [type.label, type.summary, ...type.tags, ...type.flow.map((s) => s.label)]),
  ].filter((key) => /[가-힣]/.test(key));
  const problems = keys.flatMap((key) => LANGUAGES.filter((l) => l.id !== 'ko' && translate(key, l.id) === key).map((l) => `[${l.id}] ${key}`));
  assert.deepEqual(problems, []);
});
