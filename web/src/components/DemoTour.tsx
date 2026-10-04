import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

interface Step {
  targets: string[];
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    targets: [],
    title: '사용법 데모',
    body: '화면 곳곳에 메모를 붙여 가며 대략적인 사용법을 보여 드릴게요. 데모는 보기만 하고 아무것도 바꾸지 않아요.',
  },
  {
    targets: ['.office-tabs'],
    title: '1. 사무실 고르기',
    body: '팀마다 사무실이 따로 있어요. 탭을 눌러 이동하고, 길게 누르거나 우클릭하면 공유·닫기 메뉴가 나와요. "+ 사무실"로 새 팀을 열 수 있어요.',
  },
  {
    targets: ['.office-canvas'],
    title: '2. 직원 살펴보기',
    body: '직원을 누르면 지금 하는 일이 보이고, 우클릭(길게 누르기)하면 규칙 편집·잠시 멈춤 메뉴가 나와요. 말풍선에 "도와주세요"가 뜨면 눌러서 답해 주세요.',
  },
  {
    targets: ['.new-task-btn'],
    title: '3. 업무 맡기기',
    body: '이 버튼이나 칠판을 눌러 업무를 등록해요. 무엇을 원하는지 적으면 팀장이 단계를 나누고 직원들이 차례로 처리해요.',
  },
  {
    targets: ['.workflow', '.drawer-bottom .drawer-handle'],
    title: '4. 업무 여정',
    body: '업무가 어느 단계에 있는지, 누가 맡고 있는지 흐름으로 보여요. 대기 중인 업무는 시작 전에 단계를 고칠 수 있어요.',
  },
  {
    targets: ['.report', '.drawer-right .drawer-handle'],
    title: '5. 승인과 결과물',
    body: '도움 요청과 승인 대기가 여기 모여요. 결과를 확인해 승인하거나 수정 요청을 보내고, 완성된 결과물은 Word·Excel·PPT로 내려받아요.',
  },
  {
    targets: ['.main-tabs'],
    title: '6. 관리 메뉴',
    body: '직원 관리에서 채용·교체, 모델 관리에서 AI 모델과 API 키, MCP 관리에서 외부 도구(슬랙·Gmail 등), 손익·결산에서 비용과 가치를 봐요.',
  },
  {
    targets: ['.provider'],
    title: '7. 시뮬레이션과 실제 AI',
    body: '"시뮬레이션"이면 AI를 부르지 않고 흉내만 내서 비용이 들지 않아요. 실제 AI는 모델 관리에서 연결해요. 이 배지를 길게 누르면 언제든 이 데모를 다시 볼 수 있어요.',
  },
  {
    targets: ['.help-btn'],
    title: '8. 궁금하면 도움말',
    body: '막히면 도움말에 물어보세요. 사용 설명서를 찾아 답하고, 실제 AI가 연결돼 있으면 AI가 정리해서 알려 줘요.',
  },
];

const PAD = 6;
const MEMO_W = 280;

function findTarget(targets: string[]) {
  for (const selector of targets) {
    const el = document.querySelector(selector);
    const box = el?.getBoundingClientRect();
    if (box && box.width > 0 && box.height > 0) return box;
  }
  return null;
}

function memoPosition(box: DOMRect | null, memo: { w: number; h: number }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!box) return { left: (vw - memo.w) / 2, top: (vh - memo.h) / 2 };
  const clampX = (x: number) => Math.max(8, Math.min(x, vw - memo.w - 8));
  const clampY = (y: number) => Math.max(8, Math.min(y, vh - memo.h - 8));
  if (box.bottom + PAD + 12 + memo.h < vh) return { left: clampX(box.left), top: box.bottom + PAD + 12 };
  if (box.top - PAD - 12 - memo.h > 0) return { left: clampX(box.left), top: box.top - PAD - 12 - memo.h };
  if (box.right + PAD + 12 + memo.w < vw) return { left: box.right + PAD + 12, top: clampY(box.top) };
  if (box.left - PAD - 12 - memo.w > 0) return { left: box.left - PAD - 12 - memo.w, top: clampY(box.top) };
  return { left: clampX(box.left + 16), top: clampY(box.top + 16) };
}

export function DemoTour({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const memoRef = useRef<HTMLDivElement>(null);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  const measure = useCallback(() => {
    const target = findTarget(step.targets);
    setBox(target);
    const memo = memoRef.current?.getBoundingClientRect();
    setPos(memoPosition(target, { w: memo?.width ?? MEMO_W, h: memo?.height ?? 160 }));
  }, [step]);

  useLayoutEffect(measure, [measure]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const timer = window.setInterval(measure, 400);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      window.clearInterval(timer);
    };
  }, [measure]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === 'Enter') (last ? onClose() : setIndex((i) => i + 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last, onClose]);

  return (
    <div className="demo-tour" role="dialog" aria-label="사용법 데모">
      {box ? (
        <>
          <div className="demo-dim" style={{ bottom: `calc(100% - ${box.top - PAD}px)` }} />
          <div className="demo-dim" style={{ top: box.bottom + PAD }} />
          <div className="demo-dim" style={{ top: box.top - PAD, height: box.height + PAD * 2, right: `calc(100% - ${box.left - PAD}px)` }} />
          <div className="demo-dim" style={{ top: box.top - PAD, height: box.height + PAD * 2, left: box.right + PAD }} />
          <div
            className="demo-spot"
            style={{ left: box.left - PAD, top: box.top - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 }}
          />
        </>
      ) : (
        <div className="demo-dim" />
      )}
      <div
        ref={memoRef}
        className="demo-memo"
        style={{ ...(pos ?? { left: 0, top: 0, visibility: 'hidden' }), width: MEMO_W }}
      >
        <div className="demo-pin" />
        <div className="demo-title">📝 {step.title}</div>
        <div className="demo-body">{step.body}</div>
        <div className="demo-foot">
          <span className="demo-count">
            {index + 1} / {STEPS.length}
          </span>
          <button className="pixel-btn small" onClick={onClose}>
            그만 보기
          </button>
          {index > 0 && (
            <button className="pixel-btn small" onClick={() => setIndex(index - 1)}>
              이전
            </button>
          )}
          <button className="pixel-btn small primary" onClick={() => (last ? onClose() : setIndex(index + 1))}>
            {last ? '끝' : '다음'}
          </button>
        </div>
      </div>
    </div>
  );
}
