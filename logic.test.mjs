import test from 'node:test'; import assert from 'node:assert/strict';
import {parseDone, formatPlan, formatDone, currentSession, isComplete} from './logic.js';
const ex = {exId:'aus', name:'Австралийские', sets:3, target:6, unit:'reps', perSide:false, how:''};
const plank = {exId:'side', name:'Боковая планка', sets:2, target:40, unit:'sec', perSide:true, how:''};
test('parseDone', () => {
  assert.deepEqual(parseDone('6 6 5', ex), [6,6,5]);
  assert.deepEqual(parseDone('6,6,5', ex), [6,6,5]);
  assert.deepEqual(parseDone('6·6·5', ex), [6,6,5]);
  assert.deepEqual(parseDone('3×6', ex), [6,6,6]);
  assert.deepEqual(parseDone('3*6', ex), [6,6,6]);
  assert.deepEqual(parseDone('3x6', ex), [6,6,6]);
  assert.deepEqual(parseDone('30+40', plank), [30,40]);
  assert.deepEqual(parseDone('', ex), [6,6,6]);
  assert.deepEqual(parseDone('  ', ex), [6,6,6]);
  assert.equal(parseDone('ок', ex), null);
  assert.equal(parseDone('0', ex), null);
  assert.equal(parseDone('6 -1', ex), null);
});
test('formatPlan', () => {
  assert.equal(formatPlan(ex), '3 × 6');
  assert.equal(formatPlan(plank), '2 × 40 сек (каждая)');
  assert.equal(formatPlan({...ex, extra:'пауза наверху'}), '3 × 6, пауза наверху');
});
test('formatDone', () => {
  assert.equal(formatDone([6,6,5], ex), '6 · 6 · 5');
  assert.equal(formatDone([30,40], plank), '30 · 40 сек');
});
test('currentSession', () => {
  const block = {length:4, order:['A','B','A','B']};
  assert.deepEqual(currentSession(block, []), {index:1, type:'A'});
  assert.deepEqual(currentSession(block, [{index:1, closed:true}]), {index:2, type:'B'});
  assert.deepEqual(currentSession(block, [{index:1, closed:true},{index:2, closed:false}]), {index:2, type:'B'});
  assert.equal(currentSession(block, [1,2,3,4].map(i=>({index:i, closed:true}))), null);
});
test('isComplete', () => {
  assert.equal(isComplete([ex, plank], {entries:{aus:{done:[6]}}}), false);
  assert.equal(isComplete([ex, plank], {entries:{aus:{}, side:{}}}), true);
  assert.equal(isComplete([ex], {}), false);
});
import {buildSaveWrite} from './logic.js';
test('parseDone отсекает неправдоподобное (слитые цифры, лишние подходы)', () => {
  assert.equal(parseDone('665', ex), null);
  assert.equal(parseDone('6 6 6 6 6 6', ex), null);
  assert.deepEqual(parseDone('6 6 6 6 6', ex), [6,6,6,6,6]);
  assert.deepEqual(parseDone('18', {...ex, sets:1}), [18]);
});
test('buildSaveWrite: одна запись с закрытием', () => {
  const plan = [ex, plank];
  const e1 = {done:[6,6,6], feel:'ok'}, e2 = {done:[40,40], feel:'easy'};
  const first = buildSaveWrite(null, plan, {index:1, type:'A'}, 'aus', e1, 'T');
  assert.equal(first.op, 'set'); assert.equal(first.closes, false);
  assert.deepEqual(first.data, {index:1, type:'A', startedAt:'T', closed:false, entries:{aus:e1}});
  const last = buildSaveWrite({index:1, closed:false, entries:{aus:e1}}, plan, {index:1, type:'A'}, 'side', e2, 'T');
  assert.equal(last.op, 'update'); assert.equal(last.closes, true);
  assert.deepEqual(last.data, {entries:{side:e2}, closed:true});
  const edit = buildSaveWrite({index:1, closed:true, entries:{aus:e1, side:e2}}, plan, {index:1, type:'A'}, 'aus', e1, 'T');
  assert.equal(edit.closes, false); assert.deepEqual(edit.data, {entries:{aus:e1}});
  const one = buildSaveWrite(null, [ex], {index:2, type:'B'}, 'aus', e1, 'T');
  assert.equal(one.closes, true); assert.equal(one.data.closed, true);
});
test('buildSaveWrite: при создании есть patch — дописать, если документ уже создан с другого телефона', () => {
  const e1 = {done:[6,6,6], feel:'ok'};
  const first = buildSaveWrite(null, [ex, plank], {index:1, type:'A'}, 'aus', e1, 'T');
  assert.deepEqual(first.patch, {entries:{aus:e1}});
  const one = buildSaveWrite(null, [ex], {index:2, type:'B'}, 'aus', e1, 'T');
  assert.deepEqual(one.patch, {entries:{aus:e1}, closed:true});
});
import {previousEntry} from './logic.js';
test('previousEntry: последняя запись упражнения до текущей тренировки', () => {
  const a = {done:[20,20], feel:'ok'}, b = {done:[25], feel:'easy'}, c = {done:[30,30], feel:'hard'};
  const hist = [
    {blockN:1, index:3, entries:{hang:a}},
    {blockN:1, index:4, entries:{hang:b, plank:c}},
    {blockN:2, index:1, entries:{hang:c}},
    {blockN:2, index:3, entries:{hang:a}},
  ];
  assert.deepEqual(previousEntry('hang', hist, 2, 2), c);
  assert.deepEqual(previousEntry('hang', hist, 2, 1), b);
  assert.deepEqual(previousEntry('plank', hist, 2, 4), c);
  assert.equal(previousEntry('neg', hist, 2, 4), null);
  assert.equal(previousEntry('hang', hist, 1, 3), null);
});
