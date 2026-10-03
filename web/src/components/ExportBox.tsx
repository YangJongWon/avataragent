import { useState } from 'react';
import { EXPORT_FORMATS, type DesignKind, type ExportFormat } from '../../../shared/design.ts';
import type { Task } from '../../../shared/types.ts';
import { api } from '../api.ts';

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
  const current = (kind: DesignKind) => task.designs?.[kind]?.draftVersion === draftVersion;

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

  const design = async (kind: DesignKind) => {
    setBusy(kind);
    setNote('');
    try {
      const { dropped } = await api.designReport(task.id, kind);
      setNote(dropped ? `보고서에 없는 숫자가 든 블록 ${dropped}개는 빼고 디자인했어요.` : '디자인을 적용했어요. 아래 형식으로 받아 보세요.');
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
          작성자가 보고서를 카드·차트·강조 상자로 다시 배치해요. 숫자는 보고서에 있는 값만 쓰고, CSV와 Excel은 원래 표를 그대로 써요.
        </span>
        {DESIGNS.map(({ kind, label }) => (
          <div key={kind} className="export-design">
            <span>
              {label} · {current(kind) ? <b className="ok">적용됨</b> : task.designs?.[kind] ? <span className="muted">이전 초안용 (기본 디자인으로 받아요)</span> : <span className="muted">기본 디자인</span>}
            </span>
            {canOperate && (
              <button className="pixel-btn small" disabled={busy !== null} onClick={() => design(kind)}>
                {busy === kind ? '디자인하는 중…' : current(kind) ? '다시 디자인' : 'AI로 디자인'}
              </button>
            )}
          </div>
        ))}
        {canOperate ? <span className="small muted">AI 호출 비용은 이 업무 비용에 더해져요.</span> : <span className="small muted">AI 디자인은 업무 처리 권한이 있는 사람만 만들 수 있어요.</span>}
        {note && <span className="small">{note}</span>}
      </div>
    </div>
  );
}
