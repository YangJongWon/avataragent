import { useState } from 'react';
import { t, tpl } from '../../../shared/i18n.ts';
import {
  API_KINDS,
  COMPANY_NAME_MAX,
  COMPATIBLE_SERVICES,
  HATS,
  companyLinks,
  companyRequiresKey,
  hatName,
  linkLabel,
  MODEL_LABEL_MAX,
  MAX_TIER,
  TIER_LABEL,
  tierHat,
  tierLabel,
  tiersInUse,
  type ApiKind,
  type Company,
  type HatShape,
  type ModelEntry,
  type Tier,
  type TierLook,
} from '../../../shared/models.ts';
import { AI_TIMEOUT_RANGE, type AiMode, type AiTimeouts, type Snapshot } from '../../../shared/types.ts';
import { api, type CompanyInput, type ModelAdvice, type ModelInput } from '../api.ts';
import { HatPreview } from './HatPreview.tsx';
import { LinkRow } from './LinkRow.tsx';

type Notify = { onError: (m: string) => void; onNotice: (m: string) => void };

const LOOKS: TierLook[] = [1, 2, 3];
const HAT_COLORS = ['#c0392b', '#d97757', '#e0a800', '#16a085', '#2980b9', '#4c6ef5', '#7c3aed', '#c026d3', '#db2777', '#475569', '#7c4a21', '#111827'];
type HatCandidate = { hat: HatShape; color: string };

const rgb = (hex: string) => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
const colorDistance = (a: string, b: string) => {
  const x = rgb(a);
  const y = rgb(b);
  return Math.sqrt(x.reduce((sum, value, i) => sum + (value - y[i]) ** 2, 0));
};

/** Randomized, but biased toward combinations that are visually distinct from companies already in the office. */
function hatCandidates(companies: Company[], editingId?: string): HatCandidate[] {
  const used = companies.filter((c) => c.id !== editingId);
  const pool = (Object.keys(HATS) as HatShape[]).flatMap((hat) => HAT_COLORS.map((color) => ({ hat, color, random: Math.random() * 80 })));
  const picked: HatCandidate[] = [];
  while (picked.length < 6 && pool.length) {
    const references = [...used, ...picked];
    const score = (candidate: HatCandidate & { random: number }) => {
      if (!references.length) return candidate.random;
      const nearest = Math.min(...references.map((other) => colorDistance(candidate.color, other.color) + (candidate.hat === other.hat ? 0 : 180)));
      return nearest + candidate.random;
    };
    pool.sort((a, b) => score(b) - score(a));
    const [best] = pool.splice(0, 1);
    picked.push(best);
  }
  return picked;
}

/** The tiers in use, the one being edited, and one past each end, so a new lowest or highest tier can be made. */
function tierChoices(current: Tier): Tier[] {
  const used = tiersInUse();
  const low = Math.min(...used, current);
  const high = Math.max(...used, current);
  return [...new Set([...(low > 1 ? [low - 1] : []), ...used, current, ...(high < MAX_TIER ? [high + 1] : [])])].sort((a, b) => a - b);
}
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const PROVIDER_LABEL: Record<string, string> = {
  mock: t('시뮬레이션'),
  agents: t('직원별 실제 AI'),
  openai: t('OpenAI 하나로 호출'),
  anthropic: t('Anthropic 하나로 호출'),
  gemini: t('Gemini 하나로 호출'),
  xai: t('xAI 하나로 호출'),
};

function KeyBadge({ company }: { company: Company }) {
  const key = company.key ?? { source: 'none', hint: '' };
  if (key.source === 'saved') return <span className="key-badge ok">🔑 {t('등록됨')} {key.hint}</span>;
  if (key.source === 'env') return <span className="key-badge ok">🔑 .env {key.hint}</span>;
  if (!companyRequiresKey(company)) return <span className="key-badge">{t('키 없음 (필요 없으면 괜찮아요)')}</span>;
  return <span className="key-badge warn">{t('키 없음')}</span>;
}

function QuickKey({ company, onError, onNotice }: { company: Company } & Notify) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.updateCompany(company.id, { apiKey: key.trim() });
      setKey('');
      onNotice(tpl('{name} API 키를 저장했어요.', { name: company.name }));
      try {
        const { models } = await api.discoverModels({ companyId: company.id });
        onNotice(tpl('{name} 연결 확인: 쓸 수 있는 모델 {n}개', { name: company.name, n: models.length }));
      } catch (e) {
        onError(tpl('키는 저장했지만 연결 확인에 실패했어요: {msg}', { msg: message(e) }));
      }
    } catch (e) {
      onError(message(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="quick-key"
      onSubmit={(e) => {
        e.preventDefault();
        if (key.trim()) void save();
      }}
    >
      <input
        type="password"
        autoComplete="off"
        value={key}
        aria-label={tpl('{name} API 키', { name: company.name })}
        placeholder={company.key?.source && company.key.source !== 'none' ? t('API 키 바꾸기') : t('API 키 입력')}
        onChange={(e) => setKey(e.target.value)}
      />
      <button className="pixel-btn small primary" type="submit" disabled={busy || !key.trim()}>
        {busy ? t('저장 중…') : t('키 저장')}
      </button>
    </form>
  );
}

/** How long one AI call may take before it is retried; free models get their own, longer limit. Empty keeps the default. */
function TimeoutForm({ timeouts, onError, onNotice }: { timeouts: AiTimeouts } & Notify) {
  const own = (sec: number, fallback: number) => (sec === fallback ? '' : String(sec));
  const [paid, setPaid] = useState(own(timeouts.paidSec, timeouts.defaults.paidSec));
  const [free, setFree] = useState(own(timeouts.freeSec, timeouts.defaults.freeSec));
  const [busy, setBusy] = useState(false);
  const changed = paid !== own(timeouts.paidSec, timeouts.defaults.paidSec) || free !== own(timeouts.freeSec, timeouts.defaults.freeSec);

  const save = async () => {
    setBusy(true);
    try {
      const saved = await api.setAiTimeouts({ paidSec: paid.trim() ? Number(paid) : null, freeSec: free.trim() ? Number(free) : null });
      onNotice(tpl('AI 응답 제한시간을 일반 {paid}초, 무료 {free}초로 정했어요. 다음 AI 호출부터 적용돼요.', { paid: saved.paidSec, free: saved.freeSec }));
    } catch (e) {
      onError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const input = (value: string, set: (v: string) => void, fallback: number) => (
    <input
      type="number"
      min={AI_TIMEOUT_RANGE.min}
      max={AI_TIMEOUT_RANGE.max}
      step={10}
      value={value}
      placeholder={tpl('기본 {n}초', { n: fallback })}
      onChange={(e) => set(e.target.value)}
    />
  );

  return (
    <>
      <h3>{t('AI 응답 제한시간')}</h3>
      <p className="muted small">
        {tpl('AI가 이 시간 안에 답하지 않으면 다시 시도하고, 그래도 안 되면 업무가 멈춰요. 무료 모델은 느려서 따로 길게 둬요. {min}~{max}초, 비우면 기본값.', {
          min: AI_TIMEOUT_RANGE.min,
          max: AI_TIMEOUT_RANGE.max,
        })}
      </p>
      <div className="row wrap timeout-row">
        <label className="field">
          {t('일반 모델 (초)')}
          {input(paid, setPaid, timeouts.defaults.paidSec)}
        </label>
        <label className="field">
          {t('무료 모델 (초)')}
          {input(free, setFree, timeouts.defaults.freeSec)}
        </label>
        <button className="pixel-btn primary" type="button" disabled={busy || !changed} onClick={() => void save()}>
          {t('저장')}
        </button>
      </div>
    </>
  );
}

function CompanyForm({ company, companies, onDone, onError, onNotice }: { company: Company | null; companies: Company[]; onDone: () => void } & Notify) {
  const [form, setForm] = useState<CompanyInput>(
    company
      ? { name: company.name, hat: company.hat, color: company.color, api: company.api, baseUrl: company.baseUrl }
      : { name: '', hat: 'beret', color: HATS.beret.color, api: 'openai_compatible', baseUrl: '' },
  );
  const [apiKey, setApiKey] = useState('');
  const [found, setFound] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [hatPicks, setHatPicks] = useState<HatCandidate[]>([]);
  const set = (patch: Partial<CompanyInput>) => setForm((f) => ({ ...f, ...patch }));
  const savedKey = company?.key?.source === 'saved';

  const test = async () => {
    setBusy(true);
    try {
      const { models } = await api.discoverModels({ companyId: company?.id, api: form.api, baseUrl: form.baseUrl, apiKey: apiKey || undefined });
      setFound(models);
      onNotice(tpl('연결됐어요. 쓸 수 있는 모델 {n}개를 확인했어요.', { n: models.length }));
    } catch (e) {
      setFound(null);
      onError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    try {
      if (company) await api.updateCompany(company.id, { ...form, ...(apiKey ? { apiKey } : {}) });
      else await api.createCompany({ ...form, apiKey: apiKey || undefined });
      onNotice(
        company
          ? tpl('{name} 정보를 저장했어요.', { name: form.name })
          : tpl('{name} 회사를 등록했어요. 이제 모델을 등록해 주세요.', { name: form.name }),
      );
      onDone();
    } catch (e) {
      onError(message(e));
    }
  };

  const removeKey = async () => {
    if (!company || !window.confirm(tpl('{name}에 등록한 API 키를 지울까요?', { name: company.name }))) return;
    try {
      await api.updateCompany(company.id, { apiKey: null });
      onNotice(t('API 키를 지웠어요.'));
    } catch (e) {
      onError(message(e));
    }
  };

  return (
    <div className="company-form">
      <div className="company-form-preview">
        {LOOKS.map((look) => (
          <HatPreview key={look} hat={form.hat} color={form.color} look={look} title={t(TIER_LABEL[look])} />
        ))}
      </div>
      {!company && (
        <div className="row wrap link-row">
          <span className="muted small">{t('빠른 채우기')}</span>
          {COMPATIBLE_SERVICES.map((s) => (
            <button
              key={s.name}
              type="button"
              className={`pixel-btn small ${form.baseUrl === s.baseUrl ? 'primary' : ''}`}
              onClick={() => set({ name: s.name, api: 'openai_compatible', baseUrl: s.baseUrl })}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <label className="field">
        {t('회사 이름')}
        <input value={form.name} maxLength={COMPANY_NAME_MAX} placeholder={t('예: DeepSeek')} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <div className="row wrap">
        <label className="field grow">
          {t('모자 모양')}
          <select value={form.hat} onChange={(e) => set({ hat: e.target.value as HatShape })}>
            {(Object.keys(HATS) as HatShape[]).map((h) => (
              <option key={h} value={h}>
                {hatName(h)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {t('모자 색')}
          <input type="color" value={form.color} onChange={(e) => set({ color: e.target.value })} />
        </label>
      </div>
      <div className="hat-randomizer">
        <div className="row between wrap">
          <span className="muted small">{t('구분하기 쉬운 모자 후보')}</span>
          <button className="pixel-btn small" type="button" onClick={() => setHatPicks(hatCandidates(companies, company?.id))}>
            {hatPicks.length ? t('후보 새로 뽑기') : t('🎲 랜덤 후보 만들기')}
          </button>
        </div>
        {hatPicks.length > 0 && (
          <div className="hat-candidates" role="list" aria-label={t('구분하기 쉬운 모자 후보')}>
            {hatPicks.map((pick) => {
              const selected = form.hat === pick.hat && form.color.toLowerCase() === pick.color;
              return (
                <button
                  key={`${pick.hat}-${pick.color}`}
                  type="button"
                  role="listitem"
                  className={`hat-candidate ${selected ? 'selected' : ''}`}
                  title={`${hatName(pick.hat)} · ${pick.color}`}
                  aria-pressed={selected}
                  onClick={() => set({ hat: pick.hat, color: pick.color })}
                >
                  <HatPreview hat={pick.hat} color={pick.color} look={2} />
                  <span>{hatName(pick.hat)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <label className="field">
        {t('API 종류')}
        <select value={form.api} disabled={company?.builtin} onChange={(e) => set({ api: e.target.value as ApiKind })}>
          {(Object.keys(API_KINDS) as ApiKind[]).map((k) => (
            <option key={k} value={k}>
              {API_KINDS[k].name}
            </option>
          ))}
        </select>
      </label>
      {form.api === 'openai_compatible' && (
        <label className="field">
          {t('API 주소 (Base URL)')}
          <input
            value={form.baseUrl}
            placeholder={t('예: https://api.deepseek.com/v1 · http://localhost:11434/v1')}
            onChange={(e) => set({ baseUrl: e.target.value })}
          />
        </label>
      )}
      <label className="field">
        {t('API 키')} {company && <KeyBadge company={company} />}
        <input
          type="password"
          autoComplete="off"
          value={apiKey}
          placeholder={company?.key?.source && company.key.source !== 'none' ? t('바꿀 때만 입력') : 'sk-…'}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </label>
      <LinkRow links={companyLinks(form).map((l) => ({ ...l, label: linkLabel(l.label) }))} />
      <p className="muted small">
        {t('키는 이 서버의 data 폴더에만 저장되고 화면으로는 다시 보내지 않아요.')}
        {API_KINDS[form.api].env && tpl(' 비워 두면 .env의 {env}를 써요.', { env: API_KINDS[form.api].env })}
      </p>
      {found && (
        <details className="found-models">
          <summary>{tpl('확인된 모델 {n}개', { n: found.length })}</summary>
          <p className="small">{found.join(', ') || t('목록이 비어 있어요.')}</p>
        </details>
      )}
      <div className="row end wrap">
        {savedKey && (
          <button className="pixel-btn small danger" type="button" onClick={removeKey}>
            {t('키 삭제')}
          </button>
        )}
        <button className="pixel-btn small" type="button" disabled={busy} onClick={test}>
          {busy ? t('확인 중…') : `🔌 ${t('연결 확인')}`}
        </button>
        <button className="pixel-btn small" type="button" onClick={onDone}>
          {t('취소')}
        </button>
        <button className="pixel-btn small primary" type="button" disabled={!form.name.trim()} onClick={save}>
          {t('저장')}
        </button>
      </div>
    </div>
  );
}

function ModelForm({
  model,
  companies,
  onDone,
  onError,
  onNotice,
}: { model: ModelEntry | null; companies: Company[]; onDone: () => void } & Notify) {
  const [form, setForm] = useState<ModelInput>(
    model
      ? { vendor: model.vendor, tier: model.tier, label: model.label, apiModel: model.apiModel, priceInPerMTokUsd: model.priceInPerMTokUsd, priceOutPerMTokUsd: model.priceOutPerMTokUsd }
      : { vendor: companies[companies.length - 1]?.id ?? 'claude', tier: 2, label: '', apiModel: '', priceInPerMTokUsd: 1, priceOutPerMTokUsd: 4 },
  );
  const [options, setOptions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [advice, setAdvice] = useState<ModelAdvice | null>(null);
  const [advising, setAdvising] = useState(false);
  const [advisedFor, setAdvisedFor] = useState(model ? `${model.vendor}:${model.apiModel}` : '');
  const set = (patch: Partial<ModelInput>) => setForm((f) => ({ ...f, ...patch }));
  const company = companies.find((c) => c.id === form.vendor) ?? companies[0];
  const listId = `model-options-${model?.id ?? 'new'}`;

  const advise = async (raw = form.apiModel, force = false) => {
    const apiModel = raw.trim();
    const key = `${form.vendor}:${apiModel}`;
    if (!apiModel || advising || (!force && key === advisedFor)) return;
    setAdvisedFor(key);
    setAdvising(true);
    try {
      const result = await api.adviseModel(form.vendor, apiModel);
      setAdvice(result);
      setForm((f) => ({
        ...f,
        label: result.label,
        tier: result.tier,
        priceInPerMTokUsd: result.priceInPerMTokUsd,
        priceOutPerMTokUsd: result.priceOutPerMTokUsd,
      }));
    } catch (e) {
      onError(message(e));
    } finally {
      setAdvising(false);
    }
  };

  const load = async () => {
    setBusy(true);
    try {
      const { models } = await api.discoverModels({ companyId: form.vendor });
      setOptions(models);
      onNotice(tpl('{name}에서 모델 {n}개를 불러왔어요. API 모델 ID 칸에서 고를 수 있어요.', { name: company.name, n: models.length }));
    } catch (e) {
      onError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    try {
      if (model) await api.updateModel(model.id, form);
      else await api.createModel(form);
      onNotice(
        model
          ? tpl('{name} 정보를 저장했어요.', { name: form.label })
          : tpl('{name} 모델을 등록했어요. 직원 관리 탭에서 고를 수 있어요.', { name: form.label }),
      );
      onDone();
    } catch (e) {
      onError(message(e));
    }
  };

  return (
    <div className="model-form">
      <HatPreview hat={company.hat} color={company.color} tier={form.tier} />
      <div className="model-form-fields">
        <div className="row wrap">
          <label className="field grow">
            {t('회사 (모자)')}
            <select value={form.vendor} disabled={model?.builtin} onChange={(e) => set({ vendor: e.target.value })}>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {hatName(c.hat)}
                </option>
              ))}
            </select>
          </label>
          <label className="field grow">
            {t('등급 (장식)')}
            <select value={form.tier} onChange={(e) => set({ tier: Number(e.target.value) })}>
              {tierChoices(form.tier).map((tier) => (
                <option key={tier} value={tier}>
                  {tiersInUse().includes(tier) ? `${tierLabel(tier)} · ${tierHat(tier)}` : tpl('{n}등급 (새 등급)', { n: tier })}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row wrap">
          <label className="field grow">
            {t('화면에 보일 이름')}
            <input value={form.label} maxLength={MODEL_LABEL_MAX} placeholder={t('예: DeepSeek Chat')} onChange={(e) => set({ label: e.target.value })} />
          </label>
          <label className="field grow">
            <span className="row between">
              {t('API 모델 ID')}
              <button className="link-btn" type="button" disabled={busy} onClick={load}>
                {busy ? t('불러오는 중…') : t('목록 불러오기')}
              </button>
            </span>
            <input
              list={listId}
              value={form.apiModel}
              placeholder={t('예: deepseek-chat')}
              onChange={(e) => {
                set({ apiModel: e.target.value });
                if (!model && options.includes(e.target.value)) void advise(e.target.value);
              }}
              onBlur={() => !model && void advise()}
            />
            <datalist id={listId}>
              {options.map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>
          </label>
        </div>
        <div className="row wrap">
          <label className="field grow">
            {t('입력 단가 ($ / 100만 토큰)')}
            <input type="number" min={0} step="0.01" value={form.priceInPerMTokUsd} onChange={(e) => set({ priceInPerMTokUsd: Number(e.target.value) })} />
          </label>
          <label className="field grow">
            {t('출력 단가 ($ / 100만 토큰)')}
            <input type="number" min={0} step="0.01" value={form.priceOutPerMTokUsd} onChange={(e) => set({ priceOutPerMTokUsd: Number(e.target.value) })} />
          </label>
        </div>
        {advising && <p className="muted small">🤖 {tpl('{name}에 등급과 단가를 물어보는 중…', { name: company.name })}</p>}
        {advice && !advising && (
          <p className={`advice-note advice-${advice.source}`}>
            {advice.source === 'ai' ? `🤖 ${t('AI 추정')}` : advice.source === 'table' ? `📋 ${t('참고 가격표')}` : `🔮 ${t('이름으로 추정')}`} ·{' '}
            {advice.note}
            {advice.source === 'ai' &&
              advice.reference &&
              (advice.reference.priceInPerMTokUsd !== advice.priceInPerMTokUsd || advice.reference.priceOutPerMTokUsd !== advice.priceOutPerMTokUsd) && (
                <>
                  {' '}
                  {tpl('내장 참고값은 ${in} / ${out}예요.', {
                    in: advice.reference.priceInPerMTokUsd,
                    out: advice.reference.priceOutPerMTokUsd,
                  })}
                </>
              )}{' '}
            {t('값이 다르면 그대로 고쳐서 저장하세요.')}
          </p>
        )}
        <LinkRow
          links={companyLinks(company)
            .filter((l) => /가격|모델/.test(l.label))
            .map((l) => ({ ...l, label: linkLabel(l.label) }))}
          label={t('단가 확인')}
        />
        <div className="row end">
          <button className="pixel-btn small" type="button" disabled={advising || !form.apiModel.trim()} onClick={() => void advise(form.apiModel, true)}>
            {advising ? t('물어보는 중…') : `🤖 ${t('AI에게 물어 채우기')}`}
          </button>
          <button className="pixel-btn small" type="button" onClick={onDone}>
            {t('취소')}
          </button>
          <button className="pixel-btn small primary" type="button" disabled={!form.label.trim() || !form.apiModel.trim()} onClick={save}>
            {t('저장')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ModelsTab({ snapshot, onError, onNotice }: { snapshot: Snapshot } & Notify) {
  const { companies, models, agents } = snapshot;
  const [editCompany, setEditCompany] = useState<string | 'new' | null>(null);
  const [editModel, setEditModel] = useState<string | 'new' | null>(null);
  const usersOf = (modelId: string) => agents.filter((a) => a.model === modelId);
  const mode = snapshot.aiMode ?? 'env';
  const live = snapshot.provider === 'agents';
  const missingKeys = live
    ? companies.filter((c) => c.key?.source === 'none' && companyRequiresKey(c) && agents.some((a) => models.find((m) => m.id === a.model)?.vendor === c.id))
    : [];

  const changeMode = async (next: AiMode) => {
    try {
      await api.setAiMode(next);
      onNotice(t('AI 실행 방식을 바꿨어요. 다음 AI 호출부터 적용돼요.'));
    } catch (e) {
      onError(message(e));
    }
  };

  const removeCompany = async (c: Company) => {
    if (!window.confirm(tpl('{name} 회사와 그 회사 모델을 모두 지울까요? 등록한 API 키도 함께 지워져요.', { name: c.name }))) return;
    try {
      await api.deleteCompany(c.id);
      onNotice(tpl('{name}을(를) 지웠어요.', { name: c.name }));
    } catch (e) {
      onError(message(e));
    }
  };

  const removeModel = async (m: ModelEntry) => {
    if (!window.confirm(tpl('{name} 모델을 지울까요?', { name: m.label }))) return;
    try {
      await api.deleteModel(m.id);
      onNotice(tpl('{name}을(를) 지웠어요.', { name: m.label }));
    } catch (e) {
      onError(message(e));
    }
  };

  const modes: [AiMode, string, string][] = [
    [
      'env',
      tpl('.env 설정 따르기 (AI_PROVIDER={provider})', { provider: snapshot.envProvider ?? 'mock' }),
      t(PROVIDER_LABEL[snapshot.envProvider ?? 'mock'] ?? ''),
    ],
    ['mock', t('시뮬레이션'), t('API를 부르지 않아요. 비용은 모델 단가로 계산하고, 등급이 높을수록 검토 점수가 올라가요.')],
    ['agents', t('직원별 실제 AI'), t('직원마다 고른 모델의 회사 API로 호출해요. 회사마다 API 키가 필요해요.')],
  ];

  return (
    <div className="page">
      <h2>{t('모델 관리')}</h2>
      <p className="muted">
        {t('회사를 등록하면 ')}
        <b>{t('모자 모양과 색')}</b>
        {t('이 정해지고, 그 회사의 모델을 등록하면 ')}
        <b>{t('등급에 따라 장식')}</b>
        {t('이 붙어요. 등록한 모델은 직원 관리 탭에서 직원에게 고를 수 있어요.')}
      </p>

      <section className="pixel-box section">
        <h3>
          {t('AI 실행 방식')} · {t('지금')}: {t(PROVIDER_LABEL[snapshot.provider] ?? snapshot.provider)}
        </h3>
        <div className="mode-options">
          {modes.map(([id, label, note]) => (
            <label key={id} className={`mode-option ${mode === id ? 'selected' : ''}`}>
              <input type="radio" name="ai-mode" checked={mode === id} onChange={() => changeMode(id)} />
              <span>
                <b>{label}</b>
                <span className="muted small">{note}</span>
              </span>
            </label>
          ))}
        </div>
        {missingKeys.length > 0 && (
          <p className="warn-line">
            ⚠ {tpl('{names} 모델을 쓰는 직원이 있는데 API 키가 없어요. 아래에서 키를 등록해 주세요.', { names: missingKeys.map((c) => c.name).join(', ') })}
          </p>
        )}
      </section>

      {snapshot.aiTimeouts && (
        <section className="pixel-box section">
          <TimeoutForm timeouts={snapshot.aiTimeouts} onError={onError} onNotice={onNotice} />
        </section>
      )}

      <section className="pixel-box section">
        <div className="row between">
          <h3>{t('회사 · 모자 모양')}</h3>
          {editCompany !== 'new' && (
            <button className="pixel-btn small primary" onClick={() => setEditCompany('new')}>
              {`+ ${t('회사 등록')}`}
            </button>
          )}
        </div>
        <div className="company-grid">
          {editCompany === 'new' && (
            <div className="company-card editing">
              <CompanyForm company={null} companies={companies} onDone={() => setEditCompany(null)} onError={onError} onNotice={onNotice} />
            </div>
          )}
          {companies.map((c) =>
            editCompany === c.id ? (
              <div key={c.id} className="company-card editing">
                <CompanyForm company={c} companies={companies} onDone={() => setEditCompany(null)} onError={onError} onNotice={onNotice} />
              </div>
            ) : (
              <div key={c.id} className="company-card">
                <div className="company-hats">
                  {LOOKS.map((look) => (
                    <HatPreview key={look} hat={c.hat} color={c.color} look={look} title={t(TIER_LABEL[look])} />
                  ))}
                </div>
                <div className="company-name">
                  {c.name} {c.builtin && <span className="muted small">{t('기본')}</span>}
                </div>
                <div className="muted small">
                  {hatName(c.hat)} · {API_KINDS[c.api].name}
                </div>
                {c.api === 'openai_compatible' && <div className="muted small ellipsis">{c.baseUrl}</div>}
                <div className="row wrap">
                  <KeyBadge company={c} />
                  <span className="muted small">{tpl('모델 {n}개', { n: models.filter((m) => m.vendor === c.id).length })}</span>
                </div>
                <QuickKey company={c} onError={onError} onNotice={onNotice} />
                <LinkRow links={companyLinks(c).map((l) => ({ ...l, label: linkLabel(l.label) }))} label="" />
                <div className="row end">
                  {!c.builtin && (
                    <button className="pixel-btn small danger" onClick={() => removeCompany(c)}>
                      {t('삭제')}
                    </button>
                  )}
                  <button className="pixel-btn small" onClick={() => setEditCompany(c.id)}>
                    {t('편집 · 키')}
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      </section>

      <section className="pixel-box section">
        <div className="row between">
          <h3>{t('모델 · 등급')}</h3>
          {editModel !== 'new' && (
            <button className="pixel-btn small primary" onClick={() => setEditModel('new')}>
              {`+ ${t('모델 등록')}`}
            </button>
          )}
        </div>
        {editModel === 'new' && <ModelForm model={null} companies={companies} onDone={() => setEditModel(null)} onError={onError} onNotice={onNotice} />}
        {companies.map((c) => {
          const list = models.filter((m) => m.vendor === c.id).sort((a, b) => a.tier - b.tier);
          if (!list.length) return null;
          return (
            <div key={c.id} className="model-group">
              <div className="model-group-title">{c.name}</div>
              {list.map((m) =>
                editModel === m.id ? (
                  <ModelForm key={m.id} model={m} companies={companies} onDone={() => setEditModel(null)} onError={onError} onNotice={onNotice} />
                ) : (
                  <div key={m.id} className="model-row">
                    <HatPreview hat={c.hat} color={c.color} tier={m.tier} />
                    <div className="model-row-main">
                      <b>{m.label}</b> <span className="tier-chip">{tierLabel(m.tier)}</span>
                      <div className="muted small">
                        <code>{m.apiModel}</code> · ${m.priceInPerMTokUsd} / ${m.priceOutPerMTokUsd} {t('per 1M tok')}
                      </div>
                      {usersOf(m.id).length > 0 && <div className="small">👤 {usersOf(m.id).map((a) => a.name).join(', ')}</div>}
                    </div>
                    <div className="row">
                      {!m.builtin && (
                        <button className="pixel-btn small danger" onClick={() => removeModel(m)}>
                          {t('삭제')}
                        </button>
                      )}
                      <button className="pixel-btn small" onClick={() => setEditModel(m.id)}>
                        {t('편집')}
                      </button>
                    </div>
                  </div>
                ),
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
