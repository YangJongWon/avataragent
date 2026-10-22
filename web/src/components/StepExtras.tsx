import { useEffect, useRef, useState } from 'react';
import { api } from '../api.ts';
import { t, tpl } from '../../../shared/i18n.ts';
import { defaultTools, stepTools, type McpServer } from '../../../shared/mcp.ts';
import { SKILL_ACCEPT, SKILL_LIMITS, skillFromFile } from '../../../shared/step-extras.ts';
import type { WorkflowStepInput } from '../../../shared/types.ts';

/** A registered MCP server as a step sees it: shared by every office, limited to this one, or limited to others. */
export type StepServer = McpServer & { scope: 'shared' | 'office' | 'other' };

/** Every registered server, labelled for the office it is seen from. */
export const stepServers = (servers: McpServer[] | undefined, officeId: string): StepServer[] | undefined =>
  servers?.map((server) => ({
    ...server,
    scope: server.officeIds === 'all' ? 'shared' : server.officeIds.includes(officeId) ? 'office' : 'other',
  }));

interface Props {
  step: WorkflowStepInput;
  /** Every registered MCP server; undefined when the viewer cannot see them (only the owner can). */
  servers: StepServer[] | undefined;
  readOnly?: boolean;
  onChange: (patch: Partial<WorkflowStepInput>) => void;
}

/** A step's extras, each on its own row: MCP picked from the registered servers, and the image model of a draft. */
export function StepExtras(props: Props) {
  if (props.step.kind === 'approval') return null;
  return <StepMcp {...props} />;
}

/**
 * The MCP servers this step uses: a closed drop-down showing what is picked, which opens on a list of the servers
 * limited to this office and the shared ones, each click ticking one more or one less. Before anything is picked a
 * research step uses the office's automatic tools, shown ticked.
 */
function StepMcp({ step, servers, readOnly, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (servers === undefined) {
    return (
      <div className="step-row">
        <span className="step-row-label">🔌 MCP</span>
        <span className="small muted">{tpl('MCP {n}개가 지정돼 있어요. 바꾸려면 대표 계정으로 열어 주세요.', { n: step.mcpServerIds?.length ?? 0 })}</span>
      </div>
    );
  }
  const own = servers.filter((server) => server.scope === 'office');
  const shared = servers.filter((server) => server.scope === 'shared');
  const implicit = !step.mcpServerIds;
  // Unpicked, research uses the office default: the servers with tools set to run automatically.
  const chosen = step.mcpServerIds ?? (step.kind === 'research' ? [...own, ...shared].filter((server) => server.enabled && defaultTools(server).length).map((server) => server.id) : []);
  const toolsOf = (server: StepServer) => (implicit ? defaultTools(server) : stepTools(server));
  const toggle = (id: string) => onChange({ mcpServerIds: chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id] });
  const picked = [...own, ...shared].filter((server) => chosen.includes(server.id));
  // Both groups always show, an empty one saying so, so it is clear where office-only servers would be.
  const group = (title: string, list: StepServer[]) => (
    <div className="ms-group" role="group" aria-label={title}>
      <div className="ms-group-title">{title}</div>
      {list.length === 0 && <div className="ms-empty">{t('(없음)')}</div>}
      {list.map((server) => {
        const on = chosen.includes(server.id);
        return (
          <button
            key={server.id}
            type="button"
            role="option"
            aria-selected={on}
            className={`ms-option ${on ? 'on' : ''}`}
            disabled={!server.enabled}
            title={toolsOf(server).map((tool) => tool.name).join(', ')}
            onClick={() => toggle(server.id)}
          >
            <span className="ms-check">{on ? '☑' : '☐'}</span>
            <span className="ms-name">
              {server.icon} {server.name}
            </span>
            <span className="ms-meta">{server.enabled ? tpl('도구 {n}개', { n: (on ? toolsOf(server) : stepTools(server)).length }) : t('꺼짐')}</span>
          </button>
        );
      })}
    </div>
  );
  return (
    <div className="step-row">
      <span className="step-row-label">🔌 MCP</span>
      <div className="ms" ref={box}>
        <button type="button" className="ms-control" disabled={readOnly} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <span className={`ms-value ${picked.length ? '' : 'muted'}`}>
            {picked.length ? picked.map((server) => `${server.icon} ${server.name}`).join(', ') : t('사용 안 함')}
          </span>
          <span className="ms-arrow">▾</span>
        </button>
        {open && (
          <div className="ms-panel" role="listbox" aria-multiselectable="true" aria-label={t('이 단계의 MCP (여러 개 선택)')}>
            {group(t('이 사무실 전용 MCP'), own)}
            {group(t('공통 MCP'), shared)}
          </div>
        )}
      </div>
    </div>
  );
}

let imageModelList: Promise<string[]> | null = null;

/** The ids of the OpenRouter models that can draw, for marking staff whose model can make pictures. */
export function useImageModelIds() {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    imageModelList ??= api.imageModels().then(
      (r) => r.models.map((m) => m.id),
      () => [],
    );
    void imageModelList.then(setIds);
  }, []);
  return ids;
}

/**
 * A step's instructions with its skill and prompt files: the text box carries a 📎 button, and the attached files
 * (Markdown, JSON or plain text) sit as chips right under it.
 */
export function InstructionField({ step, readOnly, multiline, onChange }: { step: WorkflowStepInput; readOnly?: boolean; multiline?: boolean; onChange: (patch: Partial<WorkflowStepInput>) => void }) {
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
  const text = {
    value: step.instructions,
    maxLength: 300,
    disabled: readOnly,
    placeholder: t('이 단계에만 줄 지시 (선택)'),
    onChange: (e: { target: { value: string } }) => onChange({ instructions: e.target.value }),
  };

  return (
    <div className="instruction-field">
      <div className="instruction-box">
        {multiline ? <textarea rows={2} {...text} /> : <input {...text} />}
        {!readOnly && (
          <label className={`attach-btn ${full ? 'disabled' : ''}`} title={full ? tpl('스킬은 {n}개까지예요', { n: SKILL_LIMITS.perStep }) : t('작업 방법이나 프롬프트를 담은 .md, .json, .txt 파일')}>
            📎
            <input
              type="file"
              accept={SKILL_ACCEPT}
              multiple
              hidden
              disabled={full}
              onChange={(e) => {
                void attach(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        )}
      </div>
      {skills.length > 0 && (
        <div className="chip-row instruction-files">
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
        </div>
      )}
      {shown !== null && skills[shown] && <pre className="step-skill-preview">{skills[shown].content.slice(0, 4000)}</pre>}
      {error && <div className="small neg">{error}</div>}
    </div>
  );
}
