import type { SiteConfig } from './config.ts';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Prints mails instead of sending them: development, and tests that read the link out of the text. */
export const consoleMailer = (log: (line: string) => void = console.log): Mailer => ({
  async send(mail) {
    log(`[mail] to=${mail.to} subject=${mail.subject}\n${mail.text}`);
  },
});

/** Resend (https://resend.com) over its HTTP API; other providers can implement the same interface. */
export const resendMailer = (apiKey: string, from: string, fetchImpl: typeof fetch = fetch): Mailer => ({
  async send(mail) {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text }),
    });
    if (!res.ok) throw new Error(`mail send failed (${res.status})`);
  },
});

export function mailerFor(config: SiteConfig): Mailer {
  return config.mail.provider === 'resend' ? resendMailer(config.mail.apiKey, config.mail.from) : consoleMailer();
}
