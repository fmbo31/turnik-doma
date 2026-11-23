// Чистая логика трекера: без DOM и без window.claude, чтобы проверять в node.

export const FEELS = [['easy', 'легко'], ['ok', 'норм'], ['hard', 'тяжело'], ['pain', 'больно']];

// «6 6 5», «6,6,5», «6·6·5», «30+40» → числа по подходам; «3×6» → [6,6,6]; пусто → план.
export function parseDone(text, ex) {
  const t = (text || '').trim();
  if (!t) return Array(ex.sets).fill(ex.target);
  const mult = t.match(/^(\d+)\s*[×x*хХ]\s*(\d+)$/);
  if (mult) {
    const sets = +mult[1], reps = +mult[2];
    return sets > 0 && reps > 0 ? Array(sets).fill(reps) : null;
  }
  if (/-\s*\d/.test(t)) return null;
  const nums = (t.match(/\d+/g) || []).map(Number);
  if (!nums.length || nums.some(n => n <= 0)) return null;
  // Слитые цифры («665» вместо «6 6 5») и лишние подходы — не похоже на правду, просим переписать.
  if (nums.length > ex.sets + 2 || nums.some(n => n > Math.max(3 * ex.target, 10))) return null;
  return nums;
}

// Запись одного упражнения одним обращением к хранилищу; закрытие тренировки — в той же записи.
export function buildSaveWrite(existing, plan, cur, exId, entry, now) {
  const entries = { ...(existing?.entries || {}), [exId]: entry };
  const closes = !existing?.closed && isComplete(plan, { entries });
  const patch = { entries: { [exId]: entry } };
  if (closes) patch.closed = true;
  if (!existing) {
    // patch — на случай, если второй телефон уже создал документ: дописать, а не затереть.
    return { op: 'set', closes, patch, data: { index: cur.index, type: cur.type, startedAt: now, closed: closes, entries: { [exId]: entry } } };
  }
  return { op: 'update', closes, data: patch };
}

const unitSuffix = ex => (ex.unit === 'sec' ? ' сек' : '');

export function formatPlan(ex) {
  let s = `${ex.sets} × ${ex.target}${unitSuffix(ex)}`;
  if (ex.perSide) s += ' (каждая)';
  if (ex.extra) s += ', ' + ex.extra;
  return s;
}

export function formatDone(done, ex) {
  return done.join(' · ') + unitSuffix(ex);
}

// Первая незакрытая тренировка блока по порядку; все закрыты → null.
export function currentSession(block, sessions) {
  const closed = new Set(sessions.filter(s => s.closed).map(s => s.index));
  for (let i = 1; i <= block.length; i++) {
    if (!closed.has(i)) return { index: i, type: block.order[i - 1] };
  }
  return null;
}

export function isComplete(plan, session) {
  const entries = (session && session.entries) || {};
  return plan.every(ex => entries[ex.exId] !== undefined);
}

// Последняя запись упражнения строго раньше текущей тренировки (блок, номер) — для подсказки «в прошлый раз».
export function previousEntry(exId, history, blockN, index) {
  let best = null;
  for (const s of history) {
    const e = s.entries && s.entries[exId];
    if (!e) continue;
    const before = s.blockN < blockN || (s.blockN === blockN && s.index < index);
    if (before && (!best || s.blockN > best.blockN || (s.blockN === best.blockN && s.index > best.index))) best = { ...s, e };
  }
  return best ? best.e : null;
}
