import { useMemo, useState } from 'react';
import { t, tpl } from '../../../shared/i18n.ts';
import { allCompanies, allModels, companyOf, hatName, HATS, modelOf, tierHat, tierLabel, type Tier } from '../../../shared/models.ts';
import { PERSONALITIES, personalityDescription, personalityLabel } from '../../../shared/personality.ts';
import { builtinSkin, SKINS, skinName, skinNote } from '../../../shared/skins.ts';
import { MAX_STAFF_PER_OFFICE, TEAMS } from '../../../shared/teams.ts';
import { packSkin, splitPackSkin, type ThemeManifest } from '../../../shared/theme-pack.ts';
import type { Agent, AgentSkin, Office, Role, Skin } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { useThemeManifest } from '../useThemePack.ts';
import { CharacterPreview } from './CharacterPreview.tsx';
import { HatPreview } from './HatPreview.tsx';
import { PackCharacterPreview } from './PackCharacterPreview.tsx';

/** The theme character a skin points at, when it belongs to the office's theme. */
const packCharacterOf = (skin: AgentSkin, theme: ThemeManifest | null) => {
  const pack = splitPackSkin(skin);
  return pack && theme?.id === pack.themeId ? (theme.characters.find((c) => c.id === pack.characterId) ?? null) : null;
};

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
  themeId,
  onError,
  onSaved,
}: { agent: Agent; roleTitle: string; themeId?: string; onError: (m: string) => void; onSaved: (m: string) => void }) {
  const theme = useThemeManifest(themeId);
  const [name, setName] = useState(agent.name);
  const [model, setModel] = useState(agent.model);
  const [rules, setRules] = useState(agent.rules);
  const [skin, setSkin] = useState(agent.skin);
  const [personality, setPersonality] = useState(agent.personality);
  const [roll, setRoll] = useState(0);
  const dirty = name !== agent.name || model !== agent.model || rules !== agent.rules || skin !== agent.skin || personality !== agent.personality;

  const candidates = useMemo(() => buildCandidates(agent.id, roll), [agent.id, roll]);
  const ownCharacter = packCharacterOf(skin, theme);

  const save = async () => {
    try {
      await api.updateAgent(agent.id, { name, model, rules, skin, personality });
      onSaved(tpl('{name} 정보를 저장했어요.', { name }));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="hire-card pixel-box">
      <div className="hire-card-head">
        <span className={`role-chip role-${agent.role}`}>{roleTitle}</span>
        <span className="muted small">{tpl('{n}건 완료', { n: agent.tasksDone })}</span>
      </div>

      <div className="hire-stage">
        {theme && ownCharacter ? (
          <PackCharacterPreview themeId={theme.id} character={ownCharacter} />
        ) : (
          <CharacterPreview role={agent.role} skin={builtinSkin(skin)} modelId={model} expression="smile" />
        )}
        <div className="hire-stage-info">
          <div className="hire-stage-name">{name || t('이름 없음')}</div>
          <div className="muted small">
            {modelOf(model).label} · {tierLabel(modelOf(model).tier)} · {companyOf(modelOf(model).vendor).name}
          </div>
          <div className="muted small">{ownCharacter ? `${ownCharacter.name} · ${theme?.name}` : skinName(skin)}</div>
          <div className="muted small">
            {PERSONALITIES.find((p) => p.id === personality)?.emoji} {personalityLabel(personality)}
          </div>
        </div>
      </div>

      <div className="field">
        <b>{t('1. 외형 고르기')}</b>
        <div className="skin-row">
          {SKINS.map((s) => (
            <button
              key={s.id}
              className={`skin-option skin-option-art ${skin === s.id ? 'selected' : ''}`}
              type="button"
              title={s.credit ? `${skinNote(s.id)}\n${t('출처')}: ${s.credit}` : skinNote(s.id)}
              onClick={() => setSkin(s.id)}
            >
              <CharacterPreview role={agent.role} skin={s.id} modelId={model} expression="normal" />
              {skinName(s.id)}
            </button>
          ))}
          {theme?.characters.map((c) => {
            const id = packSkin(theme.id, c.id);
            return (
              <button
                key={id}
                className={`skin-option skin-option-art ${skin === id ? 'selected' : ''}`}
                type="button"
                title={`${theme.name} · ${theme.author} · ${theme.license}`}
                onClick={() => setSkin(id)}
              >
                <PackCharacterPreview themeId={theme.id} character={c} />
                {c.name}
              </button>
            );
          })}
        </div>
        {theme && <div className="muted small">{tpl('{theme} 테마의 캐릭터는 이 테마를 쓰는 사무실에서 보여요. 다른 사무실에서는 기본 픽셀로 보여요.', { theme: theme.name })}</div>}
      </div>

      <div className="field">
        <b>{t('2. 모델 고르기')}</b>
        <div className="muted small">{t('모자 모양 = AI 회사, 장식 = 등급')}</div>
        {allCompanies().map((company) => {
          const list = allModels().filter((m) => m.vendor === company.id).sort((a, b) => a.tier - b.tier);
          if (!list.length) return null;
          return (
            <div key={company.id} className="model-pick-group">
              <div className="model-pick-title">
                {company.name} · {hatName(company.hat)}
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
        <b>{t('3. 후보 캐릭터 고르기')}</b>
        <div className="muted small">{t('마음에 드는 캐릭터를 눌러 바로 적용하세요.')}</div>
        <div className="cand-row">
          {candidates.map((c) => (
            <button
              key={`${c.skin}:${c.model}`}
              type="button"
              className={`cand ${skin === c.skin && model === c.model ? 'selected' : ''}`}
              title={`${skinName(c.skin)} · ${modelOf(c.model).label}`}
              onClick={() => {
                setSkin(c.skin);
                setModel(c.model);
              }}
            >
              <CharacterPreview role={agent.role} skin={c.skin} modelId={c.model} expression="smile" />
            </button>
          ))}
          <button type="button" className="pixel-btn small cand-reroll" onClick={() => setRoll((r) => r + 1)}>
            {t('후보 새로 뽑기')}
          </button>
        </div>
      </div>

      <div className="field">
        <b>{t('4. 성격 · 일하는 스타일')}</b>
        <div className="muted small">{t('지시를 어떤 방식으로 수행할지 정해요. 실제 AI에게는 매번 이 스타일이 함께 전달돼요.')}</div>
        <div className="personality-row">
          {PERSONALITIES.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`personality-option ${personality === p.id ? 'selected' : ''}`}
              title={personalityDescription(p.id)}
              onClick={() => setPersonality(p.id)}
            >
              <span className="personality-emoji">{p.emoji}</span>
              <b>{personalityLabel(p.id)}</b>
              <span className="muted small">{personalityDescription(p.id)}</span>
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <b>{t('이름')}</b>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
      </label>
      <label className="field">
        {t('개인 규칙')}
        <textarea rows={3} value={rules} onChange={(e) => setRules(e.target.value)} />
      </label>
      <div className="row end">
        <button className="pixel-btn primary" disabled={!dirty} onClick={save}>
          {t('저장')}
        </button>
      </div>
    </div>
  );
}

export function HireTab({
  office,
  themeId,
  agents,
  onError,
  onNotice,
  onManageModels,
}: { office: Office; themeId: string; agents: Agent[]; onError: (m: string) => void; onNotice: (m: string) => void; onManageModels: () => void }) {
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
      onNotice(tpl('{name}을 {role}(으)로 고용했어요. 아래에서 외형과 모델을 골라 주세요.', { name: agent.name, role: t(team.roleTitles[hireRole]) }));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const fire = async (agent: Agent) => {
    const ok = confirm(`${tpl('{name}을 내보낼까요?', { name: agent.name })}\n${t('대기 중인 업무에서 맡은 단계는 같은 역할의 다른 직원에게 넘어가요.')}`);
    if (!ok) return;
    try {
      await api.fireAgent(agent.id);
      if (selectedId === agent.id) setSelectedId(null);
      onNotice(tpl('{name}이 퇴사했어요.', { name: agent.name }));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="page">
      <h2>
        {t('직원 관리')} · {team.emoji} {team.name}
      </h2>
      <p className="muted">
        {tpl('지금 일하는 직원을 고르면 외형·모델·이름·규칙을 바꿀 수 있어요. 새 직원을 고용하거나 내보낼 수도 있어요. (사무실당 최대 {n}명)', {
          n: MAX_STAFF_PER_OFFICE,
        })}
      </p>

      <div className="staff-list pixel-box">
        <b>{tpl('현재 직원 {n}명', { n: agents.length })}</b>
        {agents.map((agent) => (
          <div key={agent.id} className={`staff-row ${selected?.id === agent.id ? 'selected' : ''}`}>
            <button type="button" className="staff-pick" onClick={() => setSelectedId(agent.id)}>
              <span className={`role-chip role-${agent.role}`}>{t(team.roleTitles[agent.role])}</span>
              <b>{agent.name}</b>
              <span className="muted small">
                {modelOf(agent.model).label} · {tpl('{n}건 완료', { n: agent.tasksDone })}
              </span>
            </button>
            <button type="button" className="pixel-btn small" onClick={() => setSelectedId(agent.id)}>
              {t('변경')}
            </button>
            <button
              type="button"
              className="pixel-btn small danger"
              disabled={lastOfRole(agent)}
              title={lastOfRole(agent) ? t('이 역할의 마지막 직원은 내보낼 수 없어요.') : undefined}
              onClick={() => fire(agent)}
            >
              {t('내보내기')}
            </button>
          </div>
        ))}
      </div>

      <div className="staff-hire pixel-box">
        <b>{t('직원 고용')}</b>
        <div className="row">
          <label className="field">
            {t('역할')}
            <select value={hireRole} onChange={(e) => setHireRole(e.target.value as Role)}>
              {ROLE_ORDER.map((r) => (
                <option key={r} value={r}>
                  {t(team.roleTitles[r])}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t('이름 (비우면 자동)')}
            <input value={hireName} onChange={(e) => setHireName(e.target.value)} maxLength={20} placeholder={t('예: 서연')} />
          </label>
          <button type="button" className="pixel-btn primary" disabled={busy || full} onClick={hire}>
            {full ? t('자리가 꽉 찼어요') : t('고용하기')}
          </button>
        </div>
        <p className="muted small">{t('같은 역할 직원이 여럿이면 업무 흐름을 짤 때 단계마다 담당자를 고를 수 있어요.')}</p>
      </div>

      {selected && (
        <AgentEditor
          key={selected.id}
          agent={selected}
          roleTitle={t(team.roleTitles[selected.role])}
          themeId={themeId}
          onError={onError}
          onSaved={onNotice}
        />
      )}

      <div className="hat-legend pixel-box">
        <div>
          <b>{t('모자 모양 = AI 회사')}</b>
          <ul>
            {allCompanies().map((c) => (
              <li key={c.id}>
                {c.name}: {hatName(c.hat)}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <b>{t('장식 = 모델 등급')}</b>
          <ul>
            {TIERS.map((tier) => (
              <li key={tier}>
                {tierLabel(tier)}: {tierHat(tier)}
              </li>
            ))}
          </ul>
        </div>
        <p className="muted">
          {t('"직원별 실제 AI" 방식이면 직원마다 자기 모델 회사의 API로 호출해요. 시뮬레이션에서는 모델 가격으로 비용을 계산하고, 등급이 높을수록 검토 점수가 올라가요.')}{' '}
          <button className="link-btn" type="button" onClick={onManageModels}>
            {t('모델·API 키 등록하러 가기 →')}
          </button>
        </p>
      </div>
      <p className="muted small">
        {t('스킨 출처')}:{' '}
        {SKINS.filter((s) => s.credit).map((s) => (
          <span key={s.id}>
            {skinName(s.id)} — {s.credit}{' '}
          </span>
        ))}
      </p>
    </div>
  );
}