import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useEffect, useRef, useState } from 'react';
import { api, type HelpAnswer, type HelpTurn } from '../api.ts';

const renderMarkdown = (md: string) => DOMPurify.sanitize(marked.parse(md, { async: false }) as string);

const SUGGESTIONS: Record<string, string[]> = {
  office: ['업무는 어떻게 맡겨?', '직원이 도움을 요청하면 어떻게 해?', '결과물을 PowerPoint로 받으려면?'],
  hire: ['직원 모델은 어떻게 바꿔?', '같은 역할 직원을 여럿 두면 뭐가 좋아?'],
  models: ['실제 AI로 바꾸려면?', 'DeepSeek이나 Ollama를 연결하려면?', '키가 맞는지 확인하는 방법은?'],
  mcp: ['Slack 연결하려면?', '이 PC에서 실행(명령) MCP를 켜려면?', '도구의 "승인 후 실행"은 뭐야?'],
  profit: ['예산을 다 쓰면 어떻게 돼?', '사무실별 예산 상한은 어디서 바꿔?'],
};

interface Turn extends HelpTurn {
  sources: HelpAnswer['sources'];
  ai: boolean;
}

export function HelpPanel({ tab, officeId, onClose }: { tab: string; officeId?: string; onClose: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [turns, busy]);

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    setError('');
    setQuestion('');
    try {
      const res = await api.askHelp(q, tab, officeId, turns.map(({ question: qq, answer }) => ({ question: qq, answer })));
      setTurns((list) => [...list, { question: q, ...res }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setQuestion(q);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal pixel-box help-panel">
        <div className="modal-head">
          <span>❓ 도움말</span>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="help-log">
          {turns.length === 0 && (
            <div className="help-intro">
              <p className="muted small">사용법을 물어보세요. 도움말 문서에서 찾아 답해요.</p>
              <div className="help-chips">
                {(SUGGESTIONS[tab] ?? SUGGESTIONS.office).map((s) => (
                  <button key={s} className="pixel-btn small" onClick={() => ask(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i} className="help-turn">
              <div className="help-q">{t.question}</div>
              <div className="help-a">
                <div className="markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(t.answer) }} />
                <div className="muted small">{t.ai ? 'AI가 도움말을 보고 답했어요' : '도움말 원문에서 찾았어요'}</div>
                {t.sources.length > 0 && (
                  <details>
                    <summary className="small">근거 {t.sources.length}곳</summary>
                    {t.sources.map((s) => (
                      <details key={`${s.source}${s.title}`} className="help-source">
                        <summary className="small">
                          {s.source} · {s.title}
                        </summary>
                        <div className="markdown small" dangerouslySetInnerHTML={{ __html: renderMarkdown(s.text) }} />
                      </details>
                    ))}
                  </details>
                )}
              </div>
            </div>
          ))}
          {busy && <p className="muted small">찾아보는 중…</p>}
          {error && <p className="error small">{error}</p>}
          <div ref={end} />
        </div>
        <form
          className="row help-input"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
        >
          <input className="grow" value={question} maxLength={500} placeholder="예: Slack 연결하려면?" onChange={(e) => setQuestion(e.target.value)} autoFocus />
          <button className="pixel-btn" type="submit" disabled={busy || !question.trim()}>
            묻기
          </button>
        </form>
      </div>
    </div>
  );
}
