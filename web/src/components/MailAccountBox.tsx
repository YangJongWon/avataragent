import { useState } from 'react';
import { t, tpl } from '../../../shared/i18n.ts';
import { MAIL_PROVIDERS, mailProviderOf, type MailAccount, type MailProvider } from '../../../shared/mail-providers.ts';
import type { Office } from '../../../shared/types.ts';
import { api } from '../api.ts';

type Run = (fn: () => Promise<unknown>) => Promise<void>;

const fetched = (added: number) => (added ? tpl('새 메일 {n}통을 가져왔어요.', { n: added }) : t('새로 가져올 메일이 없어요.'));

/** Pulls new mail now: from one account, or from everything feeding an office. */
export function MailPullButton({ pull, run, onNotice }: { pull: () => Promise<{ added: number }>; run: Run; onNotice: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="pixel-btn small primary"
      disabled={busy}
      onClick={() =>
        run(async () => {
          setBusy(true);
          try {
            onNotice(fetched((await pull()).added));
          } finally {
            setBusy(false);
          }
        })
      }
    >
      📥 {busy ? t('가져오는 중…') : t('새 메일 가져오기')}
    </button>
  );
}

/**
 * Adds a mail account with an app password (Gmail, Naver, Daum, company IMAP) and picks the mail office whose mailbox
 * it feeds. Any number of accounts can be added, to one office or to several.
 */
export function MailAccountForm({ offices, run, onNotice, onDone }: { offices: Office[]; run: Run; onNotice: (message: string) => void; onDone: () => void }) {
  const [officeId, setOfficeId] = useState(offices[0]?.id ?? '');
  const [provider, setProvider] = useState<MailProvider>('gmail');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(993);
  const [busy, setBusy] = useState(false);
  const info = mailProviderOf(provider)!;
  const office = offices.find((o) => o.id === officeId);
  const connect = () =>
    run(async () => {
      setBusy(true);
      try {
        await api.createMailAccount({ officeId, provider, user, password, ...(provider === 'custom' ? { host, port } : {}) });
        onNotice(tpl('{user} 메일함을 {office}에 연결했어요.', { user, office: t(office?.name ?? '') }));
        onDone();
      } finally {
        setBusy(false);
      }
    });
  return (
    <div className="mail-account">
      <span className="muted small">{t('메일 주소와 앱 비밀번호를 넣고, 메일을 받을 사무실을 골라요. 메일함은 읽기만 하고, 정리 보고서를 승인했을 때만 라벨·보관을 해요.')}</span>
      <div className="row wrap">
        <label className="field-inline">
          {t('받을 사무실')}
          <select value={officeId} onChange={(e) => setOfficeId(e.target.value)}>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {t(o.name)}
              </option>
            ))}
          </select>
        </label>
        <select value={provider} onChange={(e) => setProvider(e.target.value as MailProvider)}>
          {MAIL_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {t(p.label)}
            </option>
          ))}
        </select>
      </div>
      <div className="row wrap">
        <input type="email" placeholder={t('메일 주소')} value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" />
        <input type="password" placeholder={t('앱 비밀번호')} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        {provider === 'custom' && (
          <>
            <input placeholder={t('IMAP 서버 (예: imap.company.com)')} value={host} onChange={(e) => setHost(e.target.value)} />
            <input type="number" className="mail-port" value={port} onChange={(e) => setPort(Number(e.target.value))} aria-label={t('포트')} />
          </>
        )}
      </div>
      <span className="muted small">
        ℹ {t(info.note)}{' '}
        {info.link && (
          <a href={info.link.url} target="_blank" rel="noreferrer">
            {t(info.link.label)} ↗
          </a>
        )}
      </span>
      <div className="row end">
        <button className="pixel-btn small" onClick={onDone}>
          {t('취소')}
        </button>
        <button className="pixel-btn small primary" disabled={busy || !officeId || !user.trim() || !password.trim() || (provider === 'custom' && !host.trim())} onClick={connect}>
          {busy ? t('연결 확인 중…') : t('연결 확인하고 저장')}
        </button>
      </div>
    </div>
  );
}

/** A connected mail account, as a card among the other connections. */
export function MailAccountCard({ account, office, run, onNotice }: { account: MailAccount; office: Office | undefined; run: Run; onNotice: (message: string) => void }) {
  return (
    <div className="company-card">
      <div className="company-name">📮 {t(mailProviderOf(account.provider)?.label ?? account.host)}</div>
      <div className="muted small ellipsis">{account.user}</div>
      <div className="row wrap">
        <span className="key-badge ok">🔑 {t('앱 비밀번호')}</span>
      </div>
      <div className="muted small">🏢 {office ? tpl('{office} 메일함', { office: t(office.name) }) : t('쓰는 사무실 없음')}</div>
      <div className="muted small">{t('받은편지함의 최근 2일 메일 중 아직 안 가져온 것을 한 번에 최대 10통 가져와요. 자동 확인을 켜 두면 5분마다 가져와서 팀이 알아서 정리해요.')}</div>
      <div className="row end wrap">
        <button
          className="pixel-btn small danger"
          onClick={() => window.confirm(tpl('{user} 메일 계정 연결을 끊을까요? 저장한 앱 비밀번호도 지워져요.', { user: account.user })) && run(() => api.deleteMailAccount(account.id))}
        >
          {t('연결 끊기')}
        </button>
        <MailPullButton pull={() => api.importMailAccount(account.id)} run={run} onNotice={onNotice} />
      </div>
    </div>
  );
}
