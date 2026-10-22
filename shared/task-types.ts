import type { FlowTemplateStep, TaskTypeEntry, TeamId } from './types.ts';

/** The image model a picture step starts with; any OpenRouter image model can be picked instead. */
export const DEFAULT_IMAGE_MODEL = 'openai/gpt-image-1-mini';

/**
 * Task types any office can take on, beside its team's own (mail, inquiries, budget, recommendations). They make a
 * document from the request: the team's special inputs and approval actions belong to the team's own types only.
 */

export const TASK_CATEGORIES = [
  { id: 'research', label: '조사·분석', team: 'dev' },
  { id: 'dev', label: '개발', team: 'dev' },
  { id: 'writing', label: '문서·글쓰기', team: 'hr' },
  { id: 'people', label: '인사·조직', team: 'hr' },
  { id: 'planning', label: '기획·전략', team: 'mgmt' },
  { id: 'finance', label: '재무·예산', team: 'mgmt' },
  { id: 'marketing', label: '마케팅·홍보', team: 'mgmt' },
  { id: 'design', label: '디자인·이미지', team: 'mgmt' },
  { id: 'customer', label: '고객 응대', team: 'support' },
  { id: 'life', label: '생활·복지', team: 'welfare' },
] as const satisfies readonly { id: string; label: string; team: TeamId }[];

export type TaskCategory = (typeof TASK_CATEGORIES)[number]['id'];

export interface GeneralTaskType extends TaskTypeEntry {
  category: TaskCategory;
  /** One line on what comes out, shown in the flow picker and searched. */
  summary: string;
  tags: string[];
  flow: FlowTemplateStep[];
}

const step = (kind: FlowTemplateStep['kind'], label: string): FlowTemplateStep => ({
  kind,
  label,
  role: kind === 'brief' ? 'manager' : kind === 'research' ? 'researcher' : kind === 'draft' ? 'writer' : kind === 'review' ? 'reviewer' : null,
});
/** Intake → research → write → review → approval. */
const researched = (intake: string, research: string, write: string, review: string) => [
  step('brief', intake),
  step('research', research),
  step('draft', write),
  step('review', review),
  step('approval', '사용자 승인'),
];
/** Intake → write → review → approval, for work made from what the request already holds. */
const direct = (intake: string, write: string, review: string) => [step('brief', intake), step('draft', write), step('review', review), step('approval', '사용자 승인')];

type Entry = Omit<GeneralTaskType, 'flow' | 'category'> & { flow: FlowTemplateStep[] };
const group = (category: TaskCategory, entries: Entry[]): GeneralTaskType[] => entries.map((e) => ({ ...e, category }));

export const GENERAL_TASK_TYPES: GeneralTaskType[] = [
  ...group('dev', [
    {
      id: 'code_write',
      label: '코드 작성',
      summary: '실행되는 코드와 테스트를 한 파일로',
      tags: ['코딩', '프로그래밍', '함수', '스크립트'],
      standardHours: 2,
      flow: researched('요구사항 접수', '구현 방법 조사', '코드 작성', '코드 검토'),
    },
    {
      id: 'bug_analysis',
      label: '버그 원인 분석',
      summary: '증상과 코드로 원인 후보와 고치는 방법',
      tags: ['디버깅', '오류', '에러', '버그'],
      standardHours: 2,
      flow: researched('증상 접수', '원인 조사', '분석 보고서 작성', '분석 검토'),
    },
    {
      id: 'code_review',
      label: '코드 리뷰',
      summary: '붙여 넣은 코드의 문제점과 개선안',
      tags: ['리뷰', '코드 품질', '리팩터링'],
      standardHours: 1,
      flow: direct('코드 접수', '리뷰 의견 작성', '리뷰 검토'),
    },
    {
      id: 'api_design',
      label: 'API 설계서',
      summary: '엔드포인트·요청·응답·오류 규칙 정리',
      tags: ['API', 'REST', '설계', '백엔드'],
      standardHours: 3,
      flow: researched('요구사항 접수', '기존 사례 조사', '설계서 작성', '설계 검토'),
    },
    {
      id: 'test_cases',
      label: '테스트 케이스 작성',
      summary: '기능별 정상·경계·오류 케이스 표',
      tags: ['테스트', 'QA', '검증'],
      standardHours: 2,
      flow: direct('기능 접수', '테스트 케이스 작성', '케이스 검토'),
    },
    {
      id: 'sql_query',
      label: 'SQL 쿼리 작성',
      summary: '요청한 데이터를 뽑는 쿼리와 설명',
      tags: ['SQL', '데이터베이스', '쿼리', '데이터'],
      standardHours: 1,
      flow: direct('요청 접수', '쿼리 작성', '쿼리 검토'),
    },
    {
      id: 'tech_doc',
      label: '기술 문서·README',
      summary: '설치·사용법·구조를 담은 문서',
      tags: ['문서화', 'README', '가이드'],
      standardHours: 2,
      flow: direct('자료 접수', '문서 작성', '문서 검토'),
    },
    {
      id: 'architecture',
      label: '시스템 구조 설계',
      summary: '구성 요소·데이터 흐름·선택 이유',
      tags: ['아키텍처', '설계', '인프라'],
      standardHours: 4,
      flow: researched('요구사항 접수', '선택지 조사', '설계안 작성', '설계 검토'),
    },
    {
      id: 'incident_review',
      label: '장애 회고 보고서',
      summary: '타임라인·원인·재발 방지책',
      tags: ['장애', '회고', '포스트모템', '사고'],
      standardHours: 2,
      flow: direct('경위 접수', '회고 보고서 작성', '보고서 검토'),
    },
  ]),
  ...group('research', [
    {
      id: 'market_research',
      label: '시장·경쟁사 조사',
      summary: '시장 규모·주요 경쟁사·기회 정리',
      tags: ['시장', '경쟁사', '벤치마킹'],
      standardHours: 4,
      flow: researched('조사 범위 접수', '시장·경쟁사 조사', '조사 보고서 작성', '보고서 검토'),
    },
    {
      id: 'trend_brief',
      label: '업계 동향 브리핑',
      summary: '최근 흐름과 우리에게 주는 의미 한 장',
      tags: ['트렌드', '동향', '뉴스', '브리핑'],
      standardHours: 2,
      flow: researched('주제 접수', '동향 조사', '브리핑 작성', '브리핑 검토'),
    },
  ]),
  ...group('writing', [
    {
      id: 'meeting_minutes',
      label: '회의록 정리',
      summary: '논의·결정 사항·할 일과 담당자',
      tags: ['회의', '회의록', '메모'],
      standardHours: 0.5,
      flow: direct('메모 접수', '회의록 작성', '회의록 검토'),
    },
    {
      id: 'email_draft',
      label: '업무 메일 작성',
      summary: '목적에 맞는 제목과 본문 초안',
      tags: ['메일', '이메일', '편지'],
      standardHours: 0.5,
      flow: direct('요청 접수', '메일 작성', '메일 검토'),
    },
    {
      id: 'translation',
      label: '번역·현지화',
      summary: '뜻과 말투를 살린 번역문',
      tags: ['번역', '현지화', '외국어'],
      standardHours: 1,
      flow: direct('원문 접수', '번역문 작성', '번역 검토'),
    },
    {
      id: 'proofreading',
      label: '문서 교정·윤문',
      summary: '맞춤법·문장을 다듬은 글과 고친 점',
      tags: ['교정', '맞춤법', '윤문', '퇴고'],
      standardHours: 1,
      flow: direct('원고 접수', '교정본 작성', '교정 검토'),
    },
  ]),
  ...group('people', [
    {
      id: 'job_posting',
      label: '채용 공고 작성',
      summary: '업무·자격·우대·혜택을 담은 공고',
      tags: ['채용', '공고', '구인', '인사'],
      standardHours: 1,
      flow: researched('채용 요청 접수', '직무·시장 조사', '공고 작성', '공고 검토'),
    },
    {
      id: 'interview_kit',
      label: '면접 질문지',
      summary: '역량별 질문과 좋은 답의 기준',
      tags: ['면접', '질문', '채용', '평가'],
      standardHours: 1,
      flow: direct('직무 접수', '질문지 작성', '질문지 검토'),
    },
    {
      id: 'onboarding_plan',
      label: '신규 입사자 온보딩 계획',
      summary: '첫 30일 일정과 준비물',
      tags: ['온보딩', '입사', '교육'],
      standardHours: 2,
      flow: direct('입사 정보 접수', '온보딩 계획 작성', '계획 검토'),
    },
    {
      id: 'policy_notice',
      label: '사내 공지·규정 안내문',
      summary: '바뀐 점·적용일·문의처가 분명한 안내문',
      tags: ['공지', '규정', '안내', '사내'],
      standardHours: 1,
      flow: direct('내용 접수', '안내문 작성', '안내문 검토'),
    },
  ]),
  ...group('planning', [
    {
      id: 'business_plan',
      label: '사업 계획서',
      summary: '문제·해결·시장·수익 모델·실행 계획',
      tags: ['사업', '계획서', '스타트업', '투자'],
      standardHours: 6,
      flow: researched('사업 개요 접수', '시장·경쟁 조사', '계획서 작성', '계획서 검토'),
    },
    {
      id: 'proposal',
      label: '제안서 작성',
      summary: '고객 과제·제안 내용·일정·비용',
      tags: ['제안서', '영업', '입찰'],
      standardHours: 4,
      flow: researched('요청 접수', '고객·과제 조사', '제안서 작성', '제안서 검토'),
    },
    {
      id: 'decision_memo',
      label: '의사결정 메모',
      summary: '선택지별 장단점과 권고안 한 장',
      tags: ['의사결정', '권고', '비교', '선택'],
      standardHours: 2,
      flow: researched('결정 과제 접수', '선택지 조사', '메모 작성', '메모 검토'),
    },
    {
      id: 'project_plan',
      label: '프로젝트 일정 계획',
      summary: '단계·일정·담당·위험을 담은 계획표',
      tags: ['프로젝트', '일정', '로드맵', 'WBS'],
      standardHours: 3,
      flow: direct('목표 접수', '일정 계획 작성', '계획 검토'),
    },
    {
      id: 'risk_assessment',
      label: '위험 평가',
      summary: '위험별 가능성·영향·대응책 표',
      tags: ['위험', '리스크', '대응'],
      standardHours: 3,
      flow: researched('평가 대상 접수', '위험 요인 조사', '평가표 작성', '평가 검토'),
    },
  ]),
  ...group('finance', [
    {
      id: 'cost_analysis',
      label: '비용 절감 분석',
      summary: '비용 항목별 절감안과 예상 효과',
      tags: ['비용', '절감', '효율'],
      standardHours: 3,
      flow: researched('비용 자료 접수', '절감 방법 조사', '분석 보고서 작성', '분석 검토'),
    },
    {
      id: 'pricing_review',
      label: '가격 정책 검토',
      summary: '경쟁 가격과 비교한 가격안',
      tags: ['가격', '요금제', '수익'],
      standardHours: 3,
      flow: researched('상품 정보 접수', '경쟁 가격 조사', '가격안 작성', '가격안 검토'),
    },
    {
      id: 'kpi_report',
      label: '성과·KPI 보고서',
      summary: '지표 변화·원인·다음 달 할 일',
      tags: ['KPI', '성과', '지표', '월간 보고'],
      standardHours: 2,
      flow: direct('지표 자료 접수', '보고서 작성', '보고서 검토'),
    },
  ]),
  ...group('marketing', [
    {
      id: 'marketing_copy',
      label: '광고·마케팅 문구',
      summary: '타깃별 헤드라인과 문구 여러 안',
      tags: ['카피', '광고', '문구', '슬로건'],
      standardHours: 1,
      flow: direct('상품·타깃 접수', '문구 작성', '문구 검토'),
    },
    {
      id: 'sns_posts',
      label: 'SNS 게시물 기획',
      summary: '채널별 게시물 문안과 올릴 날짜',
      tags: ['SNS', '인스타그램', '게시물', '콘텐츠'],
      standardHours: 2,
      flow: direct('주제 접수', '게시물 작성', '게시물 검토'),
    },
    {
      id: 'press_release',
      label: '보도자료',
      summary: '기자가 바로 쓸 수 있는 보도자료',
      tags: ['보도자료', '언론', 'PR', '홍보'],
      standardHours: 2,
      flow: direct('소식 접수', '보도자료 작성', '보도자료 검토'),
    },
    {
      id: 'blog_post',
      label: '블로그 글',
      summary: '검색에 잘 걸리는 정보성 글',
      tags: ['블로그', '콘텐츠', 'SEO', '글'],
      standardHours: 2,
      flow: researched('주제 접수', '자료 조사', '글 작성', '글 검토'),
    },
  ]),
  ...group('design', [
    {
      id: 'image_create',
      label: '이미지 생성',
      summary: '요청에 맞는 그림을 이미지 모델로 생성',
      tags: ['이미지', '그림', '일러스트', '디자인', '썸네일', '배너'],
      standardHours: 2,
      flow: [
        { kind: 'brief', label: '요청 접수', role: 'manager' },
        { kind: 'research', label: '레퍼런스 조사', role: 'researcher' },
        { kind: 'draft', label: '이미지 생성', role: 'writer', imageModel: DEFAULT_IMAGE_MODEL },
        // Two tries: a picture the model cannot make is not fixed by asking forever.
        { kind: 'review', label: '이미지 검토', role: 'reviewer', loop: { to: 2, when: '그림이 요청과 다르면', max: 2 } },
        { kind: 'approval', label: '사용자 승인', role: null },
      ],
    },
  ]),
  ...group('customer', [
    {
      id: 'faq',
      label: '자주 묻는 질문(FAQ)',
      summary: '질문과 짧은 답을 주제별로',
      tags: ['FAQ', '질문', '고객', '도움말'],
      standardHours: 2,
      flow: direct('자료 접수', 'FAQ 작성', 'FAQ 검토'),
    },
    {
      id: 'user_guide',
      label: '사용 설명서·가이드',
      summary: '처음 쓰는 사람을 위한 단계별 안내',
      tags: ['설명서', '매뉴얼', '가이드', '사용법'],
      standardHours: 3,
      flow: direct('기능 접수', '설명서 작성', '설명서 검토'),
    },
    {
      id: 'voc_analysis',
      label: '고객 의견(VOC) 분석',
      summary: '의견 유형·빈도·개선 우선순위',
      tags: ['VOC', '고객 의견', '리뷰', '불만'],
      standardHours: 2,
      flow: direct('의견 자료 접수', '분석 보고서 작성', '분석 검토'),
    },
  ]),
  ...group('life', [
    {
      id: 'travel_plan',
      label: '여행 계획',
      summary: '일자별 동선·예산·준비물',
      tags: ['여행', '일정', '휴가'],
      standardHours: 2,
      flow: researched('여행 조건 접수', '여행지 조사', '여행 계획 작성', '계획 검토'),
    },
    {
      id: 'event_plan',
      label: '사내 행사 기획',
      summary: '프로그램·준비물·예산·역할',
      tags: ['행사', '워크숍', '이벤트', '회식'],
      standardHours: 3,
      flow: researched('행사 조건 접수', '장소·프로그램 조사', '기획안 작성', '기획안 검토'),
    },
    {
      id: 'study_plan',
      label: '학습 계획',
      summary: '목표까지의 주차별 공부 계획',
      tags: ['공부', '학습', '자격증', '강의'],
      standardHours: 1,
      flow: researched('목표 접수', '학습 자료 조사', '학습 계획 작성', '계획 검토'),
    },
    {
      id: 'workout_routine',
      label: '운동·건강 루틴',
      summary: '생활에 맞춘 주간 운동·휴식표',
      tags: ['운동', '건강', '루틴', '스트레칭'],
      standardHours: 1,
      flow: direct('생활 패턴 접수', '루틴 작성', '루틴 검토'),
    },
  ]),
];

const GENERAL_BY_ID = new Map(GENERAL_TASK_TYPES.map((type) => [type.id, type]));

export const generalTaskType = (id: string): GeneralTaskType | undefined => GENERAL_BY_ID.get(id);

/** The category of a team's own type, so the picker can file it beside the general ones. */
export const TEAM_TYPE_CATEGORY: Record<string, TaskCategory> = {
  research_report: 'research',
  tech_review: 'research',
  summary: 'writing',
  mail_triage: 'people',
  budget_plan: 'finance',
  cs_reply: 'customer',
  culture_recs: 'life',
};

export const categoryLabel = (id: TaskCategory) => TASK_CATEGORIES.find((c) => c.id === id)?.label ?? id;
