import { useState } from 'react';
import {
  API_KINDS,
  COMPATIBLE_SERVICES,
  HATS,
  companyLinks,
  TIER_HAT,
  TIER_LABEL,
  type ApiKind,
  type Company,
  type HatShape,
  type ModelEntry,
  type Tier,
} from '../../../shared/models.ts';
import type { AiMode, Snapshot } from '../../../shared/types.ts';
import { api, type CompanyInput, type ModelInput } from '../api.ts';
import { HatPreview } from './HatPreview.tsx';
import { LinkRow } from './LinkRow.tsx';

type Notify = { onError: (m: string) => void; onNotice: (m: string) => void };

const TIERS: Tier[] = [1, 2, 3];
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const PROVIDER_LABEL: Record<string, string> = {
  mock: '시뮬레이션',
  agents: '직원별 실제 AI',
  openai: 'OpenAI 하나로 호출',
  anthropic: 'Anthropic 하나로 호출',
  gemini: 'Gemini 하나로 호출',
  xai: 'xAI 하나로 호출',
};

function KeyBadge({ company }: { company: Company }) {
  const key = company.key ?? { source: 'none', hint: '' };
  if (key.source === 'saved') return <span className="key-badge ok">🔑 등록됨 {key.hint}</span>;
  if (key.source === 'env') return <span className="key-badge ok">🔑 .env {key.hint}</span>;
  if (company.api === 'openai_compatible') return <span className="key-badge">키 없음 (필요 없으면 괜찮아요)</span>;
  return <span className="key-badge warn">키 없음</span>;
}

function QuickKey({ company, onError, onNotice }: { company: Company } & Notify) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.updateCompany(company.id, { apiKey: key.trim() });
      setKey('');
      onNotice(`${company.name} API 키를 저장했어요.`);
      try {
        const { models } = await api.discoverModels({ companyId: company.id });
        onNotice(`${company.name} 연결 확인: 쓸 수 있는 모델 ${models.length}개`);
      } catch (e) {
        onError(`키는 저장했지만 연결 확인에 실패했어요: ${message(e)}`);
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
        aria-label={`${company.name} API 키`}
        placeholder={company.key?.source && company.key.source !== 'none' ? 'API 키 바꾸기' : 'API 키 입력'}
        onChange={(e) => setKey(e.target.value)}
      />
      <button className="pixel-btn small primary" type="submit" disabled={busy || !key.trim()}>
        {busy ? '저장 중…' : '키 저장'}
      </button>
    </form>
  );
}

function CompanyForm({ company, onDone, onError, onNotice }: { company: Company | null; onDone: () => void } & Notify) {
  const [form, setForm] = useState<CompanyInput>(
    company
      ? { name: company.name, hat: company.hat, color: company.color, api: company.api, baseUrl: company.baseUrl }
      : { name: '', hat: 'beret', color: HATS.beret.color, api: 'openai_compatible', baseUrl: '' },
  );
  const [apiKey, setApiKey] = useState('');
  const [found, setFound] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<CompanyInput>) => setForm((f) => ({ ...f, ...patch }));
  const savedKey = company?.key?.source === 'saved';

  const test = async () => {
    setBusy(true);
    try {
      const { models } = await api.discoverModels({ companyId: company?.id, api: form.api, baseUrl: form.baseUrl, apiKey: apiKey || undefined });
      setFound(models);
      onNotice(`연결됐어요. 쓸 수 있는 모델 ${models.length}개를 확인했어요.`);
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
      onNotice(company ? `${form.name} 정보를 저장했어요.` : `${form.name} 회사를 등록했어요. 이제 모델을 등록해 주세요.`);
      onDone();
    } catch (e) {
      onError(message(e));
    }
  };

  const removeKey = async () => {
    if (!company || !window.confirm(`${company.name}에 등록한 API 키를 지울까요?`)) return;
    try {
      await api.updateCompany(company.id, { apiKey: null });
      onNotice('API 키를 지웠어요.');
    } catch (e) {
      onError(message(e));
    }
  };

  return (
    <div className="company-form">
      <div className="company-form-preview">
        {TIERS.map((t) => (
          <HatPreview key={t} hat={form.hat} color={form.color} tier={t} title={TIER_LABEL[t]} />
        ))}
      </div>
      {!company && (
        <div className="row wrap link-row">
          <span className="muted small">빠른 채우기</span>
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
        회사 이름
        <input value={form.name} maxLength={20} placeholder="예: DeepSeek" onChange={(e) => set({ name: e.target.value })} />
      </label>
      <div className="row wrap">
        <label className="field grow">
          모자 모양
          <select value={form.hat} onChange={(e) => set({ hat: e.target.value as HatShape })}>
            {(Object.keys(HATS) as HatShape[]).map((h) => (
              <option key={h} value={h}>
                {HATS[h].name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          모자 색
          <input type="color" value={form.color} onChange={(e) => set({ color: e.target.value })} />
        </label>
      </div>
      <label className="field">
        API 종류
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
          API 주소 (Base URL)
          <input
            value={form.baseUrl}
            placeholder="예: https://api.deepseek.com/v1 · http://localhost:11434/v1"
            onChange={(e) => set({ baseUrl: e.target.value })}
          />
        </label>
      )}
      <label className="field">
        API 키 {company && <KeyBadge company={company} />}
        <input
          type="password"
          autoComplete="off"
          value={apiKey}
          placeholder={company?.key?.source && company.key.source !== 'none' ? '바꿀 때만 입력' : 'sk-…'}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </label>
      <LinkRow links={companyLinks(form)} />
      <p className="muted small">
        키는 이 서버의 data 폴더에만 저장되고 화면으로는 다시 보내지 않아요.
        {API_KINDS[form.api].env && ` 비워 두면 .env의 ${API_KINDS[form.api].env}를 써요.`}
      </p>
      {found && (
        <details className="found-models">
          <summary>확인된 모델 {found.length}개</summary>
          <p className="small">{found.join(', ') || '목록이 비어 있어요.'}</p>
        </details>
      )}
      <div className="row end wrap">
        {savedKey && (
          <button className="pixel-btn small danger" type="button" onClick={removeKey}>
            키 삭제
          </button>
        )}
        <button className="pixel-btn small" type="button" disabled={busy} onClick={test}>
          {busy ? '확인 중…' : '🔌 연결 확인'}
        </button>
        <button className="pixel-btn small" type="button" onClick={onDone}>
          취소
        </button>
        <button className="pixel-btn small primary" type="button" disabled={!form.name.trim()} onClick={save}>
          저장
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
  const set = (patch: Partial<ModelInput>) => setForm((f) => ({ ...f, ...patch }));
  const company = companies.find((c) => c.id === form.vendor) ?? companies[0];
  const listId = `model-options-${model?.id ?? 'new'}`;

  const load = async () => {
    setBusy(true);
    try {
      const { models } = await api.discoverModels({ companyId: form.vendor });
      setOptions(models);
      onNotice(`${company.name}에서 모델 ${models.length}개를 불러왔어요. API 모델 ID 칸에서 고를 수 있어요.`);
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
      onNotice(model ? `${form.label} 정보를 저장했어요.` : `${form.label} 모델을 등록했어요. 직원 관리 탭에서 고를 수 있어요.`);
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
            회사 (모자)
            <select value={form.vendor} disabled={model?.builtin} onChange={(e) => set({ vendor: e.target.value })}>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {HATS[c.hat].name}
                </option>
              ))}
            </select>
          </label>
          <label className="field grow">
            등급 (장식)
            <select value={form.tier} onChange={(e) => set({ tier: Number(e.target.value) as Tier })}>
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {TIER_LABEL[t]} · {TIER_HAT[t]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row wrap">
          <label className="field grow">
            화면에 보일 이름
            <input value={form.label} maxLength={30} placeholder="예: DeepSeek Chat" onChange={(e) => set({ label: e.target.value })} />
          </label>
          <label className="field grow">
            <span className="row between">
              API 모델 ID
              <button className="link-btn" type="button" disabled={busy} onClick={load}>
                {busy ? '불러오는 중…' : '목록 불러오기'}
              </button>
            </span>
            <input list={listId} value={form.apiModel} placeholder="예: deepseek-chat" onChange={(e) => set({ apiModel: e.target.value })} />
            <datalist id={listId}>
              {options.map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>
          </label>
        </div>
        <div className="row wrap">
          <label className="field grow">
            입력 단가 ($ / 100만 토큰)
            <input type="number" min={0} step="0.01" value={form.priceInPerMTokUsd} onChange={(e) => set({ priceInPerMTokUsd: Number(e.target.value) })} />
          </label>
          <label className="field grow">
            출력 단가 ($ / 100만 토큰)
            <input type="number" min={0} step="0.01" value={form.priceOutPerMTokUsd} onChange={(e) => set({ priceOutPerMTokUsd: Number(e.target.value) })} />
          </label>
        </div>
        <div className="row end">
          <button className="pixel-btn small" type="button" onClick={onDone}>
            취소
          </button>
          <button className="pixel-btn small primary" type="button" disabled={!form.label.trim() || !form.apiModel.trim()} onClick={save}>
            저장
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
    ? companies.filter((c) => c.key?.source === 'none' && c.api !== 'openai_compatible' && agents.some((a) => models.find((m) => m.id === a.model)?.vendor === c.id))
    : [];

  const changeMode = async (next: AiMode) => {
    try {
      await api.setAiMode(next);
      onNotice('AI 실행 방식을 바꿨어요. 다음 AI 호출부터 적용돼요.');
    } catch (e) {
      onError(message(e));
    }
  };

  const removeCompany = async (c: Company) => {
    if (!window.confirm(`${c.name} 회사와 그 회사 모델을 모두 지울까요? 등록한 API 키도 함께 지워져요.`)) return;
    try {
      await api.deleteCompany(c.id);
      onNotice(`${c.name}을(를) 지웠어요.`);
    } catch (e) {
      onError(message(e));
    }
  };

  const removeModel = async (m: ModelEntry) => {
    if (!window.confirm(`${m.label} 모델을 지울까요?`)) return;
    try {
      await api.deleteModel(m.id);
      onNotice(`${m.label}을(를) 지웠어요.`);
    } catch (e) {
      onError(message(e));
    }
  };

  const modes: [AiMode, string, string][] = [
    ['env', `.env 설정 따르기 (AI_PROVIDER=${snapshot.envProvider ?? 'mock'})`, PROVIDER_LABEL[snapshot.envProvider ?? 'mock'] ?? ''],
    ['mock', '시뮬레이션', 'API를 부르지 않아요. 비용은 모델 단가로 계산하고, 등급이 높을수록 검토 점수가 올라가요.'],
    ['agents', '직원별 실제 AI', '직원마다 고른 모델의 회사 API로 호출해요. 회사마다 API 키가 필요해요.'],
  ];

  return (
    <div className="page">
      <h2>모델 관리</h2>
      <p className="muted">
        회사를 등록하면 <b>모자 모양과 색</b>이 정해지고, 그 회사의 모델을 등록하면 <b>등급에 따라 장식</b>이 붙어요. 등록한 모델은 직원 관리
        탭에서 직원에게 고를 수 있어요.
      </p>

      <section className="pixel-box section">
        <h3>AI 실행 방식 · 지금: {PROVIDER_LABEL[snapshot.provider] ?? snapshot.provider}</h3>
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
          <p className="warn-line">⚠ {missingKeys.map((c) => c.name).join(', ')} 모델을 쓰는 직원이 있는데 API 키가 없어요. 아래에서 키를 등록해 주세요.</p>
        )}
      </section>

      <section className="pixel-box section">
        <div className="row between">
          <h3>회사 · 모자 모양</h3>
          {editCompany !== 'new' && (
            <button className="pixel-btn small primary" onClick={() => setEditCompany('new')}>
              + 회사 등록
            </button>
          )}
        </div>
        <div className="company-grid">
          {editCompany === 'new' && (
            <div className="company-card editing">
              <CompanyForm company={null} onDone={() => setEditCompany(null)} onError={onError} onNotice={onNotice} />
            </div>
          )}
          {companies.map((c) =>
            editCompany === c.id ? (
              <div key={c.id} className="company-card editing">
                <CompanyForm company={c} onDone={() => setEditCompany(null)} onError={onError} onNotice={onNotice} />
              </div>
            ) : (
              <div key={c.id} className="company-card">
                <div className="company-hats">
                  {TIERS.map((t) => (
                    <HatPreview key={t} hat={c.hat} color={c.color} tier={t} title={TIER_LABEL[t]} />
                  ))}
                </div>
                <div className="company-name">
                  {c.name} {c.builtin && <span className="muted small">기본</span>}
                </div>
                <div className="muted small">
                  {HATS[c.hat].name} · {API_KINDS[c.api].name}
                </div>
                {c.api === 'openai_compatible' && <div className="muted small ellipsis">{c.baseUrl}</div>}
                <div className="row wrap">
                  <KeyBadge company={c} />
                  <span className="muted small">모델 {models.filter((m) => m.vendor === c.id).length}개</span>
                </div>
                <QuickKey company={c} onError={onError} onNotice={onNotice} />
                <LinkRow links={companyLinks(c)} label="" />
                <div className="row end">
                  {!c.builtin && (
                    <button className="pixel-btn small danger" onClick={() => removeCompany(c)}>
                      삭제
                    </button>
                  )}
                  <button className="pixel-btn small" onClick={() => setEditCompany(c.id)}>
                    편집 · 키
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      </section>

      <section className="pixel-box section">
        <div className="row between">
          <h3>모델 · 등급</h3>
          {editModel !== 'new' && (
            <button className="pixel-btn small primary" onClick={() => setEditModel('new')}>
              + 모델 등록
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
                      <b>{m.label}</b> <span className="tier-chip">{TIER_LABEL[m.tier]}</span>
                      <div className="muted small">
                        <code>{m.apiModel}</code> · ${m.priceInPerMTokUsd} / ${m.priceOutPerMTokUsd} per 1M tok
                      </div>
                      {usersOf(m.id).length > 0 && <div className="small">👤 {usersOf(m.id).map((a) => a.name).join(', ')}</div>}
                    </div>
                    <div className="row">
                      {!m.builtin && (
                        <button className="pixel-btn small danger" onClick={() => removeModel(m)}>
                          삭제
                        </button>
                      )}
                      <button className="pixel-btn small" onClick={() => setEditModel(m.id)}>
                        편집
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
