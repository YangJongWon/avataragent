import type { Office, ProjectMilestone, Task, TeamId } from './types.ts';

const LABELS: Record<TeamId, string[]> = {
  dev: ['설계도', '선체', '엔진', '조종실', '탐사 모듈', '발사 준비'],
  hr: ['기초', '골조', '지붕', '업무실', '라운지', '입주 준비'],
  mgmt: ['부지', '기둥', '업무층', '회의실', '관제실', '준공'],
  support: ['용골', '선체', '기관실', '갑판', '통신실', '출항 준비'],
  welfare: ['산책로', '나무', '쉼터', '연못', '온실', '개장 준비'],
};

const WEIGHTS = [15, 20, 20, 15, 15, 15];

export function defaultMilestones(team: TeamId): ProjectMilestone[] {
  return LABELS[team].map((label, index) => ({ id: `ms_${index + 1}`, label, weight: WEIGHTS[index] }));
}

export function taskCompletion(task: Task) {
  if (task.status === 'completed') return 1;
  if (task.status === 'failed' || task.status === 'queued') return 0;
  const total = Math.max(1, task.plan.length);
  return task.plan.filter((step) => step.status === 'done').length / total;
}

export function projectProgress(office: Office, tasks: Task[]) {
  const milestones = office.milestones?.length ? office.milestones : defaultMilestones(office.team);
  const totalWeight = milestones.reduce((sum, milestone) => sum + Math.max(0, milestone.weight), 0) || 1;
  const details = milestones.map((milestone) => {
    const assigned = tasks.filter((task) => task.milestoneId === milestone.id);
    const progress = assigned.length ? assigned.reduce((sum, task) => sum + taskCompletion(task), 0) / assigned.length : 0;
    return { ...milestone, progress, taskCount: assigned.length };
  });
  const progress = details.reduce((sum, milestone) => sum + milestone.progress * Math.max(0, milestone.weight), 0) / totalWeight;
  return {
    progress,
    percent: Math.round(progress * 100),
    milestones: details,
    unclassified: tasks.filter((task) => !milestones.some((milestone) => milestone.id === task.milestoneId)),
  };
}
