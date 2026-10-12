import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { flowToSteps } from '../../../shared/flow-pack.ts';
import { TEAMS } from '../../../shared/teams.ts';
import type { Agent, SavedFlow, TeamId, WorkflowStepInput } from '../../../shared/types.ts';
import { templatePlan } from '../../../shared/workflow.ts';
import { api, type FlowPick, type PopularFlow, type TaskRequest } from '../api.ts';
import { useLanguage } from '../LanguageProvider.tsx';

export interface PickedFlow {
  steps: WorkflowStepInput[];
  /** Shown as the journey's note so people know where it came from. */
  note: string;
  /** Set when a team type's default journey was picked. */
  taskType?: string;
}

interface Props {
  officeId: string;
  team: TeamId;
  agents: Agent[];
  /** Saved flows from the office database. */
  flows: SavedFlow[];
  /** What the task is about; the AI recommendation needs it. */
  request: TaskRequest;
  /** The owner may delete saved flows. */
  canManage: boolean;
  onPick: (flow: PickedFlow) => void;
  onClose: () => void;
  onError: (message: string) => void;
}

type Entry = { key: string; source: 'template' | 'saved' | 'community'; name: string; detail: string; chain: string[]; load: () => Promise<PickedFlow>; remove?: () => Promise<void> };

const SOURCE_LABEL = { template: '유형 기본', saved: '저장한 흐름', community: '커뮤니티' } as const;

/** One place to choose a journey: team defaults, flows saved in the office, popular community flows, and an AI pick. */
export function FlowPicker({ officeId, team, agents, flows, request, canManage, onPick, onClose, onError }: Props) {
  const { t, tpl } = useLanguage();
  const [query, setQuery] = useState('');
  const [popular, setPopular] = useState<PopularFlow[]>([]);
  const [picks, setPicks] = useState<{ picks: FlowPick[]; note: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.popularFlows().then(setPopular, () => setPopular([]));
  }, []);

  // A dialog of its own (portaled to the body so drawer transforms never trap it).
  // Escape is caught in the capture phase so an outer dialog underneath stays open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const entries = useMemo<Entry[]>(() => {
    const chainOf = (steps: { label: string }[]) => steps.map((s) => t(s.label));
    const templates: Entry[] = TEAMS[team].taskTypes.map((type) => {
      const steps = templatePlan(team, type.id, agents);
      return {
        key: `template:${type.id}`,
        source: 'template',
        name: t(type.label),
        detail: tpl('{n}단계', { n: String(steps.length) }),
        chain: chainOf(steps),
        load: async () => ({ steps, taskType: type.id, note: tpl('유형 기본 흐름 "{name}"을(를) 썼어요.', { name: t(type.label) }) }),
      };
    });
    const saved: Entry[] = flows.map((f) => ({
      key: `saved:${f.id}`,
      source: 'saved',
      name: f.flow.name,
      detail: [f.flow.description, tpl('{n}단계', { n: String(f.flow.steps.length) })].filter(Boolean).join(' · '),
      chain: chainOf(f.flow.steps),
      load: async () => ({ steps: flowToSteps(f.flow, agents), note: tpl('저장한 흐름 "{name}"을(를) 불러왔어요.', { name: f.flow.name }) }),
      remove: canManage
        ? async () => {
            await api.removeFlow(f.id);
          }
        : undefined,
    }));
    const community: Entry[] = popular.map((p) => ({
      key: `community:${p.id}`,
      source: 'community',
      name: p.title,
      detail: [p.summary, `♥ ${p.likes}`, `⬇ ${p.downloads}`, ...p.tags.map((tag) => `#${tag}`)].filter(Boolean).join(' · '),
      chain: [],
      load: async () => ({ steps: flowToSteps(await api.communityFlow(p.id, officeId), agents), note: tpl('커뮤니티 흐름 "{name}"을(를) 불러왔어요.', { name: p.title }) }),
    }));
    return [...templates, ...saved, ...community];
  }, [team, agents, flows, popular, officeId, canManage, t, tpl]);

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (e: Entry) => words.every((w) => [e.name, e.detail, ...e.chain].join(' ').toLowerCase().includes(w));
  const visible = entries.filter(matches);

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    try {
      await work();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const use = (entry: Entry) => run(entry.key, async () => onPick(await entry.load()));
  const usePick = (pick: FlowPick) => {
    const entry = entries.find((e) => e.key === `${pick.source}:${pick.id}`) ?? entries.find((e) => e.source === pick.source && e.name === pick.name);
    if (!entry) return onError(t('흐름을 찾을 수 없어요.'));
    void run(entry.key, async () => {
      const picked = await entry.load();
      onPick({ ...picked, note: tpl('추천 흐름 "{name}": {reason}', { name: pick.name, reason: pick.reason }) });
    });
  };

  return createPortal(
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal pixel-box flow-picker-modal">
        <div className="modal-head">
          <span>📚 {t('흐름 고르기')}</span>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('닫기')}>
            ✕
          </button>
        </div>
        <div className="flow-picker">
      <div className="row flow-picker-bar">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('이름·단계·태그로 찾기')} aria-label={t('흐름 찾기')} />
        <button
          type="button"
          className="pixel-btn small"
          disabled={busy !== null}
          title={t('저장한 흐름과 커뮤니티 인기 흐름 중에서 이 요청에 맞는 것을 골라 줘요. AI 비용이 조금 들어요.')}
          onClick={() => void run('recommend', async () => setPicks(await api.recommendFlows(officeId, request)))}
        >
          {busy === 'recommend' ? t('고르는 중…') : t('🧭 이 업무에 맞는 흐름 추천')}
        </button>
      </div>

      {picks && (
        <div className="flow-picker-picks">
          <span className="small muted">🧭 {t('AI 추천')}</span>
          {picks.picks.length === 0 ? (
            <p className="small">{picks.note}</p>
          ) : (
            <ul className="flow-picks">
              {picks.picks.map((p) => (
                <li key={`${p.source}:${p.id}`} className="row">
                  <span className="flow-pick-text small">
                    <b>{p.name}</b> <span className="theme-badge">{t(SOURCE_LABEL[p.source])}</span>
                    <br />
                    <span className="muted">{p.reason}</span>
                  </span>
                  <button type="button" className="pixel-btn small primary" disabled={busy !== null} onClick={() => usePick(p)}>
                    {t('이 흐름 쓰기')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(['template', 'saved', 'community'] as const).map((source) => {
        const list = visible.filter((e) => e.source === source);
        const total = entries.filter((e) => e.source === source).length;
        if (!total) return null;
        return (
          <section key={source} className="flow-picker-group">
            <h4>
              {t(SOURCE_LABEL[source])} <span className="muted small">{list.length === total ? total : `${list.length}/${total}`}</span>
            </h4>
            {list.length === 0 ? (
              <p className="small muted">{t('찾는 흐름이 없어요.')}</p>
            ) : (
              <ul className="flow-picker-list">
                {list.map((e) => (
                  <li key={e.key}>
                    <div className="flow-picker-text">
                      <b>{e.name}</b>
                      {e.detail && <span className="small muted">{e.detail}</span>}
                      {e.chain.length > 0 && <span className="small flow-chain">{e.chain.join(' → ')}</span>}
                    </div>
                    <span className="row">
                      {e.remove && (
                        <button
                          type="button"
                          className="icon-btn"
                          title={t('저장한 흐름 지우기')}
                          disabled={busy !== null}
                          onClick={() => window.confirm(tpl('"{name}" 흐름을 지울까요?', { name: e.name })) && void run(e.key, e.remove!)}
                        >
                          🗑
                        </button>
                      )}
                      <button type="button" className="pixel-btn small primary" disabled={busy !== null} onClick={() => void use(e)}>
                        {busy === e.key ? t('불러오는 중…') : t('이 흐름 쓰기')}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {!flows.length && <p className="small muted">{t('저장한 흐름이 아직 없어요. 여정을 만든 뒤 "흐름으로 저장"하면 여기에 쌓여요.')}</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
