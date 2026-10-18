import { t, tpl } from '../../../shared/i18n.ts';
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

/** One card per kind of file: its downloads, and the AI design they come out in. CSV is plain data beside the sheet. */
const GROUPS: { kind: DesignKind; title: string; formats: ExportFormat[] }[] = [
  { kind: 'doc', title: '📄 문서', formats: ['docx', 'pdf'] },
  { kind: 'deck', title: '🖼️ 슬라이드', formats: ['pptx'] },
  { kind: 'sheet', title: '📊 표', formats: ['xlsx', 'csv'] },
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
      const parts = [t('디자인을 적용했어요.')];
      if (dropped) parts.push(tpl('보고서에 없는 숫자가 든 블록 {dropped}개는 뺐어요.', { dropped }));
      if (r) parts.push(r.passed ? tpl('화면 검수 {rounds}회 만에 통과했어요.', { rounds: r.rounds }) : tpl('화면 검수 {rounds}회 뒤에도 남은 지적이 {issuesCount}건 있어요.', { rounds: r.rounds, issuesCount: r.issues.length }));
      setNote(parts.join(' '));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const designButtons = (kind: DesignKind) => (
    <span className="row">
      <button className="pixel-btn small" disabled={busy !== null} onClick={() => design(kind, false)}>
        {busy === kind ? t('디자인하는 중…') : current(kind) ? t('다시 디자인') : t('✨ AI로 디자인')}
      </button>
      {REVIEWABLE.includes(kind) && (
        <button
          className="pixel-btn small"
          disabled={busy !== null || !caps?.visualReview}
          title={caps?.visualReview ? tpl('렌더링한 결과를 검수자가 보고 최대 {rounds}번까지 고쳐요. AI 호출이 2~4배 들어요.', { rounds: caps.rounds }) : caps?.hint}
          onClick={() => design(kind, true)}
        >
          {busy === `${kind}:review` ? t('검수하며 다듬는 중…') : t('🔍 고품질')}
        </button>
      )}
    </span>
  );

  return (
    <div className="export-box">
      <p className="small muted">{t('⬇ 버튼을 누르면 파일을 받아요. ✨ AI 디자인을 적용해 두면 같은 버튼으로 디자인된 파일이 받아져요.')}</p>
      {GROUPS.map(({ kind, title, formats }) => {
        const record = task.designs?.[kind];
        return (
          <section key={kind} className={`export-card ${current(kind) ? 'designed' : ''}`}>
            <div className="export-card-head">
              <b>{t(title)}</b>
              {current(kind) ? (
                <span className="export-badge ok">
                  ✨ {t('AI 디자인 적용됨')}
                  {record?.review ? (record.review.passed ? t(' · 화면 검수 통과') : t(' · 검수 지적 남음')) : ''}
                </span>
              ) : (
                <span className="export-badge">{record ? t('이전 초안용 (기본 디자인으로 받아요)') : t('기본 디자인')}</span>
              )}
            </div>
            <div className="export-row">
              {formats.map((f) => (
                <button key={f} className="pixel-btn small primary" disabled={busy !== null} onClick={() => download(f)}>
                  ⬇ {busy === f ? t('만드는 중…') : t(EXPORT_FORMATS[f].label)}
                </button>
              ))}
            </div>
            {canOperate && designButtons(kind)}
            {current(kind) && record?.review && (record.review.fixed.length > 0 || record.review.issues.length > 0) && (
              <details className="small">
                <summary className="muted">
                  {tpl('검수 기록 · {rounds}회 · 고친 지적 {fixed}건', { rounds: record.review.rounds, fixed: record.review.fixed.length })}
                  {record.review.issues.length ? tpl(' · 남은 지적 {issuesCount}건', { issuesCount: record.review.issues.length }) : ''}
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
          </section>
        );
      })}
      <div className="export-row export-plain">
        <span className="small muted">{t('원문 그대로')}</span>
        <button className="pixel-btn small" onClick={() => save(`${task.title}.md`, new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))}>
          ⬇ Markdown
        </button>
      </div>
      <div className="export-notes">
        <span className="small muted">
          {t('✨ AI 디자인')}: {t('작성자가 보고서를 카드·차트·강조 상자로 다시 배치하고, 주제에 맞는 색을 골라요. 숫자는 보고서에 있는 값만 쓰고, Excel은 원래 표의 값에 합계·비율 같은 실제 수식을 붙여요.')}
        </span>
        {canOperate && caps && !caps.visualReview && <span className="small muted">🔍 {t('고품질(화면 검수)은 꺼져 있어요.')} {caps.hint}</span>}
        {canOperate ? <span className="small muted">{t('AI 호출 비용은 이 업무 비용에 더해져요.')}</span> : <span className="small muted">{t('AI 디자인은 업무 처리 권한이 있는 사람만 만들 수 있어요.')}</span>}
        {note && <span className="small ok">{note}</span>}
      </div>
    </div>
  );
}
