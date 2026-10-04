import assert from 'node:assert/strict';
import test from 'node:test';
import type { Agent } from '../shared/types.ts';
import { agentAvailability, DEFAULT_WORK_POLICY, freshDailyUsage } from '../shared/work-policy.ts';

const agentAt = (patch: Partial<Agent['workPolicy']> = {}): Agent => {
  const workPolicy = { ...DEFAULT_WORK_POLICY, ...patch };
  return {
    id: 'a', officeId: 'o', name: 'A', role: 'writer', model: 'mock', rules: '', personality: 'balanced', skin: 'pixel',
    status: 'idle', expression: 'normal', activity: '', paused: false, costKrw: 0, valueKrw: 0, tasksDone: 0,
    workPolicy, dailyUsage: freshDailyUsage(workPolicy, new Date('2026-10-05T01:00:00Z')),
  };
};

test('disabled schedule remains available', () => {
  assert.deepEqual(agentAvailability(agentAt(), new Date('2026-10-04T20:00:00Z')), { available: true });
});

test('schedule closes outside configured hours', () => {
  const agent = agentAt({ enabled: true, timezone: 'Asia/Seoul', days: [1], start: '09:00', end: '18:00' });
  assert.deepEqual(agentAvailability(agent, new Date('2026-10-05T01:00:00Z')), { available: true });
  assert.deepEqual(agentAvailability(agent, new Date('2026-10-05T10:00:00Z')), { available: false, reason: 'schedule' });
});

test('daily token and working-time limits close independently', () => {
  const tokenAgent = agentAt({ maxTokens: 100 });
  tokenAgent.dailyUsage.tokens = 100;
  assert.deepEqual(agentAvailability(tokenAgent, new Date('2026-10-05T01:00:00Z')), { available: false, reason: 'tokens' });
  const timeAgent = agentAt({ maxWorkMinutes: 10 });
  timeAgent.dailyUsage.workMs = 600_000;
  assert.deepEqual(agentAvailability(timeAgent, new Date('2026-10-05T01:00:00Z')), { available: false, reason: 'work_time' });
});
