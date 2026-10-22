import type { StepKind } from '../../shared/types.ts';

/** What "at the same time" means for each kind of step, as Korean catalogue keys and templates for t() and tpl(). */
export const PARALLEL_TEXT: Partial<Record<StepKind, { hint: string; join: string; add: string; stage: string; title: string }>> = {
  research: {
    hint: '같은 역할 직원 여럿이 각자 조사하고, 결과물 작성 단계에서 한꺼번에 비교해요.',
    join: '앞 조사와 동시에 진행',
    add: '같은 단계에 조사 추가 (비교)',
    stage: '조사 {n}개 동시 (비교)',
    title: '{n}단계 · 조사 {count}개 동시 (비교)',
  },
  draft: {
    hint: '작성자 여럿이 각자 결과물을 쓰고, 다음 검토자(없으면 팀장)가 비교해 가장 나은 하나를 골라요.',
    join: '앞 작성과 동시에 진행 (비교 후 선택)',
    add: '같은 단계에 작성 추가 (비교 후 선택)',
    stage: '작성 {n}개 동시 (비교 후 선택)',
    title: '{n}단계 · 작성 {count}개 동시 (비교 후 선택)',
  },
  review: {
    hint: '검토자 여럿이 같은 초안을 동시에 평가하고, 과반이 통과시키면 통과예요.',
    join: '앞 검토와 동시에 진행 (다수결)',
    add: '검토자 추가 (다수결)',
    stage: '검토 {n}명 동시 (다수결)',
    title: '{n}단계 · 검토 {count}명 동시 (다수결)',
  },
};
