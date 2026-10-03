import { randomUUID } from 'node:crypto';
import { TEAMS } from '../shared/teams.ts';
import type { Proposal, Recommendation, Role, Task, TeamId } from '../shared/types.ts';
import { parseJson } from './ai.ts';
import { store } from './store.ts';

export interface Inputs {
  text: string;
  ids: string[];
  count: number;
}

export interface TeamSpec {
  duty: Record<Role, string>;
  allowClarify: boolean;
  rejectFirstInMock: boolean;
  defaultTitle: string;
  gatherInputs(description: string): Inputs;
  briefAsk: string;
  researchAsk: string;
  draftAsk: string;
  reviewAsk: string;
  mock: {
    brief(task: Task): string;
    research(task: Task): string;
    draft(task: Task): string;
    rejectReason: string;
  };
  buildProposal(json: string | null, task: Task): Proposal;
  onApprove(json: string | null, task: Task): string;
}

const krw = (n: number) => `₩${Math.round(n).toLocaleString('ko-KR')}`;
const today = () => new Date().toISOString().slice(0, 10);
const jsonBlock = (data: unknown) => '\n\n```json\n' + JSON.stringify(data, null, 2) + '\n```\n';
const youtubeSearch = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
const naverSearch = (q: string) => `https://search.naver.com/search.naver?query=${encodeURIComponent(q)}`;

// ───────────────────────────── 개발팀 ─────────────────────────────

const dev: TeamSpec = {
  duty: {
    manager: '사용자의 과제 요청을 리서처가 바로 작업할 수 있는 작업 지시서(목표, 범위, 결과물 형식)로 짧게 정리한다.',
    researcher:
      '작업 지시서를 바탕으로 핵심 사실과 수치를 수집해 조사 메모로 정리한다. 웹 검색 도구는 없으므로 알고 있는 지식으로 작성하고, 불확실한 내용은 "확인 필요"로 표시한다.',
    writer: '작업 지시서와 조사 메모를 분석해 읽기 쉬운 한국어 Markdown 보고서로 정리한다.',
    reviewer: '보고서의 근거, 출처, 형식, 논리를 엄격하지만 공정하게 검토한다.',
  },
  allowClarify: true,
  rejectFirstInMock: true,
  defaultTitle: '과제 조사·분석',
  gatherInputs(description) {
    return { text: description || '(추가 설명 없음)', ids: [], count: 1 };
  },
  briefAsk: '작업 지시서를 5줄 이내로 작성해라.',
  researchAsk: '핵심 사실과 수치를 항목별 조사 메모로 정리해라. 각 항목에 출처 후보 또는 "확인 필요"를 붙여라.',
  draftAsk: 'Markdown 보고서를 작성해라. 순서: 요약, 본문, 결론, 출처. 보고서 본문만 출력한다.',
  reviewAsk: '보고서를 평가해라. 근거와 출처가 부족하거나 형식이 어긋나면 반려한다.',
  mock: {
    brief: (t) =>
      `목표: "${t.title}"에 대한 의사결정용 보고서 작성\n범위: 현황, 주요 선택지, 장단점, 위험 요소\n형식: Markdown 보고서 (요약 → 본문 → 결론 → 출처)\n요청 메모: ${t.description || '없음'}`,
    research: (t) =>
      [
        `## ${t.title} 조사 메모`,
        '- 현황: 관련 시장과 도구가 빠르게 늘고 있음 (확인 필요: 최신 통계)',
        '- 주요 선택지: 상위 3개 접근 방식이 전체 사례의 절반 이상 (업계 기사 기준, 확인 필요)',
        '- 비용: 초기 도입 비용보다 운영·유지 비용 비중이 큼 (추정)',
        '- 위험 요소: 데이터 품질, 보안, 담당자 학습 비용',
        '- 출처 후보: 공식 문서, 업계 협회 보고서, 주요 기술 블로그',
      ].join('\n'),
    draft: (t) => {
      const direction = t.clarifications.at(-1) ?? '종합 검토';
      const revised = t.reviews.some((r) => !r.approved) || t.userChangeRequests.length > 0;
      return [
        `# ${t.title}`,
        '',
        '## 요약',
        `- "${direction}" 관점으로 정리했습니다.`,
        '- 단기에는 작은 범위로 시험 도입하고, 효과가 확인되면 확대하는 것을 권합니다.',
        '',
        '## 본문',
        '### 1. 현황',
        '관련 도구와 사례가 빠르게 늘고 있으며, 운영 비용이 총비용의 큰 부분을 차지합니다.',
        '### 2. 선택지 비교',
        '| 선택지 | 장점 | 단점 |',
        '| --- | --- | --- |',
        '| A. 직접 구축 | 자유도 높음 | 초기 비용·시간 큼 |',
        '| B. 기성 도구 | 빠른 도입 | 맞춤화 한계 |',
        '| C. 혼합 | 균형 | 관리 복잡도 |',
        '### 3. 위험 요소',
        '- 데이터 품질과 보안 정책 정비가 선행되어야 합니다.',
        '',
        '## 결론',
        'B안으로 2주 시험 운영 후 지표(처리 시간, 오류율)를 보고 C안 확대 여부를 결정합니다.',
        '',
        '## 출처',
        revised ? '- 공식 문서 (2026년 기준)\n- 업계 협회 연간 보고서\n- 사내 유사 사례 회고' : '- (출처 정리 중)',
      ].join('\n');
    },
    rejectReason: '출처 항목이 비어 있고, 결론의 근거가 본문 수치와 연결되지 않습니다',
  },
  buildProposal: (_json, task) => ({
    headline: '승인하면 보고서가 보고서함에 보관됩니다.',
    lines: [`📄 ${task.title}`],
  }),
  onApprove: (_json, task) => `보고서 "${task.title}"를 보고서함에 보관했어요.`,
};

// ───────────────────────────── 인사팀 ─────────────────────────────

interface HrJson {
  summaries: { mailId: string; category: string; summary: string; action: string }[];
  events: { mailId: string; title: string; date: string; start: string; end: string; location: string }[];
}

const parseHr = (json: string | null): HrJson => {
  const p = parseJson<Partial<HrJson>>(json ?? '', {});
  return { summaries: Array.isArray(p.summaries) ? p.summaries : [], events: Array.isArray(p.events) ? p.events : [] };
};

const hrCategory = (subject: string, hasEvent: boolean) =>
  hasEvent ? '일정' : /할인|뉴스레터|쿠폰|이벤트/.test(subject) ? '광고' : /신청|요청|회신/.test(subject) ? '요청' : '정보';

const hr: TeamSpec = {
  duty: {
    manager: '메일함에 쌓인 새 메일 수와 우선순위를 확인해 메일 담당에게 처리 지시를 내린다.',
    researcher: '메일마다 분류(일정/요청/정보/광고), 한 줄 요약, 필요한 조치를 정리한다.',
    writer: '분류 결과를 바탕으로 메일 정리 보고서를 쓰고, 일정이 담긴 메일에서 날짜·시간·장소를 뽑아 일정 데이터로 만든다.',
    reviewer: '날짜·시간 오류, 중복 일정, 광고 메일의 잘못된 등록, 누락된 메일을 검토한다.',
  },
  allowClarify: false,
  rejectFirstInMock: false,
  defaultTitle: '메일함 정리와 일정 등록',
  gatherInputs() {
    const mails = store.data.mailbox.filter((m) => !m.processed);
    if (mails.length === 0) throw new Error('처리할 새 메일이 없어요. 팀 자료 탭에서 "새 메일 도착"을 눌러 보세요.');
    const text = mails
      .map((m) => `[mailId: ${m.id}]\n보낸 사람: ${m.from}\n제목: ${m.subject}\n받은 시각: ${m.receivedAt}\n본문: ${m.body}`)
      .join('\n\n');
    return { text: `오늘 날짜: ${today()}\n\n${text}`, ids: mails.map((m) => m.id), count: mails.length };
  },
  briefAsk: '처리할 메일 수, 급해 보이는 메일, 정리 방향을 5줄 이내 작업 지시서로 작성해라.',
  researchAsk: '메일마다 mailId, 분류(일정/요청/정보/광고), 한 줄 요약, 필요한 조치를 표로 정리해라.',
  draftAsk: [
    '메일 정리 보고서를 Markdown으로 작성해라. (요약 → 메일별 정리 → 등록할 일정 → 사용자가 직접 할 일)',
    '날짜가 확실한 일정만 events에 넣고, 날짜는 YYYY-MM-DD, 시간은 HH:MM 형식으로 쓴다.',
    '보고서 맨 끝에 반드시 아래 형식의 ```json 코드블록을 붙인다:',
    '{"summaries":[{"mailId":"","category":"","summary":"","action":""}],"events":[{"mailId":"","title":"","date":"","start":"","end":"","location":""}]}',
  ].join('\n'),
  reviewAsk: '날짜·시간 오류, 광고의 일정 등록, 누락된 메일, JSON 형식 오류가 있으면 반려한다.',
  mock: {
    brief: (t) => `새 메일 ${t.inputIds.length}통을 확인했습니다.\n일정이 담긴 메일은 캘린더 후보로, 요청 메일은 할 일로, 광고는 보관 처리합니다.`,
    research: (t) => {
      const rows = store.data.mailbox
        .filter((m) => t.inputIds.includes(m.id))
        .map((m) => `| ${m.subject} | ${hrCategory(m.subject, Boolean(m.mockEvent))} | ${m.from.split('<')[0].trim()} |`);
      return ['| 제목 | 분류 | 보낸 사람 |', '| --- | --- | --- |', ...rows].join('\n');
    },
    draft: (t) => {
      const mails = store.data.mailbox.filter((m) => t.inputIds.includes(m.id));
      const summaries = mails.map((m) => {
        const category = hrCategory(m.subject, Boolean(m.mockEvent));
        return {
          mailId: m.id,
          category,
          summary: m.subject,
          action: category === '일정' ? '캘린더 등록' : category === '요청' ? '직접 회신 필요' : category === '광고' ? '보관' : '읽고 보관',
        };
      });
      const events = mails.filter((m) => m.mockEvent).map((m) => ({ mailId: m.id, ...m.mockEvent! }));
      const todo = summaries.filter((s) => s.category === '요청');
      return [
        '# 메일함 정리 보고서',
        '',
        '## 요약',
        `- 새 메일 ${mails.length}통 중 일정 ${events.length}건, 회신이 필요한 요청 ${todo.length}건이 있습니다.`,
        '',
        '## 메일별 정리',
        ...summaries.map((s) => `- **[${s.category}]** ${s.summary} → ${s.action}`),
        '',
        '## 등록할 일정',
        ...(events.length ? events.map((e) => `- ${e.date} ${e.start}~${e.end} ${e.title} (${e.location})`) : ['- 없음']),
        '',
        '## 직접 하실 일',
        ...(todo.length ? todo.map((s) => `- ${s.summary}`) : ['- 없음']),
      ].join('\n') + jsonBlock({ summaries, events });
    },
    rejectReason: '일정 시간 표기가 일부 누락되었습니다',
  },
  buildProposal(json) {
    const { summaries, events } = parseHr(json);
    return {
      headline: `승인하면 일정 ${events.length}건을 캘린더에 등록하고 메일 ${summaries.length}통을 처리 완료로 표시합니다.`,
      lines: [
        ...events.map((e) => `📅 ${e.date} ${e.start}~${e.end} ${e.title}${e.location ? ` (${e.location})` : ''}`),
        ...summaries.map((s) => `✉️ [${s.category}] ${s.summary} → ${s.action}`),
      ],
    };
  },
  onApprove(json, task) {
    const { events } = parseHr(json);
    let added = 0;
    store.mutate((s) => {
      for (const e of events) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue;
        if (s.calendar.some((c) => c.title === e.title && c.date === e.date)) continue;
        s.calendar.push({
          id: `cal_${randomUUID().slice(0, 8)}`,
          title: e.title,
          date: e.date,
          start: e.start || '',
          end: e.end || '',
          location: e.location || '',
          source: e.mailId,
        });
        added += 1;
      }
      s.calendar.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
      for (const m of s.mailbox) if (task.inputIds.includes(m.id)) m.processed = true;
    });
    return `일정 ${added}건을 캘린더에 등록하고 메일 ${task.inputIds.length}통을 정리했어요.`;
  },
};

// ───────────────────────────── 경영팀 ─────────────────────────────

interface MgmtJson {
  allocations: { officeId: string; budgetKrw: number; reason: string }[];
}

const parseMgmt = (json: string | null) => {
  const p = parseJson<Partial<MgmtJson>>(json ?? '', {});
  const valid = new Set(store.data.offices.map((o) => o.id));
  return (Array.isArray(p.allocations) ? p.allocations : []).filter(
    (a) => valid.has(a.officeId) && Number.isFinite(Number(a.budgetKrw)) && Number(a.budgetKrw) >= 0,
  );
};

const mgmt: TeamSpec = {
  duty: {
    manager: '이번 달 AI 예산 목표와 검토 관점을 정리해 데이터 담당에게 넘긴다.',
    researcher: '팀별 AI 비용, 인정 가치, 가상 이익, 완료 업무 수를 표로 정리하고 특징을 짚는다.',
    writer: '팀별 실적을 바탕으로 월 AI 예산 배분안을 작성한다. 이익이 나는 팀에 우선 배분하되 모든 팀에 최소 운영 예산을 남기고, 총합은 월 예산을 넘지 않는다.',
    reviewer: '배분 총합이 월 예산 이내인지, 근거가 실적과 맞는지, 적자 팀 조치가 타당한지 감사한다.',
  },
  allowClarify: false,
  rejectFirstInMock: false,
  defaultTitle: '이번 달 AI 예산 배분안',
  gatherInputs(description) {
    const { offices, agents, tasks, budget } = store.data;
    const rows = offices.map((o) => {
      const done = tasks.filter((t) => t.officeId === o.id && t.status === 'completed').length;
      return `| ${o.id} | ${o.name} | ${krw(o.spentKrw)} | ${krw(o.valueKrw)} | ${krw(o.valueKrw - o.spentKrw)} | ${done} | ${o.budgetKrw === null ? '없음' : krw(o.budgetKrw)} | ${agents.filter((a) => a.officeId === o.id).length} |`;
    });
    const text = [
      `회사 월 AI 예산: ${krw(budget.monthlyKrw)} (이번 달 사용 ${krw(budget.spentKrw)}, 인정 가치 ${krw(budget.valueKrw)})`,
      '| officeId | 팀 | 이번 달 비용 | 인정 가치 | 가상 이익 | 완료 업무 | 현재 예산 상한 | 인원 |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
      ...rows,
      description ? `\n사용자 메모: ${description}` : '',
    ].join('\n');
    return { text, ids: [], count: 1 };
  },
  briefAsk: '이번 달 예산 배분의 목표와 검토 관점을 5줄 이내 작업 지시서로 작성해라.',
  researchAsk: '팀별 비용·가치·이익·완료 업무를 분석해 잘하는 팀과 개선이 필요한 팀을 정리해라.',
  draftAsk: [
    '월 AI 예산 배분안을 Markdown으로 작성해라. (요약 → 팀별 실적 → 배분안 표 → 근거와 주의점)',
    '모든 팀(officeId)에 대해 배분액을 정하고, 총합은 회사 월 예산을 넘지 않는다.',
    '보고서 맨 끝에 반드시 아래 형식의 ```json 코드블록을 붙인다:',
    '{"allocations":[{"officeId":"","budgetKrw":0,"reason":""}]}',
  ].join('\n'),
  reviewAsk: '배분 총합 초과, 누락된 팀, 실적과 맞지 않는 근거, JSON 형식 오류가 있으면 반려한다.',
  mock: {
    brief: () => '이번 달 팀별 AI 비용과 인정 가치를 비교해 예산 상한을 다시 정합니다.\n원칙: 모든 팀 최소 운영 예산 보장, 남는 예산은 이익 비중대로 배분.',
    research: (t) => `## 팀별 실적\n${t.inputText}\n\n- 이익이 큰 팀부터 우선 배분 후보로 봅니다.`,
    draft: () => {
      const { offices, budget } = store.data;
      const total = budget.monthlyKrw;
      const floor = Math.floor((total * 0.1) / 1000) * 1000;
      const remain = total - floor * offices.length;
      const profits = offices.map((o) => Math.max(0, o.valueKrw - o.spentKrw));
      const sum = profits.reduce((a, b) => a + b, 0);
      const allocations = offices.map((o, i) => {
        const extra = sum > 0 ? (remain * profits[i]) / sum : remain / offices.length;
        const amount = floor + Math.floor(extra / 1000) * 1000;
        const reason =
          profits[i] > 0
            ? `가상 이익 ${krw(profits[i])}으로 성과가 좋아 추가 배분`
            : o.spentKrw > o.valueKrw
              ? '비용 대비 성과가 낮아 최소 운영 예산 위주'
              : '실적이 아직 없어 기본 배분';
        return { officeId: o.id, budgetKrw: amount, reason };
      });
      const allocated = allocations.reduce((a, b) => a + b.budgetKrw, 0);
      return [
        '# 이번 달 AI 예산 배분안',
        '',
        '## 요약',
        `- 회사 월 예산 ${krw(total)} 중 ${krw(allocated)}을 팀별 상한으로 배분합니다.`,
        `- 모든 팀에 최소 ${krw(floor)}을 보장하고, 나머지는 가상 이익 비중대로 나눴습니다.`,
        '',
        '## 배분안',
        '| 팀 | 배분액 | 근거 |',
        '| --- | --- | --- |',
        ...allocations.map((a) => `| ${offices.find((o) => o.id === a.officeId)?.name} | ${krw(a.budgetKrw)} | ${a.reason} |`),
        '',
        '## 주의점',
        '- 상한에 도달한 팀은 이번 달 남은 기간 동안 업무가 멈춥니다. 필요하면 경영팀 자료 탭에서 직접 조정하세요.',
      ].join('\n') + jsonBlock({ allocations });
    },
    rejectReason: '배분 근거가 실적 수치와 연결되지 않습니다',
  },
  buildProposal(json) {
    const allocations = parseMgmt(json);
    const offices = store.data.offices;
    return {
      headline: `승인하면 ${allocations.length}개 팀의 월 예산 상한을 아래처럼 바꿉니다.`,
      lines: allocations.map((a) => {
        const o = offices.find((x) => x.id === a.officeId)!;
        const before = o.budgetKrw === null ? '상한 없음' : krw(o.budgetKrw);
        return `💰 ${o.name}: ${before} → ${krw(Number(a.budgetKrw))} · ${a.reason}`;
      }),
    };
  },
  onApprove(json) {
    const allocations = parseMgmt(json);
    store.mutate((s) => {
      for (const a of allocations) {
        const o = s.offices.find((x) => x.id === a.officeId);
        if (o) o.budgetKrw = Math.round(Number(a.budgetKrw));
      }
    });
    return `${allocations.length}개 팀의 예산 상한을 반영했어요.`;
  },
};

// ───────────────────────────── 서포터팀 ─────────────────────────────

interface SupportJson {
  replies: { inquiryId: string; category: string; urgency: string; subject: string; body: string }[];
}

const parseSupport = (json: string | null) => {
  const p = parseJson<Partial<SupportJson>>(json ?? '', {});
  return Array.isArray(p.replies) ? p.replies : [];
};

const REPLY_TEMPLATE: Record<string, string> = {
  배송: '주문하신 상품의 배송이 늦어져 불편을 드려 죄송합니다. 담당 부서에 배송 현황을 확인 요청했으며, 확인되는 대로 다시 안내드리겠습니다.',
  환불: '착용하지 않은 상품은 수령 후 7일 이내 환불 신청이 가능합니다. 다만 최종 환불 여부는 상품 확인 후 확정되는 점 양해 부탁드립니다.',
  오류: '이용에 불편을 드려 죄송합니다. 앱을 최신 버전으로 업데이트한 뒤 다시 시도해 주시고, 같은 문제가 계속되면 사용 기기와 OS 버전을 알려주세요. 개발팀에 바로 전달하겠습니다.',
  칭찬: '따뜻한 말씀 감사합니다! 상담해 드린 직원에게 꼭 전달하겠습니다. 앞으로도 좋은 경험을 드릴 수 있도록 노력하겠습니다.',
  사용법: '여러 파일은 업로드 창에서 Shift 또는 Ctrl 키를 누른 채 선택하시면 한 번에 올리실 수 있습니다. 자세한 방법은 도움말 센터의 "파일 업로드" 항목을 참고해 주세요.',
};

const URGENCY: Record<string, string> = { 오류: '높음', 배송: '보통', 환불: '보통', 사용법: '낮음', 칭찬: '낮음' };

const support: TeamSpec = {
  duty: {
    manager: '새로 들어온 고객 문의 수와 급한 문의를 확인해 분류 담당에게 넘긴다.',
    researcher: '문의마다 유형(배송/환불/사용법/오류/칭찬/기타)과 긴급도(높음/보통/낮음)를 매기고 핵심 요구를 정리한다.',
    writer: '문의별로 정중하고 짧은 답변 초안을 쓴다. 확인되지 않은 약속(환불 확정, 날짜 보장)은 하지 않는다.',
    reviewer: '말투, 사실 여부, 지키지 못할 약속, 개인정보 노출을 검수한다.',
  },
  allowClarify: false,
  rejectFirstInMock: true,
  defaultTitle: '고객 문의 답변 초안',
  gatherInputs() {
    const list = store.data.inquiries.filter((q) => q.status === 'new');
    if (list.length === 0) throw new Error('처리할 새 문의가 없어요. 팀 자료 탭에서 "새 문의 도착"을 눌러 보세요.');
    const text = list.map((q) => `[inquiryId: ${q.id}]\n고객: ${q.customer}\n제목: ${q.subject}\n내용: ${q.body}`).join('\n\n');
    return { text, ids: list.map((q) => q.id), count: list.length };
  },
  briefAsk: '새 문의 수, 급한 문의, 답변 방향을 5줄 이내 작업 지시서로 작성해라.',
  researchAsk: '문의마다 inquiryId, 유형, 긴급도, 고객의 핵심 요구를 표로 정리해라.',
  draftAsk: [
    '문의별 답변 초안 묶음을 Markdown으로 작성해라. (요약 → 문의별 분류와 답변 초안)',
    '답변은 실제로 발송되지 않고 사용자가 확인한 뒤 직접 보낸다.',
    '보고서 맨 끝에 반드시 아래 형식의 ```json 코드블록을 붙인다:',
    '{"replies":[{"inquiryId":"","category":"","urgency":"","subject":"","body":""}]}',
  ].join('\n'),
  reviewAsk: '지키지 못할 약속, 사실과 다른 안내, 무례한 말투, 개인정보 노출, JSON 형식 오류가 있으면 반려한다.',
  mock: {
    brief: (t) => `새 문의 ${t.inputIds.length}건을 접수했습니다.\n오류 문의를 가장 먼저, 칭찬 문의는 마지막에 처리합니다.`,
    research: (t) => {
      const rows = store.data.inquiries
        .filter((q) => t.inputIds.includes(q.id))
        .map((q) => `| ${q.customer} | ${q.subject} | ${q.mockCategory ?? '기타'} | ${URGENCY[q.mockCategory ?? ''] ?? '보통'} |`);
      return ['| 고객 | 제목 | 유형 | 긴급도 |', '| --- | --- | --- | --- |', ...rows].join('\n');
    },
    draft: (t) => {
      const revised = t.reviews.some((r) => !r.approved) || t.userChangeRequests.length > 0;
      const replies = store.data.inquiries
        .filter((q) => t.inputIds.includes(q.id))
        .map((q) => {
          const category = q.mockCategory ?? '기타';
          let body = REPLY_TEMPLATE[category] ?? '문의 주셔서 감사합니다. 확인 후 빠르게 안내드리겠습니다.';
          if (!revised && category === '배송') body += ' 내일까지는 꼭 받아보실 수 있습니다.';
          return {
            inquiryId: q.id,
            category,
            urgency: URGENCY[category] ?? '보통',
            subject: `Re: ${q.subject}`,
            body: `${q.customer} 고객님, 안녕하세요.\n${body}\n감사합니다.`,
          };
        });
      return [
        '# 고객 문의 답변 초안',
        '',
        '## 요약',
        `- 문의 ${replies.length}건 (긴급 ${replies.filter((r) => r.urgency === '높음').length}건)`,
        '',
        ...replies.flatMap((r) => [`## [${r.urgency}] ${r.category} · ${r.subject}`, '', r.body.replace(/\n/g, '  \n'), '']),
      ].join('\n') + jsonBlock({ replies });
    },
    rejectReason: '배송 문의 답변에 "내일까지는 꼭 받아보실 수 있습니다"라는 확인되지 않은 약속이 있습니다',
  },
  buildProposal(json) {
    const replies = parseSupport(json);
    return {
      headline: `승인하면 답변 ${replies.length}건이 발송 대기함에 들어갑니다. 실제 발송은 하지 않아요.`,
      lines: replies.map((r) => `✉️ [${r.urgency}·${r.category}] ${r.subject}`),
    };
  },
  onApprove(json, task) {
    const replies = parseSupport(json);
    const at = new Date().toISOString();
    store.mutate((s) => {
      for (const r of replies) {
        const q = s.inquiries.find((x) => x.id === r.inquiryId && task.inputIds.includes(x.id));
        if (!q) continue;
        q.status = 'reply_ready';
        s.outbox.unshift({
          id: `out_${randomUUID().slice(0, 8)}`,
          inquiryId: q.id,
          to: q.customer,
          subject: r.subject || `Re: ${q.subject}`,
          body: r.body,
          category: r.category,
          urgency: r.urgency,
          approvedAt: at,
        });
      }
      s.outbox = s.outbox.slice(0, 100);
    });
    return `답변 ${replies.length}건을 발송 대기함에 넣었어요.`;
  },
};

// ───────────────────────────── 복지팀 ─────────────────────────────

interface WelfareJson {
  recommendations: { kind: Recommendation['kind']; title: string; reason: string; query: string }[];
}

const KINDS: Recommendation['kind'][] = ['event', 'youtube', 'activity', 'rest'];
const KIND_EMOJI: Record<Recommendation['kind'], string> = { event: '🎟️', youtube: '▶️', activity: '🚶', rest: '☕' };

const parseWelfare = (json: string | null) => {
  const p = parseJson<Partial<WelfareJson>>(json ?? '', {});
  return (Array.isArray(p.recommendations) ? p.recommendations : [])
    .filter((r) => r && typeof r.title === 'string')
    .map((r) => ({ ...r, kind: KINDS.includes(r.kind) ? r.kind : 'activity' }));
};

const linkFor = (kind: Recommendation['kind'], query: string) =>
  !query ? '' : kind === 'youtube' ? youtubeSearch(query) : kind === 'rest' ? '' : naverSearch(query);

function upcomingDays() {
  const days: { date: string; events: string[] }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const date = d.toISOString().slice(0, 10);
    days.push({ date, events: store.data.calendar.filter((c) => c.date === date).map((c) => `${c.start} ${c.title}`) });
  }
  return days;
}

const welfare: TeamSpec = {
  duty: {
    manager: '사용자의 이번 주 일정 밀도와 관심사를 확인해 추천 방향을 정한다.',
    researcher: '관심사별로 즐길 거리 후보(공연, 전시, 모임, 유튜브 영상 주제)와 쉬어야 할 날을 찾는다.',
    writer: '휴식·문화생활 추천 카드를 5~8개 쓴다. 일정이 몰린 날에는 휴식 추천을 먼저 넣는다. 링크는 직접 만들지 말고 검색어(query)만 쓴다.',
    reviewer: '관심사와 동떨어진 추천, 일정과 겹치는 추천, 확인할 수 없는 날짜·장소 단정을 걸러낸다.',
  },
  allowClarify: false,
  rejectFirstInMock: false,
  defaultTitle: '이번 주 휴식·문화생활 추천',
  gatherInputs(description) {
    const { interests, recommendations } = store.data;
    const days = upcomingDays();
    const text = [
      `오늘 날짜: ${today()}`,
      `관심사: ${interests.keywords.join(', ') || '(없음)'}`,
      `지역: ${interests.region || '(미정)'}`,
      `메모: ${interests.note || '(없음)'}`,
      '',
      '[앞으로 7일 일정]',
      ...days.map((d) => `- ${d.date}: ${d.events.length ? d.events.join(', ') : '일정 없음'}`),
      '',
      `[최근 추천 (중복 피하기)] ${recommendations.slice(0, 8).map((r) => r.title).join(' / ') || '없음'}`,
      description ? `\n사용자 요청: ${description}` : '',
    ].join('\n');
    return { text, ids: [], count: 1 };
  },
  briefAsk: '일정이 몰린 날, 관심사, 추천 방향을 5줄 이내 작업 지시서로 작성해라.',
  researchAsk: '관심사별 즐길 거리 후보와 쉬어야 할 날을 항목별로 정리해라. 실제 날짜가 확실하지 않은 행사는 "확인 필요"로 표시한다.',
  draftAsk: [
    '추천 카드 묶음을 Markdown으로 작성해라. (이번 주 컨디션 한마디 → 추천 카드 5~8개)',
    'kind는 event(공연·전시·행사), youtube(볼 영상 주제), activity(가벼운 활동), rest(휴식) 중 하나다.',
    'URL은 쓰지 말고 검색어(query)만 쓴다. 서버가 검색 링크로 바꾼다.',
    '보고서 맨 끝에 반드시 아래 형식의 ```json 코드블록을 붙인다:',
    '{"recommendations":[{"kind":"youtube","title":"","reason":"","query":""}]}',
  ].join('\n'),
  reviewAsk: '관심사와 무관한 추천, 일정과 겹치는 추천, 날짜를 단정한 행사, 지어낸 URL, JSON 형식 오류가 있으면 반려한다.',
  mock: {
    brief: () => {
      const busy = upcomingDays().filter((d) => d.events.length >= 2);
      return `관심사: ${store.data.interests.keywords.join(', ')}\n${busy.length ? `일정이 몰린 날 ${busy.length}일 → 휴식 추천 우선` : '이번 주는 여유가 있어 문화생활 위주로 추천'}`;
    },
    research: () =>
      store.data.interests.keywords
        .map((k) => `- ${k}: 관련 공연·전시 (날짜 확인 필요), 입문 영상, 주말 활동 후보`)
        .join('\n'),
    draft: () => {
      const { interests } = store.data;
      const region = interests.region || '서울';
      const busy = upcomingDays().filter((d) => d.events.length >= 2);
      const recs: WelfareJson['recommendations'] = [];
      for (const d of busy.slice(0, 1)) {
        recs.push({
          kind: 'rest',
          title: `${d.date} 저녁은 일찍 쉬기`,
          reason: `이날 일정이 ${d.events.length}개 몰려 있어요. 마지막 일정 후에는 휴식을 잡아두세요.`,
          query: '',
        });
      }
      for (const k of interests.keywords.slice(0, 3)) {
        recs.push({ kind: 'youtube', title: `${k} 입문 영상 한 편`, reason: `관심사 "${k}"를 가볍게 즐기기 좋아요.`, query: `${k} 입문` });
        recs.push({ kind: 'event', title: `${region} ${k} 관련 행사 찾아보기`, reason: '이번 주말 일정이 비어 있다면 들러볼 만해요. 날짜는 확인이 필요해요.', query: `${region} ${k} 공연 전시` });
      }
      recs.push({ kind: 'activity', title: '점심 후 15분 산책', reason: '앉아 있는 시간이 길 때 집중력 회복에 좋아요.', query: `${region} 산책하기 좋은 곳` });
      const top = recs.slice(0, 8);
      return [
        '# 이번 주 휴식·문화생활 추천',
        '',
        busy.length ? `일정이 몰린 날이 ${busy.length}일 있어요. 쉬는 시간부터 챙겨요. 🌿` : '이번 주는 비교적 여유가 있어요. 하고 싶던 걸 해봐요. 🌿',
        '',
        ...top.map((r) => `- ${KIND_EMOJI[r.kind]} **${r.title}** — ${r.reason}`),
      ].join('\n') + jsonBlock({ recommendations: top });
    },
    rejectReason: '관심사와 동떨어진 추천이 섞여 있습니다',
  },
  buildProposal(json) {
    const recs = parseWelfare(json);
    return {
      headline: `승인하면 추천 ${recs.length}개가 추천 보관함에 저장됩니다.`,
      lines: recs.map((r) => `${KIND_EMOJI[r.kind]} ${r.title} — ${r.reason}`),
    };
  },
  onApprove(json) {
    const recs = parseWelfare(json);
    const at = new Date().toISOString();
    store.mutate((s) => {
      const items: Recommendation[] = recs.map((r) => ({
        id: `rec_${randomUUID().slice(0, 8)}`,
        kind: r.kind,
        title: r.title,
        reason: r.reason ?? '',
        link: linkFor(r.kind, r.query ?? ''),
        createdAt: at,
      }));
      s.recommendations = [...items, ...s.recommendations].slice(0, 60);
    });
    return `추천 ${recs.length}개를 추천 보관함에 저장했어요.`;
  },
};

export const TEAM_SPECS: Record<TeamId, TeamSpec> = { dev, hr, mgmt, support, welfare };

export function systemPromptFor(team: TeamId, role: Role) {
  return `너는 AI 회사 "${TEAMS[team].name}"의 ${TEAMS[team].roleTitles[role]}다. ${TEAM_SPECS[team].duty[role]}`;
}
