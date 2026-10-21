import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { currentLanguage, t, tpl } from '../../../shared/i18n.ts';
import { localText } from '../../../shared/theme-rules.ts';
import { allCompanies, allModels, companyOf, DEFAULT_MODELS, hatName, HATS, type HatShape, modelOf, tierHat, tierLabel, tiersInUse, usesFreeQuota, type Tier } from '../../../shared/models.ts';
import { PERSONALITIES, personalityDescription, personalityLabel } from '../../../shared/personality.ts';
import { builtinSkin, SKINS, skinName, skinNote } from '../../../shared/skins.ts';
import { MAX_STAFF_PER_OFFICE, TEAMS } from '../../../shared/teams.ts';
import { accessoryLabelFor, activeVariant, applyVariant, characterFor, companyLabelFor, formFor, characterName, DEFAULT_THEME, packSkin, splitPackSkin, type ThemeManifest, type ThemeSummary } from '../../../shared/theme-pack.ts';
import type { Agent, AgentSkin, FreeQuota, Office, Role, Skin } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { themeApi } from '../themeApi.ts';
import { useThemeManifest } from '../useThemePack.ts';
import { CharacterPreview } from './CharacterPreview.tsx';
import { FreeQuotaBadge } from './FreeQuotaBadge.tsx';
import { HatPreview } from './HatPreview.tsx';
import { Modal } from './Modals.tsx';
import { PackCharacterPreview } from './PackCharacterPreview.tsx';
import { WorkPolicyEditor } from './WorkTab.tsx';

/** The theme character a skin points at, when it belongs to the office's theme. */
const packCharacterOf = (skin: AgentSkin, theme: ThemeManifest | null) => {
  const pack = splitPackSkin(skin);
  return pack && theme?.id === pack.themeId ? (theme.characters.find((c) => c.id === pack.characterId) ?? null) : null;
};

const ROLE_ORDER: Role[] = ['manager', 'researcher', 'writer', 'reviewer'];

/** 후보를 하나씩 직접 고를 수 있게, 목록에서 seed마다 다른 6개를 뽑아 돌려준다. */
function pickCandidates<T>(pool: T[], seed: string, salt: number) {
  const key = `${seed}#${salt}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = (h ^ key.charCodeAt(i)) * 16777619 >>> 0;
  const next = () => (h = (h * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 6);
}

interface Candidate {
  key: string;
  title: string;
  selected: boolean;
  preview: ReactNode;
  apply: () => void;
}

function RandomPickModal(props: { candidates: Candidate[]; onReroll: () => void; onClose: () => void }) {
  return (
    <Modal title={t('🎲 랜덤 고르기')} onClose={props.onClose}>
      <p className="muted small">{t('마음에 드는 캐릭터를 눌러 바로 적용하세요.')}</p>
      <div className="cand-row">
        {props.candidates.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`cand ${c.selected ? 'selected' : ''}`}
            title={c.title}
            onClick={() => {
              c.apply();
              props.onClose();
            }}
          >
            {c.preview}
          </button>
        ))}
        <button type="button" className="pixel-btn small cand-reroll" onClick={props.onReroll}>
          {t('후보 새로 뽑기')}
        </button>
      </div>
    </Modal>
  );
}

/** The theme's own words for what a company wears; a company the theme leaves bare wears the pixel hat. */
function companyLook(theme: ThemeManifest | null, company: { id: string; hat: HatShape }): string | null {
  if (!theme) return hatName(company.hat);
  const label = companyLabelFor(theme.accessoryLabels, company.id);
  if (label) return localText(label, currentLanguage());
  const look = applyVariant(theme, activeVariant(theme, new Date()));
  const dressed = look.accessories[company.id] || look.accessories['*'] || allModels().some((m) => m.vendor === company.id && look.modelAccessories[m.id]);
  return dressed ? null : hatName(company.hat);
}

/** The theme's own words for what a model (else its tier) wears. */
function modelLook(theme: ThemeManifest | null, modelId: string, tier: number): string | null {
  const label = theme && accessoryLabelFor(theme.accessoryLabels, modelId, tier);
  return label ? localText(label, currentLanguage()) : null;
}

function AgentEditor({
  agent,
  roleTitle,
  themeId,
  freeQuota,
  onError,
  onSaved,
  onPickTheme,
}: { agent: Agent; roleTitle: string; themeId?: string; freeQuota: FreeQuota; onError: (m: string) => void; onSaved: (m: string) => void; onPickTheme: (id: string) => void }) {
  const officeTheme = useThemeManifest(themeId);
  const [themes, setThemes] = useState<ThemeSummary[]>([]);
  const [name, setName] = useState(agent.name);
  const [model, setModel] = useState(agent.model);
  const [addCompany, setAddCompany] = useState<string | null>(null);
  const [serviceModels, setServiceModels] = useState<string[]>([]);
  const [serviceModel, setServiceModel] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [selectingModel, setSelectingModel] = useState(false);
  const [rules, setRules] = useState(agent.rules);
  const [skin, setSkin] = useState(agent.skin);
  const [outfit, setOutfit] = useState<string | null>(agent.outfit ?? null);
  const [personality, setPersonality] = useState(agent.personality);
  // Step 1 picks the theme, step 2 a look inside it; it starts on the theme the current look belongs to, else the office's.
  const [pickTheme, setPickTheme] = useState(splitPackSkin(agent.skin)?.themeId ?? themeId ?? DEFAULT_THEME);
  const theme = useThemeManifest(pickTheme);
  const [roll, setRoll] = useState(0);
  const [showRandom, setShowRandom] = useState(false);
  const ownCharacter = packCharacterOf(skin, theme) ?? packCharacterOf(skin, officeTheme);
  const ownTheme = ownCharacter && theme?.characters.includes(ownCharacter) ? theme : officeTheme;
  // An outfit the newly picked character does not have is dropped, as the server does.
  const wearing = ownCharacter?.outfits.some((o) => o.id === outfit) ? outfit : null;
  // The model cards show the theme picked in step 1: its character for this agent wearing that theme's accessories.
  const modelTheme = pickTheme !== DEFAULT_THEME ? theme : null;
  const modelCharacter = modelTheme && characterFor(modelTheme, skin, agent.role);
  // The stage shows the staff as the office draws them: a look from a theme picked here, else the office theme's character
  // for this skin and role, wearing the model's form and accessories.
  const stageTheme = ownCharacter ? ownTheme : officeTheme;
  const stageCharacter = ownCharacter ?? (officeTheme && characterFor(officeTheme, skin, agent.role));

  // The legend under the editor follows the theme picked here.
  useEffect(() => onPickTheme(pickTheme), [pickTheme, onPickTheme]);
  // 🎲 draws from the theme picked in step 1: look × model for the built-in one, character × outfit for an installed one.
  const candidates = useMemo<Candidate[]>(() => {
    if (pickTheme === DEFAULT_THEME) {
      const pool = SKINS.flatMap((s) => allModels().map((m) => ({ skin: s.id as Skin, model: m.id })));
      return pickCandidates(pool, agent.id, roll).map((c) => ({
        key: `${c.skin}:${c.model}`,
        title: `${skinName(c.skin)} · ${modelOf(c.model).label}`,
        selected: skin === c.skin && model === c.model,
        preview: <CharacterPreview role={agent.role} skin={c.skin} modelId={c.model} expression="smile" />,
        apply: () => {
          setSkin(c.skin);
          setModel(c.model);
        },
      }));
    }
    if (!theme) return [];
    const pool = theme.characters.flatMap((c) => [null, ...c.outfits.map((o) => o.id)].map((outfitId) => ({ character: c, outfitId })));
    return pickCandidates(pool, agent.id, roll).map(({ character, outfitId }) => {
      const id = packSkin(theme.id, character.id);
      const outfitName = outfitId && character.outfits.find((o) => o.id === outfitId)?.name;
      return {
        key: `${id}:${outfitId ?? ''}`,
        title: outfitName ? `${characterName(character, currentLanguage())} · ${localText(outfitName, currentLanguage())}` : characterName(character, currentLanguage()),
        selected: skin === id && wearing === outfitId,
        preview: <PackCharacterPreview themeId={theme.id} character={character} outfit={outfitId} />,
        apply: () => {
          setSkin(id);
          setOutfit(outfitId);
        },
      };
    });
  }, [pickTheme, theme, agent.id, agent.role, roll, skin, model, wearing]);

  useEffect(() => {
    themeApi.list().then(setThemes, () => setThemes([]));
  }, []);
  const dirty =
    name !== agent.name || model !== agent.model || rules !== agent.rules || skin !== agent.skin || personality !== agent.personality || wearing !== (agent.outfit ?? null);

  const save = async () => {
    try {
      // An untouched translated default is saved back as the stored Korean source, so other languages keep theirs.
      const savedName = agent.sourceName && name === agent.name ? agent.sourceName : name;
      const savedRules = agent.sourceRules && rules === agent.rules ? agent.sourceRules : rules;
      await api.updateAgent(agent.id, { name: savedName, model, rules: savedRules, skin, personality, ...(ownCharacter && { outfit: wearing }) });
      onSaved(tpl('{name} 정보를 저장했어요.', { name }));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const loadServiceModels = async (companyId: string) => {
    setLoadingModels(true);
    setServiceModels([]);
    setServiceModel('');
    try {
      const result = await api.discoverModels({ companyId });
      setServiceModels(result.models);
      onSaved(tpl('{name}에서 모델 {n}개를 불러왔어요.', { name: companyOf(companyId).name, n: result.models.length }));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingModels(false);
    }
  };

  const chooseServiceModel = async () => {
    const apiModel = serviceModel.trim();
    if (!apiModel || !addCompany) return;
    setSelectingModel(true);
    try {
      const existing = allModels().find((m) => m.vendor === addCompany && m.apiModel === apiModel);
      if (existing) {
        setModel(existing.id);
        onSaved(tpl('{name} 모델을 선택했어요.', { name: existing.label }));
        setAddCompany(null);
        return;
      }
      const short = apiModel.split('/').pop()?.replace(/:free$/i, '') || apiModel;
      const label = `${short.replace(/[-_]+/g, ' ')}${/:free$/i.test(apiModel) ? ' (무료)' : ''}`;
      const added = await api.createModel({
        vendor: addCompany,
        tier: 2,
        label,
        apiModel,
        priceInPerMTokUsd: /:free$/i.test(apiModel) ? 0 : 1,
        priceOutPerMTokUsd: /:free$/i.test(apiModel) ? 0 : 4,
      });
      setModel(added.id);
      onSaved(tpl('{name} 모델을 등록하고 선택했어요.', { name: added.label }));
      setAddCompany(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setSelectingModel(false);
    }
  };

  const openModelAdder = (companyId: string) => {
    if (addCompany === companyId) {
      setAddCompany(null);
      return;
    }
    setAddCompany(companyId);
    void loadServiceModels(companyId);
  };

  const removeModel = async (id: string, label: string) => {
    if (!window.confirm(tpl('{name} 모델을 지울까요?', { name: label }))) return;
    try {
      await api.deleteModel(id);
      if (model === id) setModel(agent.model);
      onSaved(tpl('{name} 모델을 지웠어요.', { name: label }));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const resetCompanyModels = async (companyId: string, companyName: string) => {
    if (!window.confirm(tpl('{name} 회사의 기본 모델을 모두 초기화할까요?', { name: companyName }))) return;
    try {
      await api.resetCompanyModels(companyId);
      onSaved(tpl('{name} 회사의 기본 모델을 초기화했어요.', { name: companyName }));
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
        {stageTheme && stageCharacter ? (
          <PackCharacterPreview themeId={stageTheme.id} character={stageCharacter} outfit={wearing} wearing={{ theme: stageTheme, modelId: model }} />
        ) : (
          <CharacterPreview role={agent.role} skin={builtinSkin(skin)} modelId={model} expression="smile" />
        )}
        <div className="hire-stage-info">
          <div className="hire-stage-name">{name || t('이름 없음')}</div>
          <div className="muted small">
            {modelOf(model).label} · {tierLabel(modelOf(model).tier)} · {companyOf(modelOf(model).vendor).name}
          </div>
          {usesFreeQuota(model) && <FreeQuotaBadge quota={freeQuota} />}
          <div className="muted small">{stageCharacter ? `${characterName(stageCharacter, currentLanguage())} · ${stageTheme?.name}` : skinName(skin)}</div>
          <div className="muted small">
            {PERSONALITIES.find((p) => p.id === personality)?.emoji} {personalityLabel(personality)}
          </div>
        </div>
      </div>

      <div className="field">
        <b>{t('1. 테마 고르기')}</b>
        <div className="skin-row">
          <button
            className={`skin-option skin-option-art ${pickTheme === DEFAULT_THEME ? 'selected' : ''}`}
            type="button"
            onClick={() => setPickTheme(DEFAULT_THEME)}
          >
            <CharacterPreview role={agent.role} skin={builtinSkin(skin)} modelId={model} expression="normal" />
            {t('기본 테마')}
          </button>
          {themes
            .filter((th) => th.characters.length > 0)
            .map((th) => (
              <button
                key={th.id}
                className={`skin-option skin-option-art ${pickTheme === th.id ? 'selected' : ''}`}
                type="button"
                title={`${th.name} · ${th.author} · ${th.license}`}
                onClick={() => setPickTheme(th.id)}
              >
                {th.preview ? <img className="theme-pick-preview" src={themeApi.previewUrl(th.id, th.preview)} alt="" /> : <span className="skin-preview">🎨</span>}
                {th.name}
                {th.id === themeId && <span className="muted small">{t('이 사무실 테마')}</span>}
              </button>
            ))}
        </div>
      </div>

      <div className="field">
        <b>{t('2. 외형 고르기')}</b>
        <div className="skin-row">
          {pickTheme === DEFAULT_THEME &&
            SKINS.map((s) => (
              <button
                key={s.id}
                className={`skin-option skin-option-art ${skin === s.id ? 'selected' : ''}`}
                type="button"
                title={s.credit ? `${skinNote(s.id)}
${t('출처')}: ${s.credit}` : skinNote(s.id)}
                onClick={() => setSkin(s.id)}
              >
                <CharacterPreview role={agent.role} skin={s.id} modelId={model} expression="normal" />
                {skinName(s.id)}
              </button>
            ))}
          {pickTheme !== DEFAULT_THEME &&
            theme?.characters.map((c) => {
              const id = packSkin(theme.id, c.id);
              return (
                <button
                  key={id}
                  className={`skin-option skin-option-art ${skin === id || (stageTheme?.id === theme.id && stageCharacter?.id === c.id) ? 'selected' : ''}`}
                  type="button"
                  title={`${theme.name} · ${theme.author} · ${theme.license}`}
                  onClick={() => setSkin(id)}
                >
                  <PackCharacterPreview themeId={theme.id} character={c} />
                  {characterName(c, currentLanguage())}
                </button>
              );
            })}
          {(pickTheme === DEFAULT_THEME || theme) && (
            <button
              key="random"
              className="skin-option skin-option-art"
              type="button"
              title={t('🎲 랜덤 고르기')}
              onClick={() => setShowRandom(true)}
            >
              <span className="skin-preview">🎲</span>
              {t('랜덤')}
            </button>
          )}
        </div>
        {pickTheme !== DEFAULT_THEME && theme && <div className="muted small">{tpl('{theme} 테마의 캐릭터는 이 테마를 쓰는 사무실에서 보여요. 다른 사무실에서는 기본 픽셀로 보여요.', { theme: theme.name })}</div>}
        {ownTheme && ownCharacter && ownCharacter.outfits.length > 0 && (
          <>
            <b>{t('의상')}</b>
            <div className="skin-row">
              {[null, ...ownCharacter.outfits].map((o) => (
                <button
                  key={o?.id ?? ''}
                  className={`skin-option skin-option-art ${wearing === (o?.id ?? null) ? 'selected' : ''}`}
                  type="button"
                  onClick={() => setOutfit(o?.id ?? null)}
                >
                  <PackCharacterPreview themeId={ownTheme.id} character={ownCharacter} outfit={o?.id ?? null} />
                  {o ? localText(o.name, currentLanguage()) : t('기본 옷')}
                </button>
              ))}
            </div>
            {ownTheme.dress.length > 0 && <div className="muted small">{t('테마의 옷 규칙(예: 휴게실에서는 편한 옷)이 맞을 때는 그 옷이 먼저 보여요.')}</div>}
          </>
        )}
      </div>

      <div className="field">
        <b>{t('3. 모델 고르기')}</b>
        <div className="muted small">
          {modelTheme
            ? modelTheme.accessoryLabels.summary
              ? localText(modelTheme.accessoryLabels.summary, currentLanguage())
              : tpl('{theme} 테마에서 보이는 모습이에요.', { theme: modelTheme.name })
            : `${t('모자 모양 = AI 회사, 장식 = 등급')} · ${t('고른 외형에 씌워서 보여 줘요.')}`}
        </div>
        {allCompanies().map((company) => {
          const list = allModels().filter((m) => m.vendor === company.id).sort((a, b) => a.tier - b.tier);
          const removedDefaults = DEFAULT_MODELS.filter((m) => m.vendor === company.id && !list.some((saved) => saved.id === m.id));
          const hasDefaults = DEFAULT_MODELS.some((m) => m.vendor === company.id);
          return (
            <div key={company.id} className="model-pick-group">
              <div className="model-pick-title">
                <span>{[company.name, companyLook(modelTheme, company)].filter(Boolean).join(' · ')}</span>
                {list.some((m) => usesFreeQuota(m.id)) && <FreeQuotaBadge quota={freeQuota} />}
                <span className="model-company-actions">
                  {hasDefaults && (
                    <button className="pixel-btn small" type="button" onClick={() => void resetCompanyModels(company.id, company.name)}>
                      {t('기본 모델 초기화')}
                    </button>
                  )}
                </span>
              </div>
              <div className="model-pick-row">
                {list.map((m) => (
                  <div key={m.id} className="model-pick-wrap">
                    <button type="button" className={`model-pick ${model === m.id ? 'selected' : ''}`} onClick={() => setModel(m.id)}>
                    {modelTheme && modelCharacter ? (
                      <PackCharacterPreview themeId={modelTheme.id} character={modelCharacter} outfit={modelCharacter === ownCharacter ? wearing : null} wearing={{ theme: modelTheme, modelId: m.id }} />
                    ) : (
                      <CharacterPreview role={agent.role} skin={builtinSkin(skin)} modelId={m.id} expression="normal" />
                    )}
                    <span className="model-pick-label">{m.label}</span>
                    {(() => {
                      // The character's own name for this look (Super Saiyan 2) comes before the theme's words for the tier.
                      const formName = modelCharacter && formFor(modelCharacter, m)?.form.name;
                      const look = formName ? localText(formName, currentLanguage()) : modelLook(modelTheme, m.id, m.tier);
                      return look && <span className="small">{look}</span>;
                    })()}
                    <span className="muted small">{usesFreeQuota(m.id) ? t('무료') : `$${m.priceInPerMTokUsd}/$${m.priceOutPerMTokUsd}`}</span>
                    </button>
                    <div className="model-pick-actions">
                      <button className="danger" type="button" onClick={() => void removeModel(m.id, m.label)}>{t('삭제')}</button>
                    </div>
                  </div>
                ))}
                {removedDefaults.map((m) => (
                  <div key={m.id} className="model-pick-removed">
                    <span>{m.label}</span>
                    <span className="muted small">{t('삭제됨')}</span>
                  </div>
                ))}
                <button type="button" className={`model-pick model-pick-add ${addCompany === company.id ? 'selected' : ''}`} onClick={() => openModelAdder(company.id)}>
                  <span className="model-pick-add-icon">+</span>
                  <span className="model-pick-label">{t('모델 추가')}</span>
                </button>
              </div>
            </div>
          );
        })}
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
      <WorkPolicyEditor
        agent={agent}
        onError={onError}
        onNotice={onSaved}
        actions={
          <button className="pixel-btn primary" disabled={!dirty} onClick={save}>
            {t('저장')}
          </button>
        }
      />
      {addCompany && (
        <Modal title={t('모델 추가')} onClose={() => setAddCompany(null)}>
          <div className="service-model-picker model-add-dialog">
            {allCompanies().length > 1 && (
              <label className="field">
                {t('1. 서비스 회사 선택')}
                <select
                  value={addCompany}
                  onChange={(e) => {
                    const companyId = e.target.value;
                    setAddCompany(companyId);
                    void loadServiceModels(companyId);
                  }}
                >
                  {allCompanies().map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                </select>
              </label>
            )}
            <label className="field">
              {allCompanies().length > 1 ? t('2. API 모델 선택') : t('API 모델 선택')}
              <input
                list={`service-models-${agent.id}`}
                value={serviceModel}
                placeholder={loadingModels ? t('불러오는 중…') : t('모델 이름이나 ID를 입력하세요')}
                disabled={loadingModels}
                onChange={(e) => setServiceModel(e.target.value)}
              />
              <datalist id={`service-models-${agent.id}`}>
                {serviceModels.map((id) => <option key={id} value={id} />)}
              </datalist>
            </label>
            <div className="row end wrap">
              <button className="pixel-btn small" type="button" disabled={loadingModels} onClick={() => void loadServiceModels(addCompany)}>
                {loadingModels ? t('불러오는 중…') : t('목록 새로고침')}
              </button>
              <button className="pixel-btn small" type="button" onClick={() => setAddCompany(null)}>{t('취소')}</button>
              <button className="pixel-btn small primary" type="button" disabled={selectingModel || loadingModels || !serviceModel.trim()} onClick={() => void chooseServiceModel()}>
                {selectingModel ? t('추가하는 중…') : t('추가')}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {showRandom && <RandomPickModal candidates={candidates} onReroll={() => setRoll((r) => r + 1)} onClose={() => setShowRandom(false)} />}
    </div>
  );
}

export function HireTab({
  office,
  themeId,
  agents,
  freeQuota,
  onError,
  onNotice,
  onManageModels,
}: { office: Office; themeId: string; agents: Agent[]; freeQuota: FreeQuota; onError: (m: string) => void; onNotice: (m: string) => void; onManageModels: () => void }) {
  const team = TEAMS[office.team];
  const [selectedId, setSelectedId] = useState<string | null>(agents[0]?.id ?? null);
  const [hireRole, setHireRole] = useState<Role>('researcher');
  const [hireName, setHireName] = useState('');
  const [busy, setBusy] = useState(false);
  const selected = agents.find((a) => a.id === selectedId) ?? agents[0];
  // The theme picked in the editor's step 1; the legend explains what staff wear in it.
  const [legendThemeId, setLegendThemeId] = useState<string>(DEFAULT_THEME);
  const legendTheme = useThemeManifest(legendThemeId);
  const legendCompanies = allCompanies()
    .map((c) => ({ c, look: companyLook(legendTheme, c) }))
    .filter((x): x is { c: (typeof x)['c']; look: string } => x.look !== null);
  const legendTiers = tiersInUse().map((tier) => ({ tier, look: legendTheme ? modelLook(legendTheme, '', tier) : tierHat(tier) })).filter(
    (x): x is { tier: Tier; look: string } => x.look !== null,
  );
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
        {t('직원 관리')} · {team.emoji} {t(team.name)}
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
          freeQuota={freeQuota}
          onError={onError}
          onSaved={onNotice}
          onPickTheme={setLegendThemeId}
        />
      )}

      <div className="hat-legend pixel-box">
        {legendTheme?.accessoryLabels.summary && <p className="muted">{localText(legendTheme.accessoryLabels.summary, currentLanguage())}</p>}
        {legendCompanies.length > 0 && (
          <div>
            <b>{legendTheme ? tpl('{theme} 테마 · AI 회사', { theme: legendTheme.name }) : t('모자 모양 = AI 회사')}</b>
            <ul>
              {legendCompanies.map(({ c, look }) => (
                <li key={c.id}>
                  {c.name}: {look}
                </li>
              ))}
            </ul>
          </div>
        )}
        {legendTiers.length > 0 && (
          <div>
            <b>{legendTheme ? tpl('{theme} 테마 · 모델 등급', { theme: legendTheme.name }) : t('장식 = 모델 등급')}</b>
            <ul>
              {legendTiers.map(({ tier, look }) => (
                <li key={tier}>
                  {tierLabel(tier)}: {look}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="muted">
          {t('"직원별 실제 AI" 방식이면 직원마다 자기 모델 회사의 API로 호출해요. 시뮬레이션에서는 모델 가격으로 비용을 계산하고, 등급이 높을수록 검토 점수가 올라가요.')}{' '}
          <button className="link-btn" type="button" onClick={onManageModels}>
            {t('모델·API 키 등록하러 가기 →')}
          </button>
        </p>
      </div>
      <p className="muted small">
        {legendTheme ? (
          <>
            {t('테마 출처')}: {legendTheme.name} — {legendTheme.author}, {legendTheme.license}
          </>
        ) : (
          <>
            {t('스킨 출처')}:{' '}
            {SKINS.filter((s) => s.credit).map((s) => (
              <span key={s.id}>
                {skinName(s.id)} — {s.credit}{' '}
              </span>
            ))}
          </>
        )}
      </p>
    </div>
  );
}
