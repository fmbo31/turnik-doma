import test from 'node:test';
import assert from 'node:assert/strict';
import { createSync } from './sync.js';

const fakeStorage = () => {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
  };
};

function fakeServer(initial = []) {
  const remote = new Map(initial.map(d => [d.path, d.data]));
  let uploads = 0;
  const fetchImpl = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    const respond = (value, status = 200) => ({ ok: status < 300, status, text: async () => value === null ? '' : JSON.stringify(value) });
    if (url.includes('/auth/v1/signup')) return respond({ access_token: 'token', refresh_token: 'refresh', expires_in: 3600, user: { id: 'u1' } });
    if (url.includes('/rest/v1/workout_documents') && (!options.method || options.method === 'GET')) {
      return respond([...remote].map(([path, data]) => ({ path, data })));
    }
    if (url.includes('/rest/v1/workout_documents') && options.method === 'POST') {
      uploads += 1;
      for (const row of body) remote.set(row.path, row.data);
      return respond(null, 201);
    }
    if (url.includes('/rest/v1/workout_documents') && options.method === 'DELETE') {
      const match = decodeURIComponent(url).match(/path=in\.\((.*)\)/);
      if (!match) remote.clear();
      else for (const path of match[1].split(',').map(value => value.replaceAll('"', ''))) remote.delete(path);
      return respond(null, 204);
    }
    throw new Error('Неожиданный запрос: ' + url);
  };
  return { remote, fetchImpl, uploadCount: () => uploads };
}

const docs = [
  { path: 'people/fedor', data: { activeBlock: 'b2' } },
  { path: 'people/fedor/blocks/b2', data: { n: 2, status: 'active' } },
];

test('пустое облако получает записи телефона; потом изменения ассистента скачиваются', async () => {
  const server = fakeServer();
  const sync = createSync({ url: 'https://test', key: 'public', storage: fakeStorage(), fetchImpl: server.fetchImpl });
  const first = await sync.sync(docs);
  assert.equal(first.length, 2);
  assert.deepEqual(server.remote.get('people/fedor'), { activeBlock: 'b2' });
  assert.equal(server.uploadCount(), 1);

  server.remote.set('people/fedor/blocks/b3', { n: 3, status: 'active' });
  const second = await sync.sync(docs);
  assert.equal(second.length, 3);
  assert.deepEqual(second.find(d => d.path.endsWith('b3')).data, { n: 3, status: 'active' });
  assert.equal(server.uploadCount(), 1);
});

test('локальная правка отправляется отдельно и не затирает новый блок ассистента', async () => {
  const server = fakeServer(docs);
  const storage = fakeStorage();
  const sync = createSync({ url: 'https://test', key: 'public', storage, fetchImpl: server.fetchImpl });
  await sync.sync(docs);
  server.remote.set('people/fedor/blocks/b3', { n: 3 });
  sync.markPending(['people/fedor']);
  const changed = [{ path: 'people/fedor', data: { activeBlock: 'b2', name: 'Фёдор' } }];
  const result = await sync.sync(changed);
  assert.deepEqual(server.remote.get('people/fedor'), { activeBlock: 'b2', name: 'Фёдор' });
  assert.equal(result.some(d => d.path.endsWith('b3')), true);
});

test('загрузка файла заменяет облачный набор и удаляет лишние документы', async () => {
  const server = fakeServer(docs);
  const sync = createSync({ url: 'https://test', key: 'public', storage: fakeStorage(), fetchImpl: server.fetchImpl });
  await sync.sync(docs);
  sync.markReplace();
  await sync.sync([docs[0]]);
  assert.deepEqual([...server.remote.keys()], ['people/fedor']);
});
