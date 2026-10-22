import { useState } from 'react';
import type { Agent, Task, TaskFile } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { useLanguage } from '../LanguageProvider.tsx';

const kindOf = (file: TaskFile) =>
  file.mime.startsWith('image/') && file.mime !== 'image/svg+xml'
    ? 'image'
    : file.mime.startsWith('video/')
      ? 'video'
      : file.mime.startsWith('audio/')
        ? 'audio'
        : file.mime === 'application/pdf'
          ? 'pdf'
          : file.mime.startsWith('text/') || file.mime === 'application/json'
            ? 'text'
            : 'other';

const ICON = { image: '🖼', video: '🎬', audio: '🔊', pdf: '📕', text: '📄', other: '📦' } as const;

const sizeText = (bytes: number) => (bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** The files a task produced: code from the result and files MCP tools returned, previewed in place and downloaded. */
export function TaskFiles({ task, agents, canOperate, onError }: { task: Task; agents: Agent[]; canOperate: boolean; onError: (message: string) => void }) {
  const { t } = useLanguage();
  const [texts, setTexts] = useState<Record<string, string>>({});
  const files = task.files ?? [];

  const showText = async (file: TaskFile) => {
    if (texts[file.id] !== undefined) {
      setTexts(({ [file.id]: _, ...rest }) => rest);
      return;
    }
    try {
      const res = await fetch(api.fileUrl(task.id, file.id));
      const text = await res.text();
      setTexts((all) => ({ ...all, [file.id]: text.slice(0, 20_000) }));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  const remove = async (file: TaskFile) => {
    if (!window.confirm(t('이 파일을 지울까요?'))) return;
    try {
      await api.removeFile(task.id, file.id);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!files.length) {
    return <p className="muted small">{t('아직 결과 파일이 없어요. 결과물의 코드와 MCP 도구가 돌려준 이미지·파일이 여기에 모여요.')}</p>;
  }
  return (
    <ul className="task-files">
      {files.map((file) => {
        const kind = kindOf(file);
        const inline = api.fileUrl(task.id, file.id, true);
        return (
          <li key={file.id} className={`task-file kind-${kind}`}>
            <div className="task-file-head">
              <b>
                {ICON[kind]} {file.name}
              </b>
              <span className="small muted">
                {sizeText(file.size)} · {file.source === 'draft' ? t('결과물의 코드') : file.origin ?? 'MCP'}
                {file.agentId ? ` · ${agents.find((a) => a.id === file.agentId)?.name ?? ''}` : ''}
              </span>
            </div>
            {kind === 'image' && (
              <a href={inline} target="_blank" rel="noopener noreferrer">
                <img src={inline} alt={file.name} loading="lazy" />
              </a>
            )}
            {kind === 'video' && <video src={inline} controls preload="metadata" />}
            {kind === 'audio' && <audio src={inline} controls preload="none" />}
            {texts[file.id] !== undefined && <pre className="task-file-text">{texts[file.id]}</pre>}
            <div className="row task-file-tools">
              {kind === 'text' && (
                <button type="button" className="pixel-btn small" onClick={() => void showText(file)}>
                  {texts[file.id] !== undefined ? t('접기') : t('내용 보기')}
                </button>
              )}
              {kind === 'pdf' && (
                <a className="pixel-btn small" href={inline} target="_blank" rel="noopener noreferrer">
                  {t('열기')}
                </a>
              )}
              <a className="pixel-btn small primary" href={api.fileUrl(task.id, file.id)} download={file.name}>
                ⬇ {t('받기')}
              </a>
              {canOperate && (
                <button type="button" className="icon-btn" onClick={() => void remove(file)} title={t('파일 지우기')}>
                  🗑
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
