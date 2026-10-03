import { PALETTES, type DesignKind, type DocSpec } from '../../shared/design.ts';
import { tableGuide } from './sheet.ts';

const BLOCK_GUIDE = [
  '{"type":"heading","text":"섹션 제목"}',
  '{"type":"subheading","text":"소제목"}',
  '{"type":"paragraph","text":"문단"}',
  '{"type":"bullets","items":["항목"],"ordered":false}',
  '{"type":"kpis","items":[{"label":"지표 이름","value":"38%","note":"짧은 설명"}]}  ← 핵심 숫자 2~4개',
  '{"type":"callout","tone":"good|info|warn","title":"결론","text":"강조할 내용"}  ← 결론·권고·주의',
  '{"type":"quote","text":"인용","by":"출처"}',
  '{"type":"table","table":{"title":"표 제목","columns":["열"],"rows":[["값"]]}}',
  '{"type":"chart","chart":{"kind":"bar|line|pie","title":"차트 제목","labels":["항목"],"series":[{"name":"계열","values":[1]}],"unit":"%"}}  ← 표의 수치 비교',
  '{"type":"timeline","items":[{"when":"1주차","what":"할 일"}]}  ← 일정·단계',
  '{"type":"compare","left":{"title":"A안","items":["장점"]},"right":{"title":"B안","items":["장점"]}}  ← 두 안 비교',
];

const STYLE_GUIDE = [
  '[스타일] "style":{"palette":"<아래 중 하나>","fonts":"modern|classic"} 를 함께 고르세요. 주제의 성격에 맞는 팔레트를 고르고, 정하기 어려우면 생략하세요(팀 색을 씁니다).',
  ...Object.entries(PALETTES).map(([id, p]) => `- ${id}: ${p.mood}`),
  '- fonts: modern은 깔끔한 고딕, classic은 제목만 명조(공식 문서·인문 주제).',
];

const COMMON_RULES = [
  '- 보고서에 없는 사실이나 숫자를 만들지 마세요. 숫자는 보고서에 적힌 값을 그대로 옮기고, 계산하거나 단위를 바꾸지 마세요. 근거 없는 숫자가 든 블록은 자동으로 빠집니다.',
  '- 글을 그대로 나열하지 말고, 핵심 숫자는 kpis, 결론과 권고는 callout, 수치가 든 표는 table과 chart, 일정은 timeline, 두 안 비교는 compare로 바꿔 한눈에 보이게 하세요.',
  '- 한 차트에는 단위와 크기가 비슷한 값만 넣으세요. 금액과 점수처럼 단위가 다르면 차트를 나누세요.',
  '- 출처는 sources 배열에 그대로 옮기세요.',
  '- JSON 객체 하나만 출력하세요. 설명이나 코드 블록 표시는 쓰지 마세요.',
];

const SHEET_GUIDE = [
  '[이번 일] 보고서의 표를 엑셀 통합 문서로 정리합니다. 값은 서버가 보고서의 표에서 그대로 옮기고, 당신은 "어떻게 계산하고 보여줄지"만 정합니다.',
  '- 합계·평균 같은 계산은 숫자로 적지 말고 totals에 의도만 적으세요. 서버가 =SUM(B2:B9) 같은 실제 수식으로 씁니다.',
  '- computed는 행마다 계산되는 새 열입니다. diff = a - b, ratio = a ÷ b, share = a가 열 합계에서 차지하는 비율.',
  '- highlight는 조건부 서식입니다. 목표 미달처럼 눈에 띄어야 할 값만, 보고서가 말하는 기준으로 정하세요. 퍼센트 열은 38%면 38로 적습니다.',
  '- bars는 칸 안에 막대를 그려 크기를 비교할 열입니다(한 시트에 1~2개).',
  '- 열 이름은 아래 목록에 있는 이름만 쓰세요. 없는 이름을 쓴 지시는 버려집니다. 의미 없는 계산(예: 순위의 합계)은 넣지 마세요.',
  '',
  '[출력 형식]',
  '{"sheets":[{"table":0,"name":"시트 이름","note":"이 시트가 보여주는 것 한 줄","sort":{"column":"열","desc":true},"computed":[{"name":"새 열","op":"diff|ratio|share","a":"열","b":"열"}],"totals":[{"column":"열","fn":"sum|average|min|max"}],"highlight":[{"column":"열","op":">|<|=","value":80,"tone":"good|bad"}],"bars":["열"]}],"style":{"palette":"..."}}',
  '- JSON 객체 하나만 출력하세요.',
];

export function designPrompt(kind: DesignKind, markdown: string, title: string, doc: DocSpec) {
  if (kind === 'sheet') {
    const guide = tableGuide(doc);
    return [...SHEET_GUIDE, '', ...STYLE_GUIDE, '', '[보고서의 표]', ...(guide.length ? guide : ['(표 없음)']), '', `[업무 제목] ${title}`, '[보고서]', markdown].join('\n');
  }
  const head =
    kind === 'doc'
      ? [
          '[이번 일] 완성된 보고서를 Word·PDF 문서 디자인으로 편집합니다.',
          '- 보고서의 내용은 빠짐없이 옮기되, 읽기 좋은 순서와 구조로 다시 배치하세요.',
          '- summary에는 결론 중심의 핵심 요약 3~5줄을 넣으세요.',
          '- 글 블록이 5개 넘게 이어지지 않게 카드·표·강조 상자를 섞으세요.',
          '',
          '[출력 형식]',
          '{"title":"제목","subtitle":"부제","summary":["요약"],"blocks":[블록...],"sources":["출처"],"style":{...}}',
        ]
      : [
          '[이번 일] 완성된 보고서를 발표용 슬라이드(PowerPoint)로 편집합니다.',
          '- 슬라이드 6~14장. 한 장에 메시지 하나, 블록은 한 장에 하나만 씁니다.',
          '- 슬라이드 제목은 주제가 아니라 그 장의 결론을 한 문장으로, 40자 이내로 쓰세요 (예: "B안이 비용을 30% 줄인다").',
          '- bullets는 한 장에 3~5개, 항목은 40자 이내로 짧게. 같은 블록 종류가 3장 넘게 이어지지 않게 섞으세요.',
          '- notes에는 발표자가 말할 내용을 1~2문장으로.',
          '- 표지와 출처 장은 자동으로 붙으니 만들지 마세요. 장을 나누는 간지가 필요하면 block 없이 title만 쓰세요.',
          '',
          '[출력 형식]',
          '{"title":"제목","subtitle":"부제","slides":[{"title":"이 장의 결론","block":블록,"notes":"발표자 메모"}],"sources":["출처"],"style":{...}}',
        ];
  return [...head, '', '[블록 종류]', ...BLOCK_GUIDE.map((b) => `- ${b}`), '', ...STYLE_GUIDE, '', '[규칙]', ...COMMON_RULES, '', `[업무 제목] ${title}`, '[보고서]', markdown].join('\n');
}

export function reviewPrompt(kind: 'doc' | 'deck', layoutNotes: string[]) {
  return [
    `[이번 일] 첨부한 PDF는 방금 만든 ${kind === 'deck' ? '발표 슬라이드' : '문서'}를 실제로 렌더링한 결과입니다. 디자인 검수자로서 눈으로 보이는 문제만 찾으세요.`,
    '- 찾을 것: 글자 넘침·잘림, 요소 겹침, 한쪽에 몰린 빈 공간, 읽기 어려운 대비, 한 장에 너무 많은 내용, 같은 모양의 장이 지루하게 반복, 차트·표가 읽기 어려움, 숫자와 단위가 줄바꿈으로 갈라짐.',
    '- 내용의 옳고 그름은 이미 검토했으니 보지 마세요.',
    '- 문제마다 몇 번째 장(페이지)인지와 어떻게 고칠지(블록 바꾸기, 나누기, 줄이기 등)를 짧게 쓰세요.',
    '- 문제가 없으면 ok를 true로, issues는 빈 배열로.',
    ...(layoutNotes.length ? ['', '[서버가 미리 잡은 배치 문제 - 참고]', ...layoutNotes.map((n) => `- ${n}`)] : []),
    '',
    '[출력 형식] {"ok":false,"issues":[{"page":3,"problem":"문제","fix":"고칠 방법"}]}',
    'JSON 객체 하나만 출력하세요.',
  ].join('\n');
}

export function revisePrompt(kind: 'doc' | 'deck', base: string, previous: unknown, issues: string[]) {
  return [
    base,
    '',
    '[이전 디자인]',
    JSON.stringify(previous),
    '',
    '[디자인 검수자가 렌더링 결과를 보고 지적한 문제]',
    ...issues.map((i) => `- ${i}`),
    '',
    `위 문제를 모두 고친 ${kind === 'deck' ? '슬라이드' : '문서'} 디자인 전체를 같은 형식의 JSON으로 다시 출력하세요. 지적되지 않은 부분은 그대로 두세요.`,
  ].join('\n');
}
