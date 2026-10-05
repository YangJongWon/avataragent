import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { strToU8, zipSync } from 'fflate';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'avataragent-community-'));
process.env.AI_PROVIDER = 'mock';
process.env.SITE_URL = 'https://site.test';

const { store } = await import('../server/store.ts');
const { communityInstall, communityList, communityPreview, removeFlow, setCommunityFetch } = await import('../server/community.ts');
const { listThemes } = await import('../server/themes.ts');
const { flowFromPlan, flowToSteps } = await import('../shared/flow-pack.ts');
const { validatePlan } = await import('../shared/workflow.ts');
const { migrate, openDb } = await import('../site/server/db.ts');
const { Community } = await import('../site/server/community.ts');
const { memoryStorage } = await import('../site/server/storage.ts');
const { createSiteApp } = await import('../site/server/app.ts');
import type { Account } from '../site/server/auth.ts';

function png(w: number, h: number) {
  const bytes = new Uint8Array(33);
  const view = new DataView(bytes.buffer);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  view.setUint32(8, 13);
  bytes.set(strToU8('IHDR'), 12);
  view.setUint32(16, w);
  view.setUint32(20, h);
  return bytes;
}

const themeZip = zipSync({
  'theme.json': strToU8(
    JSON.stringify({
      format: 'avataragent-theme',
      version: 1,
      id: 'shared-cafe',
      themeVersion: '1.0.0',
      name: '함께 쓰는 카페',
      license: 'CC-BY-4.0',
      preview: 'preview.png',
      scene: { layers: [{ image: 'room.png', x: 0, y: 0 }] },
      characters: [{ id: 'yuri', sheet: 'yuri.png', frames: { a: { x: 0, y: 0, w: 64, h: 96 } }, states: { idle: { frames: ['a'] } } }],
    }),
  ),
  'preview.png': png(4, 4),
  'room.png': png(800, 480),
  'yuri.png': png(64, 96),
});

/** A real site app in memory; the app's fetches to SITE_URL are sent to it. */
async function startSite() {
  const db = await openDb();
  await migrate(db);
  await db.query("INSERT INTO accounts (id, email, name) VALUES ('acc_1', 'maker@example.com', 'maker')");
  await db.query("INSERT INTO profiles (account_id, handle) VALUES ('acc_1', 'maker')");
  const storage = memoryStorage();
  const maker = { id: 'acc_1', email: 'maker@example.com', name: 'maker', avatar_url: '', role: 'user', status: 'active' } as Account;
  const community = new Community(db, storage);
  const config = { port: 0, publicUrl: 'https://site.test', databaseUrl: '', dataDir: '', secret: 's', adminEmails: [], google: null, github: null, mail: { provider: 'console' }, license: null };
  const app = createSiteApp({ db, config: config as never, mailer: { send: async () => {} }, storage });
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const seen: string[] = [];
  setCommunityFetch((input, init) => {
    const url = String(input);
    seen.push(url);
    return fetch(url.replace('https://site.test', base), init);
  });
  return { community, maker, seen, close: async () => (server.close(), db.close()) };
}

test('the app installs themes and flows from the site gallery, and hands playbooks back', async () => {
  const site = await startSite();
  try {
    const agents = store.data.agents.filter((a) => a.officeId === 'office_dev');
    const plan = flowToSteps(
      flowFromPlan(
        [
          { kind: 'brief', label: '접수', agentId: agents[0].id, instructions: '', loop: null },
          { kind: 'draft', label: '작성', agentId: agents[2].id, instructions: '표로', loop: null },
          { kind: 'approval', label: '승인', agentId: null, instructions: '', loop: null },
        ],
        agents,
        { name: 'x' },
      ),
      agents,
    );
    const theme = await site.community.upload(site.maker, { type: 'theme', bytes: themeZip });
    const flowBytes = strToU8(JSON.stringify(flowFromPlan(plan, agents, { name: '표 보고서', team: 'dev' })));
    const flow = await site.community.upload(site.maker, { type: 'flow', bytes: flowBytes });
    const playbook = await site.community.upload(site.maker, {
      type: 'playbook',
      bytes: strToU8(JSON.stringify({ format: 'avataragent-playbook', version: 1, name: '팀 설정', team: 'dev', staff: [{ role: 'writer', rules: '짧게' }], stats: {} })),
      license: 'CC0-1.0',
    });

    const list = await communityList({ type: 'theme', evil: 'x' });
    assert.equal(list.site, 'https://site.test');
    assert.deepEqual((list as unknown as { items: { id: string }[] }).items.map((i) => i.id), [theme.id]);
    assert.ok(!site.seen.at(-1)!.includes('evil'), 'only known query keys are passed on');
    assert.equal((await communityPreview(theme.id)).contentType, 'image/png');

    const installed = await communityInstall(theme.id);
    assert.equal(installed.type, 'theme');
    assert.ok(listThemes().some((t) => t.id === 'shared-cafe'));

    const saved = await communityInstall(flow.id);
    assert.equal(saved.type, 'flow');
    await communityInstall(flow.id);
    assert.equal(store.data.flows.length, 1, 'installing again replaces the copy');
    const steps = flowToSteps(store.data.flows[0].flow, agents);
    assert.equal(validatePlan(steps, agents), null, 'a community flow fits the office');
    assert.equal(steps[1].instructions, '표로');

    const pb = await communityInstall(playbook.id);
    assert.equal(pb.type, 'playbook');
    assert.equal(store.data.flows.length, 1);

    await assert.rejects(communityInstall('../../etc/passwd'), /없는 항목/);
    await assert.rejects(communityInstall('itm_doesnotexist'), /없는 항목/);
    assert.ok(site.seen.every((u) => u.startsWith('https://site.test/api/items')), 'only the site is ever fetched');

    removeFlow(store.data.flows[0].id);
    assert.equal(store.data.flows.length, 0);
  } finally {
    await site.close();
  }
});

test('a site that cannot be reached gives a plain message', async () => {
  setCommunityFetch(async () => {
    throw new TypeError('fetch failed');
  });
  await assert.rejects(communityList({}), /연결할 수 없어요/);
});
