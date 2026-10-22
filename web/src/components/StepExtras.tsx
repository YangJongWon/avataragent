import { useState } from 'react';
import { t, tpl } from '../../../shared/i18n.ts';
import type { McpServer } from '../../../shared/mcp.ts';
import { SKILL_ACCEPT, SKILL_LIMITS, skillFromFile } from '../../../shared/step-extras.ts';
import type { WorkflowStepInput } from '../../../shared/types.ts';

interface Props {
  step: WorkflowStepInput;
  /** MCP servers the office may use; undefined when the viewer cannot see them (only the owner can). */
  servers: McpServer[] | undefined;
  readOnly?: boolean;
  onChange: (patch: Partial<WorkflowStepInput>) => void;
}

/** A step's skill files and MCP servers, folded under its instructions. */
export function StepExtras({ step, servers, readOnly, onChange }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<number | null>(null);
  const skills = step.skills ?? [];
  const assigned = step.mcpServerIds;
  // The brief only writes the work order; tools are for gathering, writing and checking.
  const usesTools = step.kind === 'research' || step.kind === 'draft' || step.kind === 'review';
  const full = skills.length >= SKILL_LIMITS.perStep;

  const attach = async (files: FileList | null) => {
    setError(null);
    const added = [];
    for (const file of [...(files ?? [])].slice(0, SKILL_LIMITS.perStep - skills.length)) {
      try {
        added.push(skillFromFile(file.name, await file.text()));
      } catch (e) {
        setError(`${file.name}: ${e instanceof Error ? t(e.message) : String(e)}`);
      }
    }
    if (added.length) onChange({ skills: [...skills, ...added] });
  };
  const removeSkill = (index: number) => {
    const next = skills.filter((_, i) => i !== index);
    onChange({ skills: next.length ? next : undefined });
    setShown(null);
  };
  const toggleServer = (id: string, on: boolean) => {
    const current = assigned ?? [];
    onChange({ mcpServerIds: on ? [...current, id] : current.filter((x) => x !== id) });
  };

  const summary = [
    skills.length ? tpl('스킬 {n}개', { n: skills.length }) : '',
    assigned ? (assigned.length ? tpl('MCP {n}개 지정', { n: assigned.length }) : t('MCP 안 씀')) : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <details className="step-extras" open={Boolean(summary) || undefined}>
      <summary className="small">
        🧩 {t('스킬·MCP')} {summary && <span className="muted">({summary})</span>}
      </summary>
      <div className="step-extras-body">
        <div className="small muted">{t('글로 쓴 지시 말고도, 작업 방법을 담은 파일(.md, .json, .txt)을 스킬로 붙일 수 있어요.')}</div>
        {skills.length > 0 && (
          <ul className="step-skills">
            {skills.map((skill, i) => (
              <li key={`${skill.name}:${i}`}>
                <button type="button" className="link-btn small" onClick={() => setShown(shown === i ? null : i)} title={t('내용 보기')}>
                  📄 {skill.name} <span className="muted">· {skill.format.toUpperCase()} · {tpl('{n}자', { n: skill.content.length.toLocaleString() })}</span>
                </button>
                {!readOnly && (
                  <button type="button" className="icon-btn" onClick={() => removeSkill(i)} title={t('스킬 빼기')}>
                    ✕
                  </button>
                )}
                {shown === i && <pre className="step-skill-preview">{skill.content.slice(0, 4000)}</pre>}
              </li>
            ))}
          </ul>
        )}
        {!readOnly && (
          <label className={`pixel-btn small file-btn ${full ? 'disabled' : ''}`}>
            📎 {full ? tpl('스킬은 {n}개까지예요', { n: SKILL_LIMITS.perStep }) : t('스킬 파일 붙이기')}
            <input
              type="file"
              accept={SKILL_ACCEPT}
              multiple
              disabled={full}
              hidden
              onChange={(e) => {
                void attach(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        )}
        {error && <div className="small neg">{error}</div>}

        {usesTools && (
          <div className="step-mcp">
            <div className="segmented small" role="radiogroup" aria-label={t('이 단계의 MCP')}>
              <button type="button" role="radio" aria-checked={!assigned} className={`segment ${!assigned ? 'active' : ''}`} disabled={readOnly} onClick={() => onChange({ mcpServerIds: undefined })}>
                {t('사무실 기본')}
              </button>
              <button type="button" role="radio" aria-checked={Boolean(assigned)} className={`segment ${assigned ? 'active' : ''}`} disabled={readOnly} onClick={() => onChange({ mcpServerIds: assigned ?? [] })}>
                {t('이 단계에 MCP 지정')}
              </button>
            </div>
            {!assigned && (
              <div className="small muted">
                {step.kind === 'research' ? t('조사할 때 사무실에 연결된 MCP 중 "조사 때 자동" 도구를 써요.') : t('이 단계는 MCP를 쓰지 않아요. 지정하면 이 단계에서도 써요.')}
              </div>
            )}
            {assigned &&
              (servers === undefined ? (
                <div className="small muted">{tpl('MCP {n}개가 지정돼 있어요. 바꾸려면 대표 계정으로 열어 주세요.', { n: assigned.length })}</div>
              ) : servers.length === 0 ? (
                <div className="small muted">{t('이 사무실에서 쓸 수 있는 MCP가 없어요. MCP 관리에서 먼저 연결해 주세요.')}</div>
              ) : (
                <div className="step-mcp-list">
                  {servers.map((server) => {
                    const auto = server.tools.filter((tool) => tool.mode === 'auto').length;
                    return (
                      <label key={server.id} className="check small">
                        <input type="checkbox" checked={assigned.includes(server.id)} disabled={readOnly || !server.enabled} onChange={(e) => toggleServer(server.id, e.target.checked)} />
                        {server.icon} {server.name}
                        <span className="muted">
                          {' '}
                          · {server.enabled ? tpl('자동 도구 {n}개', { n: auto }) : t('꺼짐')}
                        </span>
                      </label>
                    );
                  })}
                  {assigned.length === 0 && <div className="small muted">{t('아무것도 고르지 않으면 이 단계는 MCP를 쓰지 않아요.')}</div>}
                </div>
              ))}
          </div>
        )}
      </div>
    </details>
  );
}
