import { Fragment, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { flowToSteps } from '../../../shared/flow-pack.ts';
import { GENERAL_TASK_TYPES, TASK_CATEGORIES, TEAM_TYPE_CATEGORY, type TaskCategory } from '../../../shared/task-types.ts';
import { TEAM_ORDER, TEAMS } from '../../../shared/teams.ts';
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

type Source = 'template' | 'saved' | 'community';
type Entry = {
  key: string;
  source: Source;
  name: string;
  detail: string;
  chain: string[];
  /** Filed under a category and a team when known, for the filters. */
  category?: TaskCategory;
  team?: TeamId | null;
  /** Searched but not shown: tags and the team's name. */
  keywords?: string[];
  load: () => Promise<PickedFlow>;
  remove?: () => Promise<void>;
};

/** Step-count filter: short (up to 4), medium (5–6), long (7 and more). */
const LENGTHS = [
  { id: 'short', label: '4단계 이하', fits: (n: number) => n <= 4 },
  { id: 'medium', label: '5~6단계', fits: (n: number) => n >= 5 && n <= 6 },
  { id: 'long', label: '7단계 이상', fits: (n: number) => n >= 7 },
] as const;
type LengthId = (typeof LENGTHS)[number]['id'];

const SOURCE_LABEL = { template: '유형 기본', saved: '저장한 흐름', community: '커뮤니티' } as const;

/** One place to choose a journey: team defaults, flows saved in the office, popular community flows, and an AI pick. */
export function FlowPicker({ officeId, team, agents, flows, request, canManage, onPick, onClose, onError }: Props) {
  const { t, tpl } = useLanguage();
  const [query, setQuery] = useState('');
  const [popular, setPopular] = useState<PopularFlow[]>([]);
  const [picks, setPicks] = useState<{ picks: FlowPick[]; note: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<Source | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<TaskCategory | 'all'>('all');
  const [teamFilter, setTeamFilter] = useState<TeamId | 'all'>('all');
  const [lengthFilter, setLengthFilter] = useState<LengthId | 'all'>('all');

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
    const categoryName = (id: TaskCategory | undefined) => (id ? t(TASK_CATEGORIES.find((c) => c.id === id)?.label ?? '') : '');
    const teamTypes = (sourceTeam: TeamId) =>
      TEAMS[sourceTeam].taskTypes.map((type): Entry => {
        const steps = templatePlan(sourceTeam, type.id, agents);
        const name = sourceTeam === team ? t(type.label) : `${t(TEAMS[sourceTeam].name)} · ${t(type.label)}`;
        const category = TEAM_TYPE_CATEGORY[type.id];
        return {
          key: sourceTeam === team ? `template:${type.id}` : `template:${sourceTeam}:${type.id}`,
          source: 'template',
          name,
          detail: [categoryName(category), tpl('{n}단계', { n: String(steps.length) })].filter(Boolean).join(' · '),
          chain: chainOf(steps),
          category,
          team: sourceTeam,
          keywords: [t(TEAMS[sourceTeam].name)],
          load: async () => ({
            steps,
            ...(sourceTeam === team ? { taskType: type.id } : {}),
            note: tpl('유형 기본 흐름 "{name}"을(를) 썼어요.', { name }),
          }),
        };
      });
    // Types any office can take on keep their type wherever they are used, so the writer gets the type's instructions.
    const general: Entry[] = GENERAL_TASK_TYPES.map((type) => {
      const steps = templatePlan(team, type.id, agents);
      const name = t(type.label);
      const fit = TASK_CATEGORIES.find((c) => c.id === type.category)!.team;
      return {
        key: `template:${type.id}`,
        source: 'template',
        name,
        detail: [categoryName(type.category), t(type.summary), tpl('{n}단계', { n: String(steps.length) })].join(' · '),
        chain: chainOf(steps),
        category: type.category,
        team: fit,
        keywords: [...type.tags.map((tag) => t(tag)), t(TEAMS[fit].name)],
        load: async () => ({ steps, taskType: type.id, note: tpl('유형 기본 흐름 "{name}"을(를) 썼어요.', { name }) }),
      };
    });
    const templates: Entry[] = [...teamTypes(team), ...general, ...TEAM_ORDER.filter((id) => id !== team).flatMap(teamTypes)];
    const saved: Entry[] = flows.map((f) => ({
      key: `saved:${f.id}`,
      source: 'saved',
      name: f.flow.name,
      detail: [f.flow.description, tpl('{n}단계', { n: String(f.flow.steps.length) })].filter(Boolean).join(' · '),
      chain: chainOf(f.flow.steps),
      team: f.flow.team,
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
  const matches = (e: Entry) => words.every((w) => [e.name, e.detail, ...e.chain, ...(e.keywords ?? [])].join(' ').toLowerCase().includes(w));
  const length = LENGTHS.find((l) => l.id === lengthFilter);
  const filtered = (e: Entry) =>
    (sourceFilter === 'all' || e.source === sourceFilter) &&
    (categoryFilter === 'all' || e.category === categoryFilter) &&
    (teamFilter === 'all' || e.team === teamFilter) &&
    (!length || (e.chain.length > 0 && length.fits(e.chain.length)));
  const visible = entries.filter((e) => matches(e) && filtered(e));
  const filtering = sourceFilter !== 'all' || categoryFilter !== 'all' || teamFilter !== 'all' || lengthFilter !== 'all';
  const clearFilters = () => {
    setSourceFilter('all');
    setCategoryFilter('all');
    setTeamFilter('all');
    setLengthFilter('all');
  };

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

      <div className="flow-picker-filters">
        <div className="chip-row" role="radiogroup" aria-label={t('분류')}>
          {(['all', ...TASK_CATEGORIES.map((c) => c.id)] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={categoryFilter === id}
              className={`filter-chip ${categoryFilter === id ? 'active' : ''}`}
              onClick={() => setCategoryFilter(id)}
            >
              {id === 'all' ? t('전체') : t(TASK_CATEGORIES.find((c) => c.id === id)!.label)}
            </button>
          ))}
        </div>
        <div className="row flow-picker-selects">
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as Source | 'all')} aria-label={t('흐름 종류')}>
            <option value="all">{t('모든 종류')}</option>
            {(['template', 'saved', 'community'] as const).map((source) => (
              <option key={source} value={source}>
                {t(SOURCE_LABEL[source])}
              </option>
            ))}
          </select>
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value as TeamId | 'all')} aria-label={t('팀')}>
            <option value="all">{t('모든 팀')}</option>
            {TEAM_ORDER.map((id) => (
              <option key={id} value={id}>
                {TEAMS[id].emoji} {t(TEAMS[id].name)}
              </option>
            ))}
          </select>
          <select value={lengthFilter} onChange={(e) => setLengthFilter(e.target.value as LengthId | 'all')} aria-label={t('단계 수')}>
            <option value="all">{t('단계 수 전체')}</option>
            {LENGTHS.map((l) => (
              <option key={l.id} value={l.id}>
                {t(l.label)}
              </option>
            ))}
          </select>
          {filtering && (
            <button type="button" className="pixel-btn small" onClick={clearFilters}>
              {t('필터 지우기')}
            </button>
          )}
          <span className="small muted">{tpl('{n}개', { n: String(visible.length) })}</span>
        </div>
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
        if (!total || (filtering && list.length === 0)) return null;
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
                      {e.chain.length > 0 && (
                        <span className="small flow-chain">
                          {e.chain.map((step, index) => (
                            <Fragment key={`${index}:${step}`}>
                              {step}
                              {index < e.chain.length - 1 && (e.chain.length >= 6 && (index + 1) % 3 === 0 ? <br /> : ' → ')}
                            </Fragment>
                          ))}
                        </span>
                      )}
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
