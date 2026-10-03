import type { ShareRole, Viewer } from './types.ts';

/**
 * view: see the office, journey and reports.
 * operate: register tasks, design journeys, help, approve, cancel queued tasks.
 * manage: change staff settings, office automation and team data.
 * owner: open/close offices, company budget, share links.
 */
export type Action = 'view' | 'operate' | 'manage' | 'owner';

export const SHARE_ROLES: Record<ShareRole, { label: string; description: string; actions: Action[] }> = {
  viewer: { label: '보기', description: '사무실, 업무 여정, 보고서를 볼 수만 있어요.', actions: ['view'] },
  operator: {
    label: '업무 처리',
    description: '업무 등록·여정 설계, 도움 요청 응답, 승인과 수정 요청까지 할 수 있어요.',
    actions: ['view', 'operate'],
  },
  manager: {
    label: '사무실 관리',
    description: '업무 처리에 더해 직원 규칙·모델·스킨, 자동 실행, 팀 자료까지 바꿀 수 있어요.',
    actions: ['view', 'operate', 'manage'],
  },
};

export function canSeeOffice(viewer: Viewer, officeId: string) {
  if (viewer.kind === 'owner') return true;
  return viewer.officeIds === 'all' || viewer.officeIds.includes(officeId);
}

/** officeId is required for every action except 'owner'. */
export function can(viewer: Viewer, action: Action, officeId?: string) {
  if (viewer.kind === 'owner') return true;
  if (action === 'owner') return false;
  if (!SHARE_ROLES[viewer.role].actions.includes(action)) return false;
  return officeId !== undefined && canSeeOffice(viewer, officeId);
}

export const seesEverything = (viewer: Viewer) => viewer.kind === 'owner' || viewer.officeIds === 'all';
