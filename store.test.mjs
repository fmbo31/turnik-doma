import test from 'node:test'; import assert from 'node:assert/strict';
import { createDb } from './store.js';

const tick = () => new Promise(r => setTimeout(r, 0));
const fakeStorage = () => {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
  };
};

test('документ: подписка, set, update, отписка', async () => {
  const db = await createDb(fakeStorage());
  assert.equal(db.isEmpty(), true);
  const seen = [];
  const unsub = db.doc('people/fedor').onSnapshot(s => seen.push(s.exists ? s.data() : null));
  await tick();
  assert.deepEqual(seen, [null]);
  await db.doc('people/fedor').set({ name: 'Фёдор', activeBlock: 'b2' });
  await tick();
  assert.deepEqual(seen[1], { name: 'Фёдор', activeBlock: 'b2' });
  unsub();
  await db.doc('people/fedor').update({ activeBlock: 'b3' });
  await tick();
  assert.equal(seen.length, 2);
  const snap = await new Promise(r => { db.doc('people/fedor').onSnapshot(r); });
  assert.equal(snap.data().activeBlock, 'b3');
});

test('ошибка обработчика передаётся в обработчик ошибки, а не теряется', async () => {
  const db = createDb(fakeStorage());
  const failure = new Error('Не удалось показать программу');
  const error = await new Promise(resolve => {
    db.doc('people/fedor').onSnapshot(() => { throw failure; }, resolve);
  });
  assert.equal(error, failure);
});

test('data() отдаёт копию: правки снапшота хранилище не портят', async () => {
  const db = createDb(fakeStorage());
  await db.doc('people/fedor').set({ name: 'Фёдор' });
  const snap = await new Promise(r => { db.doc('people/fedor').onSnapshot(r); });
  snap.data().name = 'Испорчено';
  const again = await new Promise(r => { db.doc('people/fedor').onSnapshot(r); });
  assert.equal(again.data().name, 'Фёдор');
});

test('update без документа отклоняется с кодом invalid_argument', async () => {
  const db = createDb(fakeStorage());
  const e = await db.doc('people/fedor').update({ a: 1 }).then(() => null, err => err);
  assert.equal(e.code, 'invalid_argument');
});

test('коллекция: только прямые дочерние документы', async () => {
  const db = createDb(fakeStorage());
  await db.doc('people/fedor/blocks/b1').set({ n: 1 });
  await db.doc('people/fedor/blocks/b1/sessions/s1').set({ index: 1 });
  await db.doc('people/fedor/blocks/b2').set({ n: 2 });
  await db.doc('people/olya').set({ name: 'Оля' });
  const snap = await db.collection('people/fedor/blocks').get();
  assert.deepEqual(snap.docs.map(d => d.id).sort(), ['b1', 'b2']);
  assert.equal(snap.docs.find(d => d.id === 'b1').data().n, 1);
  const events = [];
  const unsub = db.collection('people/fedor/blocks').onSnapshot(s => events.push(s.docs.length));
  await tick();
  await db.doc('people/fedor/blocks/b3').set({ n: 3 });
  await tick();
  assert.deepEqual(events, [2, 3]);
  unsub();
});

test('экспорт/импорт копии, персистентность между экземплярами', async () => {
  const storage = fakeStorage();
  const db = createDb(storage);
  await db.doc('people/fedor').set({ name: 'Фёдор' });
  await db.doc('people/fedor/blocks/b2').set({ n: 2 });
  const dump = db.exportAll();
  assert.equal(dump.docs.length, 2);

  const db2 = createDb(storage); // тот же «браузер»
  assert.equal(db2.docCount(), 2);

  const fresh = createDb(fakeStorage());
  const n = fresh.validateImport(dump);
  assert.equal(n, 2);
  fresh.importAll(dump);
  assert.equal(fresh.docCount(), 2);

  assert.throws(() => fresh.validateImport({}), /docs/);
  assert.throws(() => fresh.validateImport({ docs: [{ path: 'nope/x', data: {} }] }), /путь/);
  assert.throws(() => fresh.validateImport({ docs: [{ path: 'people/x' }] }), /данных/);
});
