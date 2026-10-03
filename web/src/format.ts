import { companyOf, modelOf, TIER_LABEL } from '../../shared/models.ts';
import { TEAMS } from '../../shared/teams.ts';
import type { Agent, Office, OfficeEvent, TaskStatus } from '../../shared/types.ts';

export function modelLabel(id: string) {
  const m = modelOf(id);
  return `${m.label} · ${TIER_LABEL[m.tier]} (${companyOf(m.vendor).name})`;
}

export function krw(value: number) {
  const abs = Math.abs(value);
  const digits = abs > 0 && abs < 100 ? 2 : 0;
  const text = abs.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: digits });
  return `${value < 0 ? '-' : ''}₩${text}`;
}

export function roi(value: number, cost: number) {
  if (cost <= 0) return value > 0 ? '∞' : '-';
  return `${Math.round(((value - cost) / cost) * 100).toLocaleString('ko-KR')}%`;
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  queued: '대기',
  running: '진행 중',
  awaiting_help: '도움 요청',
  awaiting_approval: '승인 대기',
  completed: '완료',
  failed: '중단',
};

export function roleTitle(agent: Agent, offices: Office[]) {
  const office = offices.find((o) => o.id === agent.officeId);
  return office ? TEAMS[office.team].roleTitles[agent.role] : agent.role;
}

export function eventLabel(event: OfficeEvent, agents: Map<string, Agent>) {
  const p = event.payload as Record<string, unknown>;
  const name = (id: unknown) => agents.get(String(id))?.name ?? '직원';
  const who = event.agentId ? name(event.agentId) : '';
  switch (event.type) {
    case 'task.created':
      return `${p.queued ? '대기열에 업무 추가' : '칠판에 업무 등록'}: ${p.title}`;
    case 'queue.started':
      return `업무 시작: ${p.title}`;
    case 'task.cancelled':
      return `대기 업무 취소: ${p.title}`;
    case 'task.assigned':
      return `${who}에게 업무 배정`;
    case 'task.started':
      return `${who} 작업 시작${Number(p.attempt) > 1 ? ` (${p.attempt}번째)` : ''}`;
    case 'tool.started':
      return `${who} ${p.label ?? '도구'} 시작`;
    case 'tool.completed':
      return `${who} 도구 사용 완료`;
    case 'mcp.called':
      return `${who} ${p.icon ?? '🧩'} ${p.server} · ${p.tool} ${p.approved ? '승인된 외부 작업 실행' : '호출'}`;
    case 'mcp.result':
      return `${who} ${p.server} · ${p.tool} 결과 받음 (${p.chars}자)`;
    case 'mcp.failed':
      return `${who} ${p.server} · ${p.tool} 실패: ${p.reason}`;
    case 'mcp.changed':
      return `${p.summary}`;
    case 'artifact.created':
      return `${who} 산출물 생성: ${p.title}`;
    case 'task.handed_off':
      return `${name(p.from)} → ${name(p.to)}: ${p.label}`;
    case 'cost.recorded':
      return `${who} AI 호출 비용 ${krw(Number(p.amountKrw))} (입력 ${p.inputTokens} / 출력 ${p.outputTokens} 토큰)`;
    case 'agent.help_requested':
      return `${who} 도움 요청: ${p.question}`;
    case 'agent.help_received':
      return `사용자가 ${who}를 도와줌: ${p.answer}`;
    case 'agent.help_timed_out':
      return `응답이 없어 ${who}가 가정으로 진행: ${p.assumption}`;
    case 'review.started':
      return `${who} 검수 시작`;
    case 'review.rejected':
      return `${who} 반려 (${p.score}점): ${p.reason}`;
    case 'review.approved':
      return `${who} 검수 통과 (${p.score}점)`;
    case 'approval.requested':
      return `사용자 승인 요청 (추정 가치 ${krw(Number(p.estimatedKrw ?? 0))})`;
    case 'approval.granted':
      return '사용자 승인';
    case 'approval.denied':
      return `사용자 수정 요청: ${p.comment}`;
    case 'value.recognized':
      return `가치 인정 ${krw(Number(p.amountKrw))} / 업무 이익 ${krw(Number(p.profitKrw))}`;
    case 'task.completed':
      return '업무 완료';
    case 'task.failed':
      return `업무 중단: ${p.reason}`;
    case 'task.paused':
      return `${who} 일시정지`;
    case 'task.resumed':
      return `${who} 재개`;
    case 'rule.changed':
      return `${who} 개인 규칙 변경`;
    case 'agent.hired':
      return `${String(p.name ?? who)} 입사`;
    case 'agent.left':
      return `${String(p.name ?? '')} 퇴사`;
    case 'budget.threshold_reached':
      return '월 예산 80% 사용 경고';
    case 'budget.exceeded':
      return p.officeId ? '팀 예산 상한 초과로 실행 중지' : '월 예산 초과로 실행 중지';
    case 'team.applied':
      return `반영 완료: ${p.summary}`;
    case 'mail.received':
      return `새 메일 도착: ${p.subject}`;
    case 'inquiry.received':
      return `새 문의 도착: ${p.subject}`;
    case 'office.updated':
      return '사무실 설정 변경';
    case 'office.created':
      return '사무실 개설';
    case 'office.removed':
      return '사무실 폐쇄';
    case 'workflow.planned':
      return `${who} 업무 여정 설계 (${p.steps}단계)${p.note ? `: ${p.note}` : ''}`;
    case 'workflow.updated':
      return `업무 여정 수정 (${p.steps}단계)`;
    case 'workflow.looped':
      return `${who} 🔁 ${p.from} → ${p.to === p.from ? '다시' : p.to} (${p.count}/${p.max}): ${p.reason}`;
    case 'share.created':
      return `공유 링크 생성: ${p.name}`;
    case 'share.revoked':
      return `공유 링크 취소: ${p.name}`;
    case 'catalog.changed':
      return `모델 관리 · ${p.summary}`;
    default:
      return event.type;
  }
}

export function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
