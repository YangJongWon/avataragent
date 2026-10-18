import { useState } from 'react';
import { t, tpl } from '../../../shared/i18n.ts';
import { MAIL_PROVIDERS, mailProviderOf, type MailProvider } from '../../../shared/mail-providers.ts';
import { isGmailServer } from '../../../shared/mcp.ts';
import type { Office, Snapshot } from '../../../shared/types.ts';
import { api } from '../api.ts';

/**
 * Where the HR mailbox reads real mail from: a mail account with an app password (Gmail, Naver, Daum, company IMAP),
 * or, for those who set one up, a Gmail MCP connection. Without either it keeps the simulated mail.
 */
export function MailAccountBox({
  snapshot,
  office,
  run,
  onNotice,
}: {
  snapshot: Snapshot;
  office: Office;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const account = office.mailAccount;
  const gmails = (snapshot.mcpServers ?? []).filter(isGmailServer);
  const linkedMcp = gmails.find((s) => s.id === office.gmailServerId);
  const [provider, setProvider] = useState<MailProvider>('gmail');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(993);
  const [busy, setBusy] = useState<'connect' | 'import' | null>(null);
  const info = mailProviderOf(provider)!;

  const work = (kind: 'connect' | 'import', fn: () => Promise<void>) =>
    run(async () => {
      setBusy(kind);
      try {
        await fn();
      } finally {
        setBusy(null);
      }
    });
  const connect = () =>
    work('connect', async () => {
      await api.connectMailAccount(office.id, { provider, user, password, ...(provider === 'custom' ? { host, port } : {}) });
      setPassword('');
      onNotice(tpl('{user} 메일함을 연결했어요.', { user }));
    });
  const pull = () =>
    work('import', async () => {
      const { added } = await api.importMail(office.id);
      onNotice(added ? tpl('새 메일 {n}통을 가져왔어요.', { n: added }) : t('새로 가져올 메일이 없어요.'));
    });
  const reading = account || linkedMcp;

  return (
    <div className="mail-account">
      <b>
        📮 {t('메일 계정 연결')} <span className="muted small">→ {t(office.name)}</span>
      </b>
      {account ? (
        <div className="row wrap">
          <span>
            ✅ {account.user} <span className="muted small">({t(mailProviderOf(account.provider)?.label ?? account.host)})</span>
          </span>
          <button className="pixel-btn small danger" onClick={() => window.confirm(t('메일 계정 연결을 끊을까요? 저장한 앱 비밀번호도 지워져요.')) && run(() => api.disconnectMailAccount(office.id))}>
            {t('연결 끊기')}
          </button>
        </div>
      ) : (
        <>
          <span className="muted small">{t('실제 메일함을 팀이 읽고 정리하게 하려면, 메일 주소와 앱 비밀번호를 넣어 연결하세요. 메일함은 읽기만 하고 아무것도 바꾸지 않아요.')}</span>
          <div className="row wrap">
            <select value={provider} onChange={(e) => setProvider(e.target.value as MailProvider)}>
              {MAIL_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {t(p.label)}
                </option>
              ))}
            </select>
            <input type="email" placeholder={t('메일 주소')} value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" />
            <input type="password" placeholder={t('앱 비밀번호')} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            {provider === 'custom' && (
              <>
                <input placeholder={t('IMAP 서버 (예: imap.company.com)')} value={host} onChange={(e) => setHost(e.target.value)} />
                <input type="number" className="mail-port" value={port} onChange={(e) => setPort(Number(e.target.value))} aria-label={t('포트')} />
              </>
            )}
            <button className="pixel-btn small primary" disabled={busy !== null || !user.trim() || !password.trim() || (provider === 'custom' && !host.trim())} onClick={connect}>
              {busy === 'connect' ? t('연결 확인 중…') : t('연결 확인하고 저장')}
            </button>
          </div>
          <span className="muted small">
            ℹ {t(info.note)}{' '}
            {info.link && (
              <a href={info.link.url} target="_blank" rel="noreferrer">
                {t(info.link.label)} ↗
              </a>
            )}
          </span>
        </>
      )}
      {reading && (
        <>
          <div className="row wrap">
            <button className="pixel-btn small primary" disabled={busy !== null} onClick={pull}>
              📥 {busy === 'import' ? t('가져오는 중…') : t('새 메일 가져오기')}
            </button>
          </div>
          <span className="muted small">{t('받은편지함의 최근 2일 메일 중 아직 안 가져온 것을 한 번에 최대 10통 가져와요. 자동 확인을 켜 두면 5분마다 가져와서 팀이 알아서 정리해요.')}</span>
        </>
      )}
      {!account && gmails.length > 0 && (
        <details className="small">
          <summary className="muted">{t('고급: Gmail MCP 연결로 읽기')}</summary>
          <select value={linkedMcp?.id ?? ''} onChange={(e) => run(() => api.updateOffice(office.id, { gmailServerId: e.target.value || null }))}>
            <option value="">{t('쓰지 않음')}</option>
            {gmails.map((s) => (
              <option key={s.id} value={s.id}>
                {s.icon} {s.name}
              </option>
            ))}
          </select>
        </details>
      )}
    </div>
  );
}
