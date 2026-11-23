import test from 'node:test'; import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isComplete} from './logic.js';
const seed = JSON.parse(readFileSync(new URL('./seed/seed.json', import.meta.url), 'utf8'));
const byPath = Object.fromEntries(seed.docs.map(d => [d.path, d.data]));
const blocks = seed.docs.filter(d => /^people\/\w+\/blocks\/\w+$/.test(d.path));
test('люди указывают на активный блок', () => {
  for (const p of ['fedor', 'olya']) {
    const person = byPath[`people/${p}`];
    assert.ok(person, p);
    const b = byPath[`people/${p}/blocks/${person.activeBlock}`];
    assert.equal(b.status, 'active');
  }
});
test('упражнения корректны', () => {
  for (const {path, data} of blocks) for (const t of ['A', 'B']) for (const ex of data.plan[t]) {
    assert.ok(ex.exId && ex.name && ex.how, path + ' ' + ex.exId);
    assert.ok(ex.sets > 0 && ex.target > 0, path + ' ' + ex.exId);
    assert.ok(['reps', 'sec'].includes(ex.unit));
  }
});
test('сессии соответствуют порядку и полные', () => {
  for (const d of seed.docs.filter(d => d.path.includes('/sessions/'))) {
    const blockPath = d.path.split('/sessions/')[0];
    const b = byPath[blockPath];
    assert.equal(d.path.endsWith('/s' + d.data.index), true);
    assert.equal(d.data.type, b.order[d.data.index - 1]);
    assert.equal(isComplete(b.plan[d.data.type], d.data), true, d.path);
    for (const e of Object.values(d.data.entries)) assert.ok(['easy','ok','hard','pain'].includes(e.feel));
  }
  assert.equal(seed.docs.filter(d => d.path.startsWith('people/fedor/blocks/b1/sessions/')).length, 4);
  assert.equal(seed.docs.filter(d => d.path.startsWith('people/olya/blocks/b1/sessions/')).length, 4);
});
test('колени: блок 2', () => {
  const ids = p => ['A','B'].flatMap(t => byPath[`people/${p}/blocks/b2`].plan[t].map(e => e.exId));
  assert.ok(!ids('fedor').includes('lunge') && !ids('fedor').includes('squat'));
  assert.ok(ids('olya').includes('lunge'));
  const sq = byPath['people/olya/blocks/b2'].plan.B.find(e => e.exId === 'squat');
  assert.equal(sq.target, 22);
});
