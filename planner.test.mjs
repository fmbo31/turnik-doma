import test from 'node:test';
import assert from 'node:assert/strict';
import { planNextBlock } from './planner.js';

const ex = (exId = 'pushup', overrides = {}) => ({
  exId,
  name: exId,
  sets: 2,
  target: 10,
  unit: 'reps',
  perSide: false,
  how: 'Техника',
  ...overrides,
});

const blockFor = (a, b = []) => ({
  n: 2,
  status: 'active',
  length: 4,
  order: ['A', 'B', 'A', 'B'],
  startedAt: '2026-10-26',
  plan: { A: a, B: b },
});

const session = (index, type, exercises, feel, overrides = {}) => ({
  index,
  type,
  closed: true,
  entries: Object.fromEntries(exercises.map(item => [item.exId, {
    done: Array(item.sets).fill(item.target),
    feel,
    where: null,
    ...overrides,
  }])),
});

const build = (block, sessions, options = {}) => planNextBlock({ block, sessions, startedAt: '2026-11-21', ...options });

test('два последних «легко» прибавляют один повтор', () => {
  const item = ex();
  const sessions = [session(1, 'A', [item], 'easy'), session(3, 'A', [item], 'easy')];
  const result = build(blockFor([item]), sessions);
  assert.equal(result.analysis[0].after.target, 11);
  assert.equal(result.analysis[0].kind, 'increase');
});

test('два «легко» прибавляют пять секунд', () => {
  const item = ex('hang', { target: 20, unit: 'sec' });
  const sessions = [session(1, 'A', [item], 'easy'), session(3, 'A', [item], 'easy')];
  assert.equal(build(blockFor([item]), sessions).analysis[0].after.target, 25);
});

test('при высоком числе повторов добавляется подход', () => {
  const item = ex('squat', { target: 20 });
  const sessions = [session(1, 'A', [item], 'easy'), session(3, 'A', [item], 'easy')];
  const next = build(blockFor([item]), sessions).analysis[0].after;
  assert.equal(next.sets, 3);
  assert.equal(next.target, 20);
});

test('«легко» при неполном выполнении не повышает нагрузку', () => {
  const item = ex();
  const sessions = [
    session(1, 'A', [item], 'easy', { done: [10, 10] }),
    session(3, 'A', [item], 'easy', { done: [10, 8] }),
  ];
  const row = build(blockFor([item]), sessions).analysis[0];
  assert.equal(row.after.target, 10);
  assert.equal(row.kind, 'same');
});

test('«норм» во всех полных записях прибавляет повтор', () => {
  const item = ex();
  const sessions = [session(1, 'A', [item], 'ok'), session(3, 'A', [item], 'ok')];
  assert.equal(build(blockFor([item]), sessions).analysis[0].after.target, 11);
});

test('смешанные «норм» и «легко» оставляют план', () => {
  const item = ex();
  const sessions = [session(1, 'A', [item], 'ok'), session(3, 'A', [item], 'easy')];
  assert.equal(build(blockFor([item]), sessions).analysis[0].kind, 'same');
});

test('«тяжело» оставляет нагрузку', () => {
  const item = ex();
  const sessions = [session(1, 'A', [item], 'ok'), session(3, 'A', [item], 'hard')];
  const row = build(blockFor([item]), sessions).analysis[0];
  assert.equal(row.after.target, 10);
  assert.equal(row.kind, 'same');
});

test('«тяжело» два блока подряд снижает нагрузку', () => {
  const item = ex();
  const sessions = [session(3, 'A', [item], 'hard')];
  const history = [{ blockN: 1, index: 3, type: 'A', entries: { pushup: { done: [10, 10], feel: 'hard' } } }];
  const row = build(blockFor([item]), sessions, { history }).analysis[0];
  assert.equal(row.after.target, 9);
  assert.equal(row.kind, 'decrease');
});

test('щадящий режим снижает нагрузку после одного «тяжело»', () => {
  const item = ex('plank', { target: 45, unit: 'sec' });
  const sessions = [session(3, 'A', [item], 'hard')];
  assert.equal(build(blockFor([item]), sessions, { conservative: true }).analysis[0].after.target, 40);
});

test('щадящий режим не повышает даже после двух «легко»', () => {
  const item = ex();
  const sessions = [session(1, 'A', [item], 'easy'), session(3, 'A', [item], 'easy')];
  assert.equal(build(blockFor([item]), sessions, { conservative: true }).analysis[0].kind, 'same');
});

test('боль в колене заменяет выпады мостиком', () => {
  const item = ex('lunge', { perSide: true });
  const sessions = [session(3, 'A', [item], 'pain', { where: 'правое колено' })];
  const row = build(blockFor([item]), sessions).analysis[0];
  assert.equal(row.after.exId, 'bridge');
  assert.equal(row.kind, 'replace');
});

test('неизвестная боль убирает упражнение без выдуманной замены', () => {
  const item = ex('pushup');
  const sessions = [session(3, 'A', [item], 'pain', { where: 'плечо' })];
  const result = build(blockFor([item]), sessions);
  assert.equal(result.analysis[0].after, null);
  assert.equal(result.analysis[0].kind, 'remove');
  assert.deepEqual(result.block.plan.A, []);
});

test('одна запись не даёт автоматической прибавки', () => {
  const item = ex();
  const sessions = [session(3, 'A', [item], 'easy')];
  assert.equal(build(blockFor([item]), sessions).analysis[0].kind, 'same');
});

test('разнообразие меняет вспомогательное упражнение, но не ядро подтягивания', () => {
  const hang = ex('hang', { unit: 'sec', target: 20 });
  const pushup = ex('pushup');
  const sessions = [
    session(1, 'A', [hang, pushup], 'easy'),
    session(3, 'A', [hang, pushup], 'easy'),
  ];
  const result = build(blockFor([hang, pushup]), sessions, { variety: true });
  assert.equal(result.analysis.find(row => row.exId === 'hang').after.exId, 'hang');
  assert.equal(result.analysis.find(row => row.exId === 'pushup').after.exId, 'wide_pushup');
});

test('старая боль в колене запрещает похожий новый вариант', () => {
  const item = ex('squat');
  const sessions = [session(1, 'A', [item], 'ok'), session(3, 'A', [item], 'ok')];
  const history = [{ blockN: 1, index: 3, type: 'A', entries: { lunge: { done: [10, 10], feel: 'pain', where: 'колено' } } }];
  const row = build(blockFor([item]), sessions, { history, variety: true }).analysis[0];
  assert.equal(row.after.exId, 'squat');
});

test('можно выбрать блок из шести тренировок', () => {
  const item = ex();
  const result = build(blockFor([item]), [], { length: 6 });
  assert.equal(result.block.length, 6);
  assert.deepEqual(result.block.order, ['A', 'B', 'A', 'B', 'A', 'B']);
  assert.equal(result.block.n, 3);
  assert.equal(result.block.startedAt, '2026-11-21');
});

test('расчёт не меняет исходный блок и записи', () => {
  const item = ex();
  const block = blockFor([item]);
  const sessions = [session(1, 'A', [item], 'easy'), session(3, 'A', [item], 'easy')];
  const beforeBlock = JSON.stringify(block);
  const beforeSessions = JSON.stringify(sessions);
  build(block, sessions, { variety: true });
  assert.equal(JSON.stringify(block), beforeBlock);
  assert.equal(JSON.stringify(sessions), beforeSessions);
});
