import { flowFromPlan, flowToSteps, parseFlowPack, type FlowPack } from '../../../shared/flow-pack.ts';
import { t, tpl } from '../../../shared/i18n.ts';
import type { Agent, SavedFlow, TeamId, WorkflowStepInput } from '../../../shared/types.ts';
import { validatePlan } from '../../../shared/workflow.ts';
import { api } from '../api.ts';
import './themes.css';

interface Props {
  team: TeamId;
  agents: Agent[];
  steps: WorkflowStepInput[];
  flows: SavedFlow[];
  /** Only the owner keeps the saved list. */
  canSave: boolean;
  onLoad: (steps: WorkflowStepInput[]) => void;
  onError: (message: string) => void;
}

function download(flow: FlowPack) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(flow, null, 2)], { type: 'application/json' }));
  link.download = `${flow.name.replace(/[\\/:*?"<>|\s]+/g, '-')}.flow.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** Load a saved or shared journey into the editor, or keep this one: save it, or export it for the community. */
export function FlowTools({ team, agents, steps, flows, canSave, onLoad, onError }: Props) {
  const ready = !validatePlan(steps, agents);
  const pack = (name: string) => flowFromPlan(steps, agents, { name, team });
  const ask = () => window.prompt(t('흐름 이름'), '')?.trim();

  const run = async (work: () => Promise<void> | void) => {
    try {
      await work();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="row flow-tools small">
      {flows.length > 0 && (
        <select
          value=""
          aria-label={t('저장한 흐름 불러오기')}
          onChange={(e) => {
            const flow = flows.find((f) => f.id === e.target.value);
            if (flow) onLoad(flowToSteps(flow.flow, agents));
          }}
        >
          <option value="">{t('📥 저장한 흐름 불러오기')}</option>
          {flows.map((f) => (
            <option key={f.id} value={f.id}>
              {f.flow.name} ({tpl('{n}단계', { n: String(f.flow.steps.length) })})
            </option>
          ))}
        </select>
      )}
      <label className="pixel-btn small">
        {t('파일에서 불러오기')}
        <input
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void run(async () => onLoad(flowToSteps(parseFlowPack(JSON.parse(await file.text())), agents)));
          }}
        />
      </label>
      {canSave && (
        <button
          type="button"
          className="pixel-btn small"
          disabled={!ready}
          onClick={() =>
            void run(async () => {
              const name = ask();
              if (name) await api.saveFlow(pack(name), 'mine');
            })
          }
        >
          {t('💾 흐름으로 저장')}
        </button>
      )}
      <button
        type="button"
        className="pixel-btn small"
        disabled={!ready}
        title={t('커뮤니티에 올릴 수 있는 파일로 내보내요. 담당 직원 대신 역할만 담겨요.')}
        onClick={() =>
          void run(() => {
            const name = ask();
            if (name) download(pack(name));
          })
        }
      >
        {t('📤 흐름 내보내기')}
      </button>
    </div>
  );
}
