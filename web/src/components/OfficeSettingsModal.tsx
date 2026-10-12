import { useEffect, useState } from 'react';
import { TEAMS } from '../../../shared/teams.ts';
import type { Office } from '../../../shared/types.ts';
import { api } from '../api.ts';
import { useLanguage } from '../LanguageProvider.tsx';
import { DEFAULT_THEME, type ThemeSummary } from '../../../shared/theme-pack.ts';
import { themeApi } from '../themeApi.ts';
import { Modal } from './Modals.tsx';

interface Props {
  office: Office;
  isOwner: boolean;
  canManage: boolean;
  /** Tasks running or waiting, which keep the office from closing. */
  busy: boolean;
  onShare: () => void;
  onCloseOffice: () => void;
  onClose: () => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}

/** Everything about one office in one place; opened by clicking the selected office tab again. */
export function OfficeSettingsModal({ office, isOwner, canManage, busy, onShare, onCloseOffice, onClose, onError, onNotice }: Props) {
  const { t, tpl } = useLanguage();
  const team = TEAMS[office.team];
  const [name, setName] = useState(t(office.name));
  const [description, setDescription] = useState(office.description ?? '');
  const [autoRun, setAutoRun] = useState(office.autoRun);
  const [autoImprove, setAutoImprove] = useState(Boolean(office.autoImprove));
  const [theme, setTheme] = useState(office.theme ?? '');
  const [themeCss, setThemeCss] = useState(office.themeCss !== false);
  const [budget, setBudget] = useState(office.budgetKrw === null ? '' : String(office.budgetKrw));
  const [themes, setThemes] = useState<ThemeSummary[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    themeApi.list().then(setThemes, () => setThemes([]));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const patch: Parameters<typeof api.updateOffice>[1] = {};
      if (canManage) Object.assign(patch, { autoRun, autoImprove, theme: theme || null, themeCss });
      if (isOwner) {
        // A default office keeps its catalogue name (shown translated) unless the owner really renamed it.
        if (name.trim() && name.trim() !== t(office.name)) patch.name = name.trim();
        if (description.trim() !== (office.description ?? '')) patch.description = description.trim();
        patch.budgetKrw = budget.trim() === '' ? null : Math.max(0, Math.round(Number(budget)));
      }
      await api.updateOffice(office.id, patch);
      onNotice(tpl('{name} 설정을 저장했어요.', { name: name.trim() || t(office.name) }));
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`⚙️ ${tpl('{name} 설정', { name: t(office.name) })}`} onClose={onClose}>
      <p className="muted small">
        {team.emoji} {t(team.name)} · {t(team.description)}
      </p>
      <label className="field">
        {t('사무실 이름')}
        <input value={name} maxLength={20} disabled={!isOwner} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        {t('사무실 설명')}
        <textarea rows={2} value={description} maxLength={160} disabled={!isOwner} placeholder={t(team.description)} onChange={(e) => setDescription(e.target.value)} />
        <span className="small muted">{t('탭 아래에 보이는 설명이에요. 비우면 팀 기본 설명을 보여 줘요.')}</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={autoRun} disabled={!canManage} onChange={(e) => setAutoRun(e.target.checked)} /> {t('새 항목이 오면 자동으로 업무 시작 (AUTO)')}
      </label>
      <label className="check">
        <input type="checkbox" checked={autoImprove} disabled={!canManage} onChange={(e) => setAutoImprove(e.target.checked)} /> {t('업무가 끝날 때마다 안전한 개선안을 자동 적용')}
      </label>
      <label className="field">
        {t('테마')}
        <select value={theme} disabled={!canManage} onChange={(e) => setTheme(e.target.value)}>
          <option value="">{t('공통 테마 따르기')}</option>
          <option value={DEFAULT_THEME}>{t('기본 픽셀')}</option>
          {themes.map((th) => (
            <option key={th.id} value={th.id}>
              {th.name}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={themeCss} disabled={!canManage} onChange={(e) => setThemeCss(e.target.checked)} /> {t('테마의 직접 만든 CSS 쓰기')}
      </label>
      {isOwner && (
        <label className="field">
          {t('월 AI 예산 상한 (원, 비우면 없음)')}
          <input type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} />
        </label>
      )}
      <div className="row between office-settings-actions">
        <span className="row">
          {isOwner && (
            <button type="button" className="pixel-btn small" onClick={onShare}>
              🔗 {t('이 사무실 공유')}
            </button>
          )}
          {isOwner && (
            <button
              type="button"
              className="pixel-btn small danger"
              disabled={!office.custom || busy}
              title={!office.custom ? t('기본 사무실은 닫을 수 없어요') : busy ? t('진행 중인 업무가 끝나면 닫을 수 있어요') : undefined}
              onClick={onCloseOffice}
            >
              🗑 {t('사무실 닫기')}
            </button>
          )}
        </span>
        <span className="row">
          <button type="button" className="pixel-btn" onClick={onClose}>
            {t('취소')}
          </button>
          <button type="button" className="pixel-btn primary" disabled={saving || (!canManage && !isOwner)} onClick={() => void save()}>
            {saving ? t('저장 중…') : t('저장')}
          </button>
        </span>
      </div>
    </Modal>
  );
}
