/** Mail services the HR mailbox can read over IMAP with an app password, so nobody needs a developer console. */
export type MailProvider = 'gmail' | 'naver' | 'daum' | 'custom';

export interface MailAccount {
  provider: MailProvider;
  /** The address; also the IMAP login. */
  user: string;
  host: string;
  port: number;
}

export interface MailProviderInfo {
  id: MailProvider;
  label: string;
  host: string;
  port: number;
  /** What to switch on and where to get the password, in a sentence. */
  note: string;
  link?: { label: string; url: string };
}

export const MAIL_PROVIDERS: MailProviderInfo[] = [
  {
    id: 'gmail',
    label: 'Gmail',
    host: 'imap.gmail.com',
    port: 993,
    note: '구글 계정에서 2단계 인증을 켠 뒤 "앱 비밀번호"를 만들어 붙여넣어요 (16자리, 띄어쓰기는 그대로 둬도 돼요).',
    link: { label: '앱 비밀번호 만들기', url: 'https://myaccount.google.com/apppasswords' },
  },
  {
    id: 'naver',
    label: '네이버 메일',
    host: 'imap.naver.com',
    port: 993,
    note: '네이버 메일 환경설정 → POP3/IMAP 설정에서 IMAP 사용을 켜요. 2단계 인증을 쓰면 "애플리케이션 비밀번호"를 만들어 넣어요.',
    link: { label: 'IMAP 설정 열기', url: 'https://mail.naver.com/v2/settings/smtp/imap' },
  },
  {
    id: 'daum',
    label: '다음·카카오 메일',
    host: 'imap.daum.net',
    port: 993,
    note: '다음 메일 환경설정 → IMAP/SMTP 설정에서 IMAP 사용을 켜요. 2단계 인증을 쓰면 앱 비밀번호를 만들어 넣어요.',
    link: { label: '다음 메일 열기', url: 'https://mail.daum.net' },
  },
  {
    id: 'custom',
    label: '직접 입력 (회사 메일 등)',
    host: '',
    port: 993,
    note: '메일 서비스의 IMAP 서버 주소와 포트(보통 993)를 넣어요. 회사 메일은 관리자에게 IMAP 사용 여부를 물어보세요.',
  },
];

export const mailProviderOf = (id: string) => MAIL_PROVIDERS.find((p) => p.id === id) ?? null;
