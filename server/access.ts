import { canSeeOffice, seesEverything } from '../shared/access.ts';
import type { OfficeEvent, Snapshot, Viewer } from '../shared/types.ts';
import { store } from './store.ts';

export class ForbiddenError extends Error {}

export function eventOfficeId(event: OfficeEvent): string | null {
  const { agents, tasks } = store.data;
  if (event.agentId) {
    const agent = agents.find((a) => a.id === event.agentId);
    if (agent) return agent.officeId;
  }
  if (event.taskId) {
    const task = tasks.find((t) => t.id === event.taskId);
    if (task) return task.officeId;
  }
  return typeof event.payload.officeId === 'string' ? event.payload.officeId : null;
}

export function canSeeEvent(viewer: Viewer, event: OfficeEvent) {
  if (viewer.kind === 'owner') return true;
  if (event.type.startsWith('share.')) return false;
  const officeId = eventOfficeId(event);
  return officeId ? canSeeOffice(viewer, officeId) : seesEverything(viewer);
}

export function snapshotFor(viewer: Viewer): Snapshot {
  const full = store.snapshot();
  if (viewer.kind === 'owner') return full;

  const offices = full.offices.filter((o) => canSeeOffice(viewer, o.id));
  const officeIds = new Set(offices.map((o) => o.id));
  const hasTeam = (team: string) => offices.some((o) => o.team === team);
  const everything = seesEverything(viewer);
  const { shares: _shares, publicUrl: _publicUrl, ...rest } = full;
  return {
    ...rest,
    viewer,
    offices,
    agents: full.agents.filter((a) => officeIds.has(a.officeId)),
    tasks: full.tasks.filter((t) => officeIds.has(t.officeId)),
    budget: everything
      ? full.budget
      : {
          ...full.budget,
          spentKrw: offices.reduce((sum, o) => sum + o.spentKrw, 0),
          valueKrw: offices.reduce((sum, o) => sum + o.valueKrw, 0),
        },
    mailbox: hasTeam('hr') ? full.mailbox : [],
    calendar: hasTeam('hr') ? full.calendar : [],
    inquiries: hasTeam('support') ? full.inquiries : [],
    outbox: hasTeam('support') ? full.outbox : [],
    interests: hasTeam('welfare') ? full.interests : { keywords: [], region: '', note: '' },
    recommendations: hasTeam('welfare') ? full.recommendations : [],
  };
}
