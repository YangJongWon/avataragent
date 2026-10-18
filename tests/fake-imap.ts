// A minimal IMAP server for tests: one INBOX, LOGIN with a fixed password, UID SEARCH and UID FETCH of whole messages,
// and, for sorting, CREATE, UID MOVE and (in Gmail mode) X-GM-LABELS on UID STORE.
import { createServer, type Server } from 'node:net';

export interface FakeMessage {
  uid: number;
  date: Date;
  raw: string;
  labels?: string[];
  /** Set when the message was moved out of the inbox. */
  movedTo?: string;
}

export interface FakeImap {
  port: number;
  commands: string[];
  messages: FakeMessage[];
  folders: Set<string>;
  close: () => Promise<void>;
}

const imapDate = (d: Date) => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}-${months[d.getUTCMonth()]}-${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000`;
};

/** Splits IMAP arguments, keeping quoted strings and parenthesised lists whole. */
const tokens = (text: string) => [...text.matchAll(/"((?:[^"\\]|\\.)*)"|\(([^)]*)\)|(\S+)/g)].map((m) => m[1] ?? (m[2] !== undefined ? `(${m[2]})` : m[3]));
const unquote = (v: string) => v.replace(/^"|"$/g, '').replace(/\\"/g, '"');
/** Folder names travel in IMAP's modified UTF-7 ("&yBW89A-" is 정보). */
const decodeName = (v: string) =>
  unquote(v).replace(/&([^-]*)-/g, (_, b64: string) => (b64 ? Buffer.from(b64.replace(/,/g, '/'), 'base64').swap16().toString('utf16le') : '&'));

export async function startFakeImap(user: string, password: string, messages: FakeMessage[], options: { gmail?: boolean } = {}): Promise<FakeImap> {
  const commands: string[] = [];
  const folders = new Set<string>(['INBOX']);
  const caps = `IMAP4rev1 LITERAL+ MOVE UIDPLUS NAMESPACE${options.gmail ? ' X-GM-EXT-1' : ''}`;
  const inbox = () => messages.filter((m) => !m.movedTo);
  const uidsOf = (set: string) =>
    set.split(',').flatMap((part) => {
      const [a, b] = part.split(':').map(Number);
      return b ? inbox().filter((m) => m.uid >= a && m.uid <= b).map((m) => m.uid) : [a];
    });

  const server: Server = createServer((socket) => {
    let buffer = '';
    let selected = false;
    const send = (line: string) => socket.write(`${line}\r\n`);
    send(`* OK [CAPABILITY ${caps}] fake ready`);
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let at: number;
      while ((at = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        const space = line.indexOf(' ');
        const tag = line.slice(0, space);
        const rest = line.slice(space + 1);
        const [rawCommand, ...args] = tokens(rest);
        const command = (rawCommand ?? '').toUpperCase();
        commands.push(command === 'LOGIN' ? 'LOGIN ***' : rest);
        if (command === 'CAPABILITY') {
          send(`* CAPABILITY ${caps}`);
          send(`${tag} OK done`);
        } else if (command === 'LOGIN') {
          if (unquote(args[0]) === user && unquote(args[1]) === password) send(`${tag} OK [CAPABILITY ${caps}] logged in`);
          else send(`${tag} NO [AUTHENTICATIONFAILED] Invalid credentials`);
        } else if (command === 'NAMESPACE') {
          send('* NAMESPACE (("" "/")) NIL NIL');
          send(`${tag} OK namespace done`);
        } else if (command === 'LIST') {
          send('* LIST (\\Noselect) "/" ""');
          for (const f of folders) send(`* LIST () "/" "${f}"`);
          send(`${tag} OK list done`);
        } else if (command === 'CREATE') {
          const name = decodeName(args[0]);
          if (folders.has(name)) send(`${tag} NO [ALREADYEXISTS] exists`);
          else {
            folders.add(name);
            send(`${tag} OK created`);
          }
        } else if (command === 'SELECT' || command === 'EXAMINE') {
          selected = true;
          send(`* ${inbox().length} EXISTS`);
          send('* 0 RECENT');
          send('* OK [UIDVALIDITY 777] ok');
          send(`* OK [UIDNEXT ${Math.max(0, ...messages.map((m) => m.uid)) + 1}] ok`);
          send('* FLAGS (\\Seen \\Answered \\Flagged \\Deleted \\Draft)');
          send(`${tag} OK [${command === 'EXAMINE' ? 'READ-ONLY' : 'READ-WRITE'}] selected`);
        } else if (command === 'UID' && selected) {
          const sub = (args[0] ?? '').toUpperCase();
          const subArgs = args.slice(1);
          if (sub === 'SEARCH') {
            const joined = subArgs.join(' ');
            const since = /SINCE (\S+)/i.exec(joined)?.[1];
            const only = /UID (\S+)/i.exec(joined)?.[1];
            const from = since ? new Date(`${since} UTC`).getTime() - 86_400_000 : 0;
            const uids = inbox()
              .filter((m) => m.date.getTime() >= from && (!only || uidsOf(only).includes(m.uid)))
              .map((m) => m.uid);
            send(`* SEARCH ${uids.join(' ')}`.trim());
            send(`${tag} OK search done`);
          } else if (sub === 'FETCH') {
            for (const uid of uidsOf(subArgs[0])) {
              const index = inbox().findIndex((m) => m.uid === uid);
              if (index < 0) continue;
              const m = inbox()[index];
              const body = Buffer.from(m.raw.replace(/\r?\n/g, '\r\n'));
              socket.write(`* ${index + 1} FETCH (UID ${uid} INTERNALDATE "${imapDate(m.date)}" BODY[] {${body.length}}\r\n`);
              socket.write(body);
              socket.write(')\r\n');
            }
            send(`${tag} OK fetch done`);
          } else if (sub === 'STORE') {
            const [set, op, list] = subArgs;
            const labels = tokens((list ?? '').replace(/^\(|\)$/g, '')).map(decodeName);
            for (const uid of uidsOf(set)) {
              const m = messages.find((x) => x.uid === uid);
              if (!m || !/X-GM-LABELS/i.test(op)) continue;
              const current = new Set(m.labels ?? ['\\Inbox']);
              for (const l of labels) {
                if (op.startsWith('+')) current.add(l);
                else current.delete(l);
              }
              m.labels = [...current];
            }
            send(`${tag} OK store done`);
          } else if (sub === 'MOVE') {
            const [set, target] = subArgs;
            const folder = decodeName(target);
            if (!folders.has(folder)) send(`${tag} NO [TRYCREATE] no such folder`);
            else {
              for (const uid of uidsOf(set)) {
                const m = messages.find((x) => x.uid === uid);
                if (m) m.movedTo = folder;
              }
              send(`${tag} OK move done`);
            }
          } else send(`${tag} OK`);
        } else if (command === 'LOGOUT') {
          send('* BYE bye');
          send(`${tag} OK bye`);
          socket.end();
        } else if (tag) {
          send(`${tag} OK`);
        }
      }
    });
    socket.on('error', () => {});
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  return { port, commands, messages, folders, close: () => new Promise((resolve) => server.close(() => resolve())) };
}
