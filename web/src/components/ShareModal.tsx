import { currentLanguage, localeOf, t, tpl } from '../../../shared/i18n.ts';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { SHARE_ROLES, shareRoleDescription, shareRoleLabel } from '../../../shared/access.ts';
import { TEAMS } from '../../../shared/teams.ts';
import type { ShareLink, ShareRole, Snapshot } from '../../../shared/types.ts';
import { api } from '../api.ts';

interface Props {
  snapshot: Snapshot;
  initialOfficeIds?: string[];
  onClose: () => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}

const EXPIRY_OPTIONS: [number, string][] = [
  [1, '1일'],
  [7, '7일'],
  [30, '30일'],
  [0, '만료 없음'],
];

const dateText = (iso: string) => new Date(iso).toLocaleString(localeOf(currentLanguage()), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function ShareQr({ url }: { url: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    void QRCode.toDataURL(url, { width: 220, margin: 1 }).then((data) => alive && setSrc(data));
    return () => {
      alive = false;
    };
  }, [url]);
  return src ? <img className="share-qr" src={src} alt={t('공유 QR 코드')} width={220} height={220} /> : <div className="share-qr" />;
}

export function ShareModal({ snapshot, initialOfficeIds, onClose, onError, onNotice }: Props) {
  const shares = snapshot.shares ?? [];
  const suggestedBase = snapshot.publicUrl || location.origin;
  const [base, setBase] = useState(suggestedBase);
  const [name, setName] = useState('');
  const [role, setRole] = useState<ShareRole>('viewer');
  const [scope, setScope] = useState<'all' | 'some'>(initialOfficeIds?.length ? 'some' : 'all');
  const [picked, setPicked] = useState<string[]>(initialOfficeIds ?? []);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const focusOffice = initialOfficeIds?.length === 1 ? snapshot.offices.find((o) => o.id === initialOfficeIds[0]) : undefined;
  const [onlyFocus, setOnlyFocus] = useState(Boolean(focusOffice));
  const listed =
    focusOffice && onlyFocus ? shares.filter((s) => s.officeIds === 'all' || s.officeIds.includes(focusOffice.id)) : shares;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const linkOf = (share: ShareLink) => `${base.replace(/\/+$/, '')}/s/${share.token}`;
  const officeName = (id: string) => snapshot.offices.find((o) => o.id === id)?.name ?? t('(닫힌 사무실)');
  const scopeText = (share: ShareLink) => (share.officeIds === 'all' ? t('전체 사무실') : share.officeIds.map(officeName).join(', '));

  const create = async () => {
    setBusy(true);
    try {
      const share = await api.createShare({ name, role, officeIds: scope === 'all' ? 'all' : picked, expiresInDays: days });
      setOpenId(share.id);
      setName('');
      onNotice(tpl('"{name}" 공유 링크를 만들었어요.', { name: share.name }));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (share: ShareLink) => {
    if (!window.confirm(tpl('"{name}" 링크를 취소할까요? 이 링크로 보고 있던 사람은 바로 접속이 끊겨요.', { name: share.name }))) return;
    try {
      await api.deleteShare(share.id);
      onNotice(tpl('"{name}" 링크를 취소했어요.', { name: share.name }));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const copy = async (share: ShareLink) => {
    try {
      await navigator.clipboard.writeText(linkOf(share));
      onNotice(t('링크를 복사했어요.'));
    } catch {
      window.prompt(t('아래 링크를 복사해 주세요.'), linkOf(share));
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal pixel-box share-modal">
        <div className="modal-head">
          <span>🔗 {focusOffice ? tpl('{name} 공유', { name: focusOffice.name }) : t('사무실 공유')}</span>
          <button className="icon-btn" onClick={onClose} aria-label={t('닫기')}>
            ✕
          </button>
        </div>

        <section className="share-section">
          <h4>{t('새 공유 링크')}</h4>
          <label className="field">
            {t('받는 사람 (메모)')}
            <input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder={t('예: 김 대리 휴대폰')} />
          </label>

          <div className="field">
            {t('공유 범위')}
            <div className="segmented">
              <button type="button" className={`segment ${scope === 'all' ? 'active' : ''}`} onClick={() => setScope('all')}>
                {t('전체 사무실')}
              </button>
              <button type="button" className={`segment ${scope === 'some' ? 'active' : ''}`} onClick={() => setScope('some')}>
                {t('일부 사무실')}
              </button>
            </div>
          </div>
          {scope === 'some' && (
            <div className="share-offices">
              {snapshot.offices.map((o) => (
                <label key={o.id} className="check">
                  <input
                    type="checkbox"
                    checked={picked.includes(o.id)}
                    onChange={(e) => setPicked((prev) => (e.target.checked ? [...prev, o.id] : prev.filter((id) => id !== o.id)))}
                  />
                  {TEAMS[o.team].emoji} {o.name}
                </label>
              ))}
            </div>
          )}

          <div className="field">
            {t('권한')}
            <div className="share-roles">
              {(Object.keys(SHARE_ROLES) as ShareRole[]).map((id) => (
                <label key={id} className={`share-role ${role === id ? 'selected' : ''}`}>
                  <input type="radio" name="share-role" checked={role === id} onChange={() => setRole(id)} />
                  <b>{shareRoleLabel(id)}</b>
                  <span className="small muted">{shareRoleDescription(id)}</span>
                </label>
              ))}
            </div>
            <span className="small muted">{t('사무실 추가·삭제, 회사 예산, 공유 관리는 주인(비밀번호 로그인)만 할 수 있어요.')}</span>
          </div>

          <label className="field">
            {t('유효 기간')}
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {EXPIRY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </select>
          </label>

          <div className="row end">
            <button className="pixel-btn primary" disabled={busy || (scope === 'some' && picked.length === 0)} onClick={create}>
              {t('링크 만들기')}
            </button>
          </div>
        </section>

        <section className="share-section">
          <h4>
            {focusOffice && onlyFocus ? tpl('{name}을(를) 볼 수 있는 링크', { name: focusOffice.name }) : t('만든 링크')}{' '}
            {listed.length > 0 && <span className="muted small">({listed.length})</span>}
          </h4>
          {focusOffice && (
            <label className="check small">
              <input type="checkbox" checked={!onlyFocus} onChange={(e) => setOnlyFocus(!e.target.checked)} />
              {tpl('다른 사무실 링크도 보기 (전체 {n}개)', { n: shares.length })}
            </label>
          )}
          <label className="field">
            {t('링크 주소 앞부분')}
            <input value={base} onChange={(e) => setBase(e.target.value)} />
            {!snapshot.publicUrl && (
              <span className="small muted">{t('외부에서 열 주소가 다르면 고쳐 주세요. .env의 PUBLIC_URL에 넣어 두면 기본값이 돼요.')}</span>
            )}
          </label>
          {listed.length === 0 && <p className="muted small">{t('아직 만든 링크가 없어요.')}</p>}
          <ul className="share-list">
            {listed.map((share) => {
              const expired = share.expiresAt !== null && Date.parse(share.expiresAt) <= Date.now();
              return (
                <li key={share.id} className={`share-item ${expired ? 'expired' : ''}`}>
                  <div className="share-item-head">
                    <b>{share.name}</b>
                    <span className={`badge share-badge role-${share.role}`}>{shareRoleLabel(share.role)}</span>
                  </div>
                  <div className="small muted">
                    {scopeText(share)} · {expired ? t('만료됨') : share.expiresAt ? tpl('{v}까지', { v: dateText(share.expiresAt) }) : t('만료 없음')}
                    {share.lastUsedAt ? tpl(' · 마지막 접속 {v}', { v: dateText(share.lastUsedAt) }) : t(' · 아직 접속 없음')}
                  </div>
                  <div className="row">
                    <button className="pixel-btn small" disabled={expired} onClick={() => setOpenId(openId === share.id ? null : share.id)}>
                      {openId === share.id ? t('QR 접기') : t('QR 보기')}
                    </button>
                    <button className="pixel-btn small" disabled={expired} onClick={() => copy(share)}>
                      {t('링크 복사')}
                    </button>
                    <button className="pixel-btn small danger" onClick={() => remove(share)}>
                      {expired ? t('지우기') : t('링크 취소')}
                    </button>
                  </div>
                  {openId === share.id && !expired && (
                    <div className="share-qr-box">
                      <ShareQr url={linkOf(share)} />
                      <code className="share-url">{linkOf(share)}</code>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
