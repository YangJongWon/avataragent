import { useEffect, useState } from 'react';
import { EXPORT_FORMATS, REVIEWABLE, type DesignKind, type ExportFormat } from '../../../shared/design.ts';
import type { Task } from '../../../shared/types.ts';
import { api, type ExportCapabilities } from '../api.ts';

interface Props {
  task: Task;
  draftVersion: number;
  markdown: string;
  canOperate: boolean;
  onError: (message: string) => void;
}

const DESIGNS: { kind: DesignKind; label: string }[] = [
  { kind: 'doc', label: '문서 (Word·PDF)' },
  { kind: 'deck', label: '슬라이드 (PowerPoint)' },
  { kind: 'sheet', label: '표 (Excel 수식·서식)' },
];

function save(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportBox({ task, draftVersion, markdown, canOperate, onError }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [caps, setCaps] = useState<ExportCapabilities | null>(null);
  const current = (kind: DesignKind) => task.designs?.[kind]?.draftVersion === draftVersion;

  useEffect(() => {
    if (canOperate) api.exportCapabilities().then(setCaps, () => setCaps(null));
  }, [canOperate]);

  const download = async (format: ExportFormat) => {
    if (format === 'pdf') {
      window.open(api.exportUrl(task.id, 'pdf', true), '_blank', 'noopener');
      return;
    }
    setBusy(format);
    try {
      const { blob, filename } = await api.exportFile(task.id, format);
      save(filename, blob);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const design = async (kind: DesignKind, review: boolean) => {
    setBusy(`${kind}${review ? ':review' : ''}`);
    setNote('');
    try {
      const { dropped, review: r } = await api.designReport(task.id, kind, review);
      const parts = ['디자인을 적용했어요.'];
      if (dropped) parts.push(`보고서에 없는 숫자가 든 블록 ${dropped}개는 뺐어요.`);
      if (r) parts.push(r.passed ? `화면 검수 ${r.rounds}회 만에 통과했어요.` : `화면 검수 ${r.rounds}회 뒤에도 남은 지적이 ${r.issues.length}건 있어요.`);
      setNote(parts.join(' '));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="export-box">
      <div className="export-row">
        <button className="pixel-btn small" onClick={() => save(`${task.title}.md`, new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))}>
          Markdown
        </button>
        {(Object.keys(EXPORT_FORMATS) as ExportFormat[]).map((f) => {
          const kind = EXPORT_FORMATS[f].design;
          return (
            <button key={f} className="pixel-btn small" disabled={busy !== null} onClick={() => download(f)} title={kind && current(kind) ? 'AI 디자인 적용' : '기본 디자인'}>
              {kind && current(kind) ? '✨ ' : ''}
              {busy === f ? '만드는 중…' : EXPORT_FORMATS[f].label}
            </button>
          );
        })}
      </div>
      <div className="export-designs">
        <b>✨ AI 디자인</b>
        <span className="small muted">
          작성자가 보고서를 카드·차트·강조 상자로 다시 배치하고, 주제에 맞는 색을 골라요. 숫자는 보고서에 있는 값만 쓰고, Excel은 원래 표의 값에 합계·비율 같은 실제 수식을 붙여요.
        </span>
        {DESIGNS.map(({ kind, label }) => {
          const record = task.designs?.[kind];
          const reviewable = REVIEWABLE.includes(kind);
          return (
            <div key={kind} className="export-design">
              <div className="export-design-head">
                <span>
                  {label} ·{' '}
                  {current(kind) ? (
                    <b className="ok">적용됨{record?.review ? (record.review.passed ? ' · 화면 검수 통과' : ' · 검수 지적 남음') : ''}</b>
                  ) : record ? (
                    <span className="muted">이전 초안용 (기본 디자인으로 받아요)</span>
                  ) : (
                    <span className="muted">기본 디자인</span>
                  )}
                </span>
                {canOperate && (
                  <span className="row">
                    <button className="pixel-btn small" disabled={busy !== null} onClick={() => design(kind, false)}>
                      {busy === kind ? '디자인하는 중…' : current(kind) ? '다시 디자인' : 'AI로 디자인'}
                    </button>
                    {reviewable && (
                      <button
                        className="pixel-btn small"
                        disabled={busy !== null || !caps?.visualReview}
                        title={caps?.visualReview ? `렌더링한 결과를 검수자가 보고 최대 ${caps.rounds}번까지 고쳐요. AI 호출이 2~4배 들어요.` : caps?.hint}
                        onClick={() => design(kind, true)}
                      >
                        {busy === `${kind}:review` ? '검수하며 다듬는 중…' : '🔍 고품질'}
                      </button>
                    )}
                  </span>
                )}
              </div>
              {current(kind) && record?.review && (record.review.fixed.length > 0 || record.review.issues.length > 0) && (
                <details className="small">
                  <summary className="muted">
                    검수 기록 · {record.review.rounds}회 · 고친 지적 {record.review.fixed.length}건{record.review.issues.length ? ` · 남은 지적 ${record.review.issues.length}건` : ''}
                  </summary>
                  <ul>
                    {record.review.fixed.map((i, n) => (
                      <li key={`f${n}`}>✅ {i}</li>
                    ))}
                    {record.review.issues.map((i, n) => (
                      <li key={`i${n}`}>⚠️ {i}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
        {canOperate && caps && !caps.visualReview && <span className="small muted">🔍 고품질(화면 검수)은 꺼져 있어요. {caps.hint}</span>}
        {canOperate ? <span className="small muted">AI 호출 비용은 이 업무 비용에 더해져요.</span> : <span className="small muted">AI 디자인은 업무 처리 권한이 있는 사람만 만들 수 있어요.</span>}
        {note && <span className="small">{note}</span>}
      </div>
    </div>
  );
}
