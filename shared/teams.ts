import type { Role, StepId, TaskTypeEntry, TeamId } from './types.ts';

export interface TeamMeta {
  id: TeamId;
  name: string;
  emoji: string;
  description: string;
  floor: [string, string];
  wall: string;
  roleTitles: Record<Role, string>;
  agentNames: Record<Role, string>;
  defaultRules: Record<Role, string>;
  stepLabels: Record<StepId, string>;
  taskTypes: TaskTypeEntry[];
  inputLabel: string | null;
  autoRunLabel: string | null;
}

export const TEAM_ORDER: TeamId[] = ['dev', 'hr', 'mgmt', 'support', 'welfare'];

/** The office scene has a desk for each of these; raise both together. */
export const MAX_STAFF_PER_OFFICE = 8;

export const TEAMS: Record<TeamId, TeamMeta> = {
  dev: {
    id: 'dev',
    name: '개발팀',
    emoji: '💻',
    description: '특정 과제를 수집하고 분석·정리한 뒤 검토해 보고서로 만듭니다.',
    floor: ['#e3cfa8', '#d8c296'],
    wall: '#f2e6cf',
    roleTitles: { manager: '개발 팀장', researcher: '리서처', writer: '분석·정리', reviewer: '리뷰어' },
    agentNames: { manager: '도윤 팀장', researcher: '하루', writer: '소이', reviewer: '민' },
    defaultRules: {
      manager: '과제의 목표, 범위, 결과물 형식을 한 문단으로 정리해 리서처에게 전달한다.',
      researcher: '핵심 사실과 수치를 항목별로 정리하고, 각 항목에 출처 또는 "확인 필요"를 붙인다.',
      writer: '보고서는 Markdown으로 쓰고 요약, 본문, 결론, 출처 순서를 지킨다.',
      reviewer: '근거 없는 주장, 출처 누락, 형식 위반을 찾아 구체적으로 지적한다.',
    },
    stepLabels: {
      intake: '과제 접수',
      research: '자료 수집',
      write: '분석·정리',
      review: '검토',
      approval: '사용자 승인',
      done: '보고서함',
    },
    taskTypes: [
      { id: 'research_report', label: '과제 조사·분석 보고서', standardHours: 3 },
      {
        id: 'tech_review',
        label: '기술·도구 비교 검토',
        standardHours: 2,
        flow: [
          { kind: 'brief', label: '비교 과제 접수', role: 'manager' },
          { kind: 'research', label: '후보 조사', role: 'researcher' },
          {
            kind: 'research',
            label: '비교 기준 정리',
            role: 'reviewer',
            loop: { to: 1, when: '비교할 후보가 2개 미만이면', max: 1 },
          },
          { kind: 'draft', label: '비교표 작성', role: 'writer' },
          { kind: 'review', label: '검토', role: 'reviewer' },
          { kind: 'approval', label: '사용자 승인', role: null },
        ],
      },
      {
        id: 'summary',
        label: '자료 요약',
        standardHours: 1,
        flow: [
          { kind: 'brief', label: '자료 접수', role: 'manager' },
          { kind: 'draft', label: '요약 작성', role: 'writer' },
          { kind: 'approval', label: '사용자 승인', role: null },
        ],
      },
    ],
    inputLabel: null,
    autoRunLabel: null,
  },
  hr: {
    id: 'hr',
    name: '인사팀',
    emoji: '📬',
    description: '메일함을 확인해 분류·요약하고, 일정이 담긴 메일은 캘린더에 등록합니다.',
    floor: ['#d6e4f0', '#c8d9e8'],
    wall: '#eef4f9',
    roleTitles: { manager: '인사 팀장', researcher: '메일 담당', writer: '일정 담당', reviewer: '검토자' },
    agentNames: { manager: '서연 팀장', researcher: '메일리', writer: '달력이', reviewer: '지후' },
    defaultRules: {
      manager: '처리할 메일 수와 우선순위를 확인하고 메일 담당에게 넘긴다.',
      researcher: '메일마다 분류(일정/요청/정보/광고), 요약 한 줄, 필요한 조치를 정리한다.',
      writer: '일정이 담긴 메일만 날짜, 시간, 장소를 뽑아 일정으로 만든다. 날짜가 불확실하면 등록하지 않고 확인 필요로 남긴다.',
      reviewer: '날짜·시간 오류, 중복 일정, 광고 메일의 잘못된 등록을 확인한다.',
    },
    stepLabels: {
      intake: '메일함 확인',
      research: '분류·요약',
      write: '일정 정리',
      review: '검토',
      approval: '사용자 승인',
      done: '캘린더 등록',
    },
    taskTypes: [{ id: 'mail_triage', label: '메일함 정리와 일정 등록', standardHours: 0.5, hoursPerItem: 0.2 }],
    inputLabel: '처리할 메일',
    autoRunLabel: '새 메일 자동 확인',
  },
  mgmt: {
    id: 'mgmt',
    name: '경영팀',
    emoji: '📊',
    description: '팀별 비용과 성과를 모아 이번 달 AI 예산 배분안을 만듭니다.',
    floor: ['#e8e0d0', '#ddd3bf'],
    wall: '#f5f0e6',
    roleTitles: { manager: '경영 실장', researcher: '데이터 담당', writer: '예산 담당', reviewer: '감사' },
    agentNames: { manager: '강 실장', researcher: '숫자', writer: '예림', reviewer: '감사관 오' },
    defaultRules: {
      manager: '이번 달 예산 목표와 검토 관점을 정리해 데이터 담당에게 넘긴다.',
      researcher: '팀별 비용, 인정 가치, 이익, 완료 업무 수를 표로 정리한다.',
      writer: '이익이 나는 팀에 우선 배분하되, 모든 팀에 최소 운영 예산을 남긴다. 총합은 월 예산을 넘지 않는다.',
      reviewer: '배분 총합, 근거, 적자 팀에 대한 조치가 타당한지 감사한다.',
    },
    stepLabels: {
      intake: '요청 접수',
      research: '비용·성과 수집',
      write: '예산안 작성',
      review: '감사 검토',
      approval: '사용자 승인',
      done: '예산 반영',
    },
    taskTypes: [{ id: 'budget_plan', label: '월 AI 예산 배분안', standardHours: 2 }],
    inputLabel: null,
    autoRunLabel: null,
  },
  support: {
    id: 'support',
    name: '서포터팀',
    emoji: '🎧',
    description: '고객 문의를 분류하고 긴급도를 매긴 뒤 답변 초안을 작성합니다. 발송은 하지 않습니다.',
    floor: ['#dff0e3', '#cfe6d5'],
    wall: '#f0f8f2',
    roleTitles: { manager: '서포트 리더', researcher: '문의 분류', writer: '답변 작성', reviewer: '품질 검수' },
    agentNames: { manager: '나래 리더', researcher: '토토', writer: '다정', reviewer: '꼼꼼' },
    defaultRules: {
      manager: '새 문의 수와 긴급한 문의를 확인하고 분류 담당에게 넘긴다.',
      researcher: '문의마다 유형(배송/환불/사용법/오류/칭찬/기타)과 긴급도(높음/보통/낮음)를 매긴다.',
      writer: '정중하고 짧게 답한다. 확인되지 않은 약속(환불 확정, 날짜 보장)은 하지 않는다.',
      reviewer: '말투, 사실 여부, 지키지 못할 약속, 개인정보 노출을 검수한다.',
    },
    stepLabels: {
      intake: '문의 접수',
      research: '분류·긴급도',
      write: '답변 초안',
      review: '품질 검수',
      approval: '사용자 승인',
      done: '발송 대기함',
    },
    taskTypes: [{ id: 'cs_reply', label: '고객 문의 답변 초안', standardHours: 0.3, hoursPerItem: 0.3 }],
    inputLabel: '처리할 문의',
    autoRunLabel: '새 문의 자동 처리',
  },
  welfare: {
    id: 'welfare',
    name: '복지팀',
    emoji: '🌿',
    description: '내 일정과 관심사를 보고 휴식 시간, 문화생활 이벤트, 유튜브 볼거리를 추천합니다.',
    floor: ['#f6e3e8', '#efd5dc'],
    wall: '#fdf3f5',
    roleTitles: { manager: '복지 팀장', researcher: '관심사 탐색', writer: '추천 큐레이터', reviewer: '검토자' },
    agentNames: { manager: '해든 팀장', researcher: '루', writer: '별', reviewer: '온유' },
    defaultRules: {
      manager: '이번 주 일정의 빽빽함과 관심사를 확인하고 탐색 담당에게 넘긴다.',
      researcher: '관심사별로 즐길 거리 후보(공연, 전시, 모임, 영상 주제)를 찾는다.',
      writer: '추천은 5~8개로 짧게 쓰고, 일정이 몰린 날에는 휴식 추천을 먼저 넣는다.',
      reviewer: '관심사와 동떨어진 추천, 일정과 겹치는 추천, 확인할 수 없는 날짜 단정을 걸러낸다.',
    },
    stepLabels: {
      intake: '관심사 확인',
      research: '추천 탐색',
      write: '추천 카드',
      review: '검토',
      approval: '사용자 승인',
      done: '추천 보관함',
    },
    taskTypes: [{ id: 'culture_recs', label: '휴식·문화생활 추천', standardHours: 1 }],
    inputLabel: null,
    autoRunLabel: null,
  },
};

export function taskTypeOf(team: TeamId, taskTypeId: string): TaskTypeEntry {
  return TEAMS[team].taskTypes.find((t) => t.id === taskTypeId) ?? TEAMS[team].taskTypes[0];
}
