import { useEffect, useState } from 'react';
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

/** A step's two extras, each on its own row: MCP picked from the registered servers, and uploaded skill or prompt files. */
export function StepExtras(props: Props) {
  const usesTools = props.step.kind === 'research' || props.step.kind === 'draft' || props.step.kind === 'review';
  return (
    <div className="step-extras">
      {usesTools && <StepMcp {...props} />}
      {props.step.kind === 'draft' && <StepImages {...props} />}
      <StepFiles {...props} />
    </div>
  );
}

/**
 * The MCP servers this step uses, picked from a list of checkboxes: the ones limited to this office and the shared
 * ones, as many as wanted. Before anything is picked a research step uses the office's automatic tools, shown ticked.
 */
function StepMcp({ step, servers, readOnly, onChange }: Props) {
  if (servers === undefined) {
    return (
      <div className="step-extra-row">
        <span className="step-extra-label">🔌 MCP</span>
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
    <optgroup label={title}>
      {list.length === 0 && <option disabled>{t('(없음)')}</option>}
      {list.map((server) => (
        <option
          key={server.id}
          value={server.id}
          disabled={!server.enabled}
          // A click toggles one server without unselecting the others (no Ctrl needed).
          onMouseDown={(e) => {
            e.preventDefault();
            if (!readOnly && server.enabled) toggle(server.id);
          }}
        >
          {server.icon} {server.name} · {server.enabled ? tpl('도구 {n}개', { n: stepTools(server).length }) : t('꺼짐')}
        </option>
      ))}
    </optgroup>
  );
  return (
    <div className="step-extra-row">
      <span className="step-extra-label">🔌 MCP</span>
      <div className="step-extra-body">
        <select
          multiple
          className="mcp-select"
          size={Math.min(8, Math.max(4, own.length + shared.length + 2 + (own.length ? 0 : 1) + (shared.length ? 0 : 1)))}
          value={chosen}
          disabled={readOnly}
          aria-label={t('이 단계의 MCP (여러 개 선택)')}
          onChange={(e) => onChange({ mcpServerIds: [...e.target.selectedOptions].map((option) => option.value) })}
        >
          {group(t('이 사무실 전용 MCP'), own)}
          {group(t('공통 MCP'), shared)}
        </select>
        <span className="small muted">{t('누를 때마다 선택·해제돼요. 여러 개 고를 수 있어요.')}</span>
        {picked.length > 0 ? (
          <div className="step-mcp-uses small">
            {picked.map((server) => (
              <span key={server.id} className={toolsOf(server).length ? '' : 'neg'}>
                {server.icon} {server.name}: {toolsOf(server).length ? toolsOf(server).map((tool) => tool.name).join(', ') : t('쓸 도구 없음')}
              </span>
            ))}
          </div>
        ) : (
          <span className="small muted">{t('고른 MCP가 없어 이 단계는 MCP를 쓰지 않아요.')}</span>
        )}
      </div>
    </div>
  );
}

let imageModelList: Promise<{ models: { id: string; name: string }[]; defaultModel: string }> | null = null;

/** Whether this draft also draws pictures, and with which OpenRouter image model. */
function StepImages({ step, readOnly, onChange }: Props) {
  const [list, setList] = useState<{ id: string; name: string }[] | null>(null);
  const [fallback, setFallback] = useState('openai/gpt-image-1-mini');
  useEffect(() => {
    imageModelList ??= api.imageModels();
    imageModelList.then(
      (r) => {
        setList(r.models);
        setFallback(r.defaultModel);
      },
      () => setList([]),
    );
  }, []);
  const models = list ?? [];
  const current = step.imageModel;
  const options = current && !models.some((m) => m.id === current) ? [{ id: current, name: current }, ...models] : models;
  return (
    <div className="step-extra-row">
      <span className="step-extra-label">🎨 {t('그림')}</span>
      <div className="step-extra-body">
        <select
          value={current ?? ''}
          disabled={readOnly}
          onChange={(e) => onChange({ imageModel: e.target.value || undefined })}
          aria-label={t('그림 생성 모델')}
        >
          <option value="">{t('그림 안 만듦')}</option>
          {(options.length ? options : [{ id: fallback, name: fallback }]).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {current && <span className="small muted">{t('작성자가 그릴 그림을 정하면 이 모델이 그려 결과 파일에 저장해요. 그림마다 OpenRouter 요금이 들어요.')}</span>}
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
