import { companyOf, modelOf, tierLabel } from '../../shared/models.ts';
import { currentLanguage, localeOf, localize, num, t, tpl, type Vars } from '../../shared/i18n.ts';
import { improvementReasonVars } from '../../shared/performance.ts';
import { TEAMS } from '../../shared/teams.ts';
import type { Agent, Office, OfficeEvent, TaskStatus } from '../../shared/types.ts';
import { formatMoney } from './currency.ts';

export function modelLabel(id: string) {
  const m = modelOf(id);
  return `${m.label} · ${tierLabel(m.tier)} (${companyOf(m.vendor).name})`;
}

/** Money is stored in KRW; this shows it in the viewer's chosen currency. */
export function krw(value: number) {
  return formatMoney(value);
}

export function roi(value: number, cost: number) {
  if (cost <= 0) return value > 0 ? '∞' : '-';
  return `${num(Math.round(((value - cost) / cost) * 100))}%`;
}

/** Raw Korean labels; prefer `statusLabel()` so the active language applies. */
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  queued: '대기',
  running: '진행 중',
  awaiting_help: '도움 요청',
  awaiting_approval: '승인 대기',
  completed: '완료',
  failed: '중단',
};

export const statusLabel = (status: TaskStatus) => t(TASK_STATUS_LABEL[status]);

export function roleTitle(agent: Agent, offices: Office[]) {
  const office = offices.find((o) => o.id === agent.officeId);
  return office ? t(TEAMS[office.team].roleTitles[agent.role]) : agent.role;
}

export function eventLabel(event: OfficeEvent, agents: Map<string, Agent>) {
  const p = event.payload as Record<string, unknown>;
  const name = (id: unknown) => agents.get(String(id))?.name ?? t('직원');
  const who = event.agentId ? name(event.agentId) : '';
  switch (event.type) {
    case 'task.created':
      return tpl(p.queued ? '대기열에 업무 추가' : '칠판에 업무 등록', { title: String(p.title ?? '') });
    case 'queue.started':
      return tpl('업무 시작', { title: String(p.title ?? '') });
    case 'task.cancelled':
      return tpl('대기 업무 취소', { title: String(p.title ?? '') });
    case 'task.assigned':
      return tpl('{who}에게 업무 배정', { who });
    case 'task.started':
      return Number(p.attempt) > 1
        ? tpl('작업 시작 (재시도)', { who, attempt: Number(p.attempt) })
        : tpl('{who} 작업 시작', { who });
    case 'tool.started':
      return tpl('{who} 도구 시작', { who, tool: String(p.label ?? t('도구')) });
    case 'tool.completed':
      return tpl('{who} 도구 사용 완료', { who });
    case 'mcp.called':
      return tpl(p.approved ? '{who} 승인된 외부 작업 실행' : '{who} 도구 호출', {
        who,
        icon: String(p.icon ?? '🧩'),
        server: String(p.server ?? ''),
        tool: String(p.tool ?? ''),
      });
    case 'mcp.result':
      return tpl('{who} 결과 수신', { who, server: String(p.server ?? ''), tool: String(p.tool ?? ''), chars: num(Number(p.chars ?? 0)) });
    case 'mcp.failed':
      return tpl('{who} 실패', { who, server: String(p.server ?? ''), tool: String(p.tool ?? ''), reason: String(p.reason ?? '') });
    case 'mcp.changed':
    case 'schedule.changed':
      return String(p.summary ?? '');
    case 'schedule.ran':
      return p.error ? tpl('예약 업무를 시작하지 못했어요: {reason}', { reason: String(p.error) }) : tpl('예약 업무 시작: {title}', { title: String(p.title ?? '') });
    case 'task.designed': {
      const kind = p.kind === 'deck' ? t('슬라이드') : p.kind === 'sheet' ? 'Excel' : t('문서');
      const base = tpl('{who} {kind} 디자인 완료', { who, kind, version: Number(p.version ?? 1) });
      const reviewed = p.reviewed
        ? ` ${tpl('화면 검수 결과', { rounds: Number(p.rounds ?? 0), result: p.passed ? t('검수 통과') : t('검수 지적') })}`
        : '';
      const dropped = Number(p.dropped) ? ` ${tpl('근거 없는 숫자 제외', { count: Number(p.dropped) })}` : '';
      return `${base}${reviewed}${dropped}`;
    }
    case 'artifact.created':
      return tpl('{who} 산출물 생성', { who, title: String(p.title ?? '') });
    case 'task.handed_off':
      return tpl('{who} 업무 전달', { who, from: name(p.from), to: name(p.to), label: String(p.label ?? '') });
    case 'cost.recorded':
      return tpl('{who} AI 호출 비용', {
        who,
        amount: krw(Number(p.amountKrw ?? 0)),
        inputTokens: num(Number(p.inputTokens ?? 0)),
        outputTokens: num(Number(p.outputTokens ?? 0)),
      });
    case 'agent.help_requested':
      return tpl('{who} 도움 요청', { who, question: String(p.question ?? '') });
    case 'agent.help_received':
      return tpl('사용자가 도움줌', { who, answer: String(p.answer ?? '') });
    case 'agent.help_timed_out':
      return tpl('응답 없이 진행', { who, assumption: String(p.assumption ?? '') });
    case 'review.started':
      return tpl('{who} 검수 시작', { who });
    case 'review.rejected':
      return tpl('{who} 반려', { who, score: Number(p.score ?? 0), reason: String(p.reason ?? '') });
    case 'review.approved':
      return tpl('{who} 검수 통과', { who, score: Number(p.score ?? 0) });
    case 'approval.requested':
      return tpl('사용자 승인 요청', { value: krw(Number(p.estimatedKrw ?? 0)) });
    case 'approval.granted':
      return t('사용자 승인');
    case 'approval.denied':
      return tpl('사용자 수정 요청', { comment: String(p.comment ?? '') });
    case 'value.recognized':
      return tpl('가치 인정', { value: krw(Number(p.amountKrw ?? 0)), profit: krw(Number(p.profitKrw ?? 0)) });
    case 'task.completed':
      return t('업무 완료');
    case 'task.failed':
      return tpl('업무 중단', { reason: String(p.reason ?? '') });
    case 'task.paused':
      return tpl('{who} 일시정지', { who });
    case 'task.retried':
      return p.step ? tpl('{step} 단계부터 다시 진행', { step: String(p.step) }) : t('업무 다시 진행');
    case 'task.resumed':
      return tpl('{who} 재개', { who });
    case 'rule.changed':
      return tpl('{who} 개인 규칙 변경', { who });
    case 'agent.hired':
      return tpl('{who} 입사', { who, name: String(p.name ?? who) });
    case 'agent.left':
      return tpl('{who} 퇴사', { who, name: String(p.name ?? '') });
    case 'budget.threshold_reached':
      return t('월 예산 80% 사용 경고');
    case 'budget.exceeded':
      return t(p.officeId ? '팀 예산 상한 초과' : '월 예산 초과');
    case 'team.applied':
      return tpl('반영 완료', { summary: localize(String(p.summary ?? '')) });
    case 'mail.received':
      return tpl('새 메일 도착', { subject: String(p.subject ?? '') });
    case 'inquiry.received':
      return tpl('새 문의 도착', { subject: String(p.subject ?? '') });
    case 'office.updated':
      return t('사무실 설정 변경');
    case 'theme.changed':
      return t('공통 테마 변경');
    case 'theme.booked':
      return t('기간별 테마 변경');
    case 'theme.site':
      return t('사이트 테마 변경');
    case 'company.logo':
      return t('회사 로고 변경');
    case 'office.created':
      return t('사무실 개설');
    case 'office.removed':
      return t('사무실 폐쇄');
    case 'workflow.planned': {
      const base = tpl('{who} 업무 여정 설계', { who, steps: num(Number(p.steps ?? 0)) });
      return p.note ? `${base}: ${String(p.note)}` : base;
    }
    case 'workflow.updated':
      return tpl('업무 여정 수정', { steps: num(Number(p.steps ?? 0)) });
    case 'workflow.looped':
      return tpl('{who} 되돌아감', {
        who,
        from: String(p.from ?? ''),
        to: String(p.to === p.from ? t('다시') : (p.to ?? '')),
        count: Number(p.count ?? 0),
        max: Number(p.max ?? 0),
        reason: String(p.reason ?? ''),
      });
    case 'share.created':
      return tpl('공유 링크 생성', { name: String(p.name ?? '') });
    case 'share.revoked':
      return tpl('공유 링크 취소', { name: String(p.name ?? '') });
    case 'catalog.changed':
      return tpl('모델 관리', { summary: String(p.summary ?? '') });
    case 'playbook.applied':
      return tpl('플레이북 적용', { name: String(p.name ?? ''), changes: num(Number(p.changes ?? 0)) });
    case 'improvement.applied':
      return `📈 ${tpl(p.auto ? '자율 개선' : '개선 적용', {
        reason: p.reasonKey ? tpl(String(p.reasonKey), improvementReasonVars((p.reasonVars ?? {}) as Vars)) : String(p.reason ?? ''),
      })}`;
    case 'chat.forwarded':
      return tpl('대화 전달', {
        by: String(p.by ?? ''),
        label: String(p.label ?? ''),
        author: String(p.author ?? ''),
        text: String(p.text ?? ''),
      });
    case 'task.assignee_changed':
      return p.name ? tpl('담당자 지정', { name: String(p.name) }) : t('담당자 지정 해제');
    case 'plan.changed': {
      const base = tpl('플랜 변경', { plan: String(p.plan ?? '') });
      return p.reason ? `${base} (${String(p.reason)})` : base;
    }
    case 'member.created':
      return tpl('구성원 추가', { name: String(p.name ?? '') });
    case 'member.updated':
      return tpl('구성원 정보 변경', { name: String(p.name ?? '') });
    case 'member.removed':
      return tpl('구성원 삭제', { name: String(p.name ?? '') });
    case 'billing.checkout_started':
      return tpl('결제 시작', { plan: String(p.plan ?? ''), amount: krw(Number(p.amountKrw ?? 0)) });
    case 'billing.subscribed':
      return tpl('구독 시작', { plan: String(p.plan ?? ''), amount: krw(Number(p.amountKrw ?? 0)) });
    case 'billing.renewed':
      return tpl('구독 갱신', { plan: String(p.plan ?? ''), amount: krw(Number(p.amountKrw ?? 0)) });
    case 'billing.payment_failed':
      return t('결제 실패');
    case 'billing.checkout_canceled':
      return t('결제 취소');
    case 'billing.cancel_scheduled':
      return tpl('구독 해지 예약', { plan: String(p.plan ?? '') });
    case 'billing.resumed':
      return tpl('구독 해지 예약 취소', { plan: String(p.plan ?? '') });
    default:
      return event.type;
  }
}

export function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString(localeOf(currentLanguage()), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
