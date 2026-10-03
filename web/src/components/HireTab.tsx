import { useState } from 'react';
import { allCompanies, allModels, HATS, TIER_HAT, TIER_LABEL, type Tier } from '../../../shared/models.ts';
import { SKINS } from '../../../shared/skins.ts';
import { TEAMS } from '../../../shared/teams.ts';
import type { Agent, Office, Skin } from '../../../shared/types.ts';
import { api } from '../api.ts';

function AgentEditor({
  agent,
  roleTitle,
  onError,
  onSaved,
}: { agent: Agent; roleTitle: string; onError: (m: string) => void; onSaved: (m: string) => void }) {
  const [name, setName] = useState(agent.name);
  const [model, setModel] = useState(agent.model);
  const [rules, setRules] = useState(agent.rules);
  const dirty = name !== agent.name || model !== agent.model || rules !== agent.rules;

  const changeSkin = async (skin: Skin) => {
    if (skin === agent.skin) return;
    try {
      await api.updateAgent(agent.id, { skin });
      onSaved(`${agent.name}의 스킨을 바꿨어요.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const save = async () => {
    try {
      await api.updateAgent(agent.id, { name, model, rules });
      onSaved(`${name} 정보를 저장했어요.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="hire-card pixel-box">
      <div className="hire-card-head">
        <span className={`role-chip role-${agent.role}`}>{roleTitle}</span>
      </div>
      <label className="field">
        이름
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        모델 (모자 모양 = 회사, 장식 = 등급)
        <select value={model} onChange={(e) => setModel(e.target.value)}>
          {allCompanies().map((company) => (
            <optgroup key={company.id} label={`${company.name} · ${HATS[company.hat].name}`}>
              {allModels().filter((m) => m.vendor === company.id).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · {TIER_LABEL[m.tier]} · ${m.priceInPerMTokUsd}/${m.priceOutPerMTokUsd} per 1M tok
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="field">
        개인 규칙
        <textarea rows={3} value={rules} onChange={(e) => setRules(e.target.value)} />
      </label>
      <div className="field">
        스킨 (누르면 바로 바뀌어요)
        <div className="skin-row">
          {SKINS.map((s) => (
            <button
              key={s.id}
              className={`skin-option ${agent.skin === s.id ? 'selected' : ''}`}
              type="button"
              title={s.credit ? `${s.note}\n출처: ${s.credit}` : s.note}
              onClick={() => changeSkin(s.id)}
            >
              <span className={`skin-preview skin-${s.id}`}>{s.id === 'pinkgirl' ? '' : s.preview}</span>
              {s.name}
            </button>
          ))}
        </div>
      </div>
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
  return (
    <div className="page">
      <h2>
        직원 고용 · {team.emoji} {team.name}
      </h2>
      <p className="muted">알파 버전은 사무실마다 4명이 고정이에요. 위의 사무실 탭을 바꾸면 다른 팀 직원을 볼 수 있어요. 이름, 모델, 규칙을 바꿀 수 있어요.</p>
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
            {([1, 2, 3] as Tier[]).map((t) => (
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
      <div className="hire-grid">
        {agents.map((agent) => (
          <AgentEditor key={agent.id} agent={agent} roleTitle={team.roleTitles[agent.role]} onError={onError} onSaved={onNotice} />
        ))}
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
