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

/** A step's two extras, each on its own row: MCP picked from the registered servers, and uploaded skill or prompt files. */
export function StepExtras(props: Props) {
  const usesTools = props.step.kind === 'research' || props.step.kind === 'draft' || props.step.kind === 'review';
  return (
    <div className="step-extras">
      {usesTools && <StepMcp {...props} />}
      <StepFiles {...props} />
    </div>
  );
}

/** Which registered MCP servers this step uses: the office default, none, or the ones picked. */
function StepMcp({ step, servers, readOnly, onChange }: Props) {
  const assigned = step.mcpServerIds;
  const toggle = (id: string) => {
    const current = assigned ?? [];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    onChange({ mcpServerIds: next });
  };
  const defaultHint = step.kind === 'research' ? t('조사할 때 사무실에 연결된 MCP 중 "조사 때 자동" 도구를 써요.') : t('이 단계는 MCP를 쓰지 않아요. 지정하면 이 단계에서도 써요.');
  return (
    <div className="step-extra-row">
      <span className="step-extra-label">🔌 MCP</span>
      <div className="step-extra-body">
        {servers === undefined ? (
          <span className="small muted">
            {assigned ? tpl('MCP {n}개가 지정돼 있어요. 바꾸려면 대표 계정으로 열어 주세요.', { n: assigned.length }) : defaultHint}
          </span>
        ) : (
          <>
            <div className="chip-row" role="group" aria-label={t('이 단계의 MCP')}>
              <button type="button" className={`filter-chip ${!assigned ? 'active' : ''}`} disabled={readOnly} aria-pressed={!assigned} onClick={() => onChange({ mcpServerIds: undefined })} title={defaultHint}>
                {t('사무실 기본')}
              </button>
              <button type="button" className={`filter-chip ${assigned?.length === 0 ? 'active' : ''}`} disabled={readOnly} aria-pressed={assigned?.length === 0} onClick={() => onChange({ mcpServerIds: [] })}>
                {t('안 씀')}
              </button>
              {servers.map((server) => {
                const on = Boolean(assigned?.includes(server.id));
                const auto = server.tools.filter((tool) => tool.mode === 'auto').length;
                return (
                  <button
                    key={server.id}
                    type="button"
                    className={`filter-chip ${on ? 'active' : ''}`}
                    disabled={readOnly || !server.enabled}
                    aria-pressed={on}
                    onClick={() => toggle(server.id)}
                    title={server.enabled ? tpl('자동 도구 {n}개', { n: auto }) : t('꺼짐')}
                  >
                    {server.icon} {server.name}
                  </button>
                );
              })}
            </div>
            {servers.length === 0 && <span className="small muted">{t('이 사무실에서 쓸 수 있는 MCP가 없어요. MCP 관리에서 먼저 연결해 주세요.')}</span>}
          </>
        )}
      </div>
    </div>
  );
}

/** Skill or prompt files uploaded for this step (Markdown, JSON or plain text), beside the written instructions. */
function StepFiles({ step, readOnly, onChange }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<number | null>(null);
  const skills = step.skills ?? [];
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
  const remove = (index: number) => {
    const next = skills.filter((_, i) => i !== index);
    onChange({ skills: next.length ? next : undefined });
    setShown(null);
  };

  return (
    <div className="step-extra-row">
      <span className="step-extra-label">📎 {t('스킬·프롬프트')}</span>
      <div className="step-extra-body">
        <div className="chip-row">
          {skills.map((skill, i) => (
            <span key={`${skill.name}:${i}`} className="step-file-chip">
              <button type="button" className="link-btn small" onClick={() => setShown(shown === i ? null : i)} title={tpl('{n}자', { n: skill.content.length.toLocaleString() })}>
                📄 {skill.name}
              </button>
              {!readOnly && (
                <button type="button" className="icon-btn" onClick={() => remove(i)} title={t('파일 빼기')}>
                  ✕
                </button>
              )}
            </span>
          ))}
          {!readOnly && !full && (
            <label className="filter-chip file-btn" title={t('작업 방법이나 프롬프트를 담은 .md, .json, .txt 파일')}>
              ⬆ {t('파일 올리기')}
              <input
                type="file"
                accept={SKILL_ACCEPT}
                multiple
                hidden
                onChange={(e) => {
                  void attach(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          )}
          {skills.length === 0 && readOnly && <span className="small muted">{t('없음')}</span>}
        </div>
        {shown !== null && skills[shown] && <pre className="step-skill-preview">{skills[shown].content.slice(0, 4000)}</pre>}
        {error && <div className="small neg">{error}</div>}
      </div>
    </div>
  );
}
