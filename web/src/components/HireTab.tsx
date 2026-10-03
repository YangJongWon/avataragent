import { useMemo, useState } from 'react';
import { allCompanies, allModels, companyOf, HATS, TIER_HAT, TIER_LABEL, modelOf, type Tier } from '../../../shared/models.ts';
import { SKINS } from '../../../shared/skins.ts';
import { MAX_STAFF_PER_OFFICE, TEAMS } from '../../../shared/teams.ts';
import type { Agent, Office, Role, Skin } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { CharacterPreview } from './CharacterPreview.tsx';
import { HatPreview } from './HatPreview.tsx';

const TIERS: Tier[] = [1, 2, 3];
const ROLE_ORDER: Role[] = ['manager', 'researcher', 'writer', 'reviewer'];

/** 후보 캐릭터를 하나씩 직접 고를 수 있게, 조합을 후보 목록으로 돌려준다. */
function buildCandidates(seed: string, salt: number) {
  const models = allModels();
  const skins = SKINS.map((s) => s.id);
  const pool: { skin: Skin; model: string }[] = [];
  for (const skinId of skins) {
    for (const entry of models) pool.push({ skin: skinId, model: entry.id });
  }
  const key = `${seed}#${salt}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = (h ^ key.charCodeAt(i)) * 16777619 >>> 0;
  const picked: { skin: Skin; model: string }[] = [];
  const seen = new Set<string>();
  let i = 0;
  while (picked.length < 6 && i < pool.length) {
    const item = pool[(h + i * 7) % pool.length];
    const id = `${item.skin}:${item.model}`;
    if (!seen.has(id)) {
      seen.add(id);
      picked.push(item);
    }
    i++;
  }
  return picked;
}

function AgentEditor({
  agent,
  roleTitle,
  onError,
  onSaved,
}: { agent: Agent; roleTitle: string; onError: (m: string) => void; onSaved: (m: string) => void }) {
  const [name, setName] = useState(agent.name);
  const [model, setModel] = useState(agent.model);
  const [rules, setRules] = useState(agent.rules);
  const [skin, setSkin] = useState(agent.skin);
  const [roll, setRoll] = useState(0);
  const dirty = name !== agent.name || model !== agent.model || rules !== agent.rules || skin !== agent.skin;

  const candidates = useMemo(() => buildCandidates(agent.id, roll), [agent.id, roll]);

  const save = async () => {
    try {
      await api.updateAgent(agent.id, { name, model, rules, skin });
      onSaved(`${name} 정보를 저장했어요.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="hire-card pixel-box">
      <div className="hire-card-head">
        <span className={`role-chip role-${agent.role}`}>{roleTitle}</span>
        <span className="muted small">{agent.tasksDone}건 완료</span>
      </div>

      <div className="hire-stage">
        <CharacterPreview role={agent.role} skin={skin} modelId={model} expression="smile" />
        <div className="hire-stage-info">
          <div className="hire-stage-name">{name || '이름 없음'}</div>
          <div className="muted small">
            {modelOf(model).label} · {TIER_LABEL[modelOf(model).tier]} · {companyOf(modelOf(model).vendor).name}
          </div>
          <div className="muted small">{SKINS.find((s) => s.id === skin)?.name}</div>
        </div>
      </div>

      <div className="field">
        <b>1. 외형 고르기</b>
        <div className="skin-row">
          {SKINS.map((s) => (
            <button
              key={s.id}
              className={`skin-option skin-option-art ${skin === s.id ? 'selected' : ''}`}
              type="button"
              title={s.credit ? `${s.note}\n출처: ${s.credit}` : s.note}
              onClick={() => setSkin(s.id)}
            >
              <CharacterPreview role={agent.role} skin={s.id} modelId={model} expression="normal" />
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <b>2. 모델 고르기</b>
        <div className="muted small">모자 모양 = AI 회사, 장식 = 등급</div>
        {allCompanies().map((company) => {
          const list = allModels().filter((m) => m.vendor === company.id).sort((a, b) => a.tier - b.tier);
          if (!list.length) return null;
          return (
            <div key={company.id} className="model-pick-group">
              <div className="model-pick-title">
                {company.name} · {HATS[company.hat].name}
              </div>
              <div className="model-pick-row">
                {list.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`model-pick ${model === m.id ? 'selected' : ''}`}
                    onClick={() => setModel(m.id)}
                  >
                    <HatPreview hat={company.hat} color={company.color} tier={m.tier} />
                    <span className="model-pick-label">{m.label}</span>
                    <span className="muted small">${m.priceInPerMTokUsd}/${m.priceOutPerMTokUsd}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="field">
        <b>3. 후보 캐릭터 고르기</b>
        <div className="muted small">마음에 드는 캐릭터를 눌러 바로 적용하세요.</div>
        <div className="cand-row">
          {candidates.map((c) => (
            <button
              key={`${c.skin}:${c.model}`}
              type="button"
              className={`cand ${skin === c.skin && model === c.model ? 'selected' : ''}`}
              title={`${SKINS.find((s) => s.id === c.skin)?.name} · ${modelOf(c.model).label}`}
              onClick={() => {
                setSkin(c.skin);
                setModel(c.model);
              }}
            >
              <CharacterPreview role={agent.role} skin={c.skin} modelId={c.model} expression="smile" />
            </button>
          ))}
          <button type="button" className="pixel-btn small cand-reroll" onClick={() => setRoll((r) => r + 1)}>
            후보 새로 뽑기
          </button>
        </div>
      </div>

      <label className="field">
        <b>이름</b>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
      </label>
      <label className="field">
        개인 규칙
        <textarea rows={3} value={rules} onChange={(e) => setRules(e.target.value)} />
      </label>
      <div className="row end">
        <button className="pixel-btn primary" disabled={!dirty} onClick={save}>
          저장
        </button>
      </div>
    </div>
  );
}

export function HireTab({
  office,
  agents,
  onError,
  onNotice,
  onManageModels,
}: { office: Office; agents: Agent[]; onError: (m: string) => void; onNotice: (m: string) => void; onManageModels: () => void }) {
  const team = TEAMS[office.team];
  const [selectedId, setSelectedId] = useState<string | null>(agents[0]?.id ?? null);
  const [hireRole, setHireRole] = useState<Role>('researcher');
  const [hireName, setHireName] = useState('');
  const [busy, setBusy] = useState(false);
  const selected = agents.find((a) => a.id === selectedId) ?? agents[0];
  const full = agents.length >= MAX_STAFF_PER_OFFICE;
  const lastOfRole = (agent: Agent) => !agents.some((a) => a.id !== agent.id && a.role === agent.role);

  const hire = async () => {
    setBusy(true);
    try {
      const agent = await api.hireAgent(office.id, { role: hireRole, name: hireName.trim() || undefined });
      setHireName('');
      setSelectedId(agent.id);
      onNotice(`${agent.name} 님을 ${team.roleTitles[hireRole]}(으)로 고용했어요. 아래에서 외형과 모델을 골라 주세요.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const fire = async (agent: Agent) => {
    if (!confirm(`${agent.name} 님을 내보낼까요?\n대기 중인 업무에서 맡은 단계는 같은 역할의 다른 직원에게 넘어가요.`)) return;
    try {
      await api.fireAgent(agent.id);
      if (selectedId === agent.id) setSelectedId(null);
      onNotice(`${agent.name} 님이 퇴사했어요.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="page">
      <h2>
        직원 관리 · {team.emoji} {team.name}
      </h2>
      <p className="muted">
        지금 일하는 직원을 고르면 외형·모델·이름·규칙을 바꿀 수 있어요. 새 직원을 고용하거나 내보낼 수도 있어요. (사무실당 최대 {MAX_STAFF_PER_OFFICE}명)
      </p>

      <div className="staff-list pixel-box">
        <b>
          현재 직원 {agents.length}명
        </b>
        {agents.map((agent) => (
          <div key={agent.id} className={`staff-row ${selected?.id === agent.id ? 'selected' : ''}`}>
            <button type="button" className="staff-pick" onClick={() => setSelectedId(agent.id)}>
              <span className={`role-chip role-${agent.role}`}>{team.roleTitles[agent.role]}</span>
              <b>{agent.name}</b>
              <span className="muted small">
                {modelOf(agent.model).label} · {agent.tasksDone}건 완료
              </span>
            </button>
            <button type="button" className="pixel-btn small" onClick={() => setSelectedId(agent.id)}>
              변경
            </button>
            <button
              type="button"
              className="pixel-btn small danger"
              disabled={lastOfRole(agent)}
              title={lastOfRole(agent) ? '이 역할의 마지막 직원은 내보낼 수 없어요.' : undefined}
              onClick={() => fire(agent)}
            >
              내보내기
            </button>
          </div>
        ))}
      </div>

      <div className="staff-hire pixel-box">
        <b>직원 고용</b>
        <div className="row">
          <label className="field">
            역할
            <select value={hireRole} onChange={(e) => setHireRole(e.target.value as Role)}>
              {ROLE_ORDER.map((r) => (
                <option key={r} value={r}>
                  {team.roleTitles[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            이름 (비우면 자동)
            <input value={hireName} onChange={(e) => setHireName(e.target.value)} maxLength={20} placeholder="예: 서연" />
          </label>
          <button type="button" className="pixel-btn primary" disabled={busy || full} onClick={hire}>
            {full ? '자리가 꽉 찼어요' : '고용하기'}
          </button>
        </div>
        <p className="muted small">같은 역할 직원이 여럿이면 업무 흐름을 짤 때 단계마다 담당자를 고를 수 있어요.</p>
      </div>

      {selected && (
        <AgentEditor
          key={selected.id}
          agent={selected}
          roleTitle={team.roleTitles[selected.role]}
          onError={onError}
          onSaved={onNotice}
        />
      )}

      <div className="hat-legend pixel-box">
        <div>
          <b>모자 모양 = AI 회사</b>
          <ul>
            {allCompanies().map((c) => (
              <li key={c.id}>
                {c.name}: {HATS[c.hat].name}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <b>장식 = 모델 등급</b>
          <ul>
            {TIERS.map((t) => (
              <li key={t}>
                {TIER_LABEL[t]}: {TIER_HAT[t]}
              </li>
            ))}
          </ul>
        </div>
        <p className="muted">
          "직원별 실제 AI" 방식이면 직원마다 자기 모델 회사의 API로 호출해요. 시뮬레이션에서는 모델 가격으로 비용을 계산하고, 등급이 높을수록 검토 점수가
          올라가요.{' '}
          <button className="link-btn" type="button" onClick={onManageModels}>
            모델·API 키 등록하러 가기 →
          </button>
        </p>
      </div>
      <p className="muted small">
        스킨 출처:{' '}
        {SKINS.filter((s) => s.credit).map((s) => (
          <span key={s.id}>
            {s.name} — {s.credit}{' '}
          </span>
        ))}
      </p>
    </div>
  );
}