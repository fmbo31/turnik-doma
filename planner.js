const PULLING_CORE = new Set(['hang', 'neg', 'aus']);
const KNEE_LOAD = new Set(['lunge', 'squat', 'wall_sit']);

const CATALOG = {
  bridge: {
    exId: 'bridge', name: 'Ягодичный мостик', sets: 2, target: 15, unit: 'reps', perSide: false,
    how: 'Лёжа на спине, стопы у таза. Поднять таз до прямой линии колени–плечи, наверху сжать ягодицы на 2 секунды.',
  },
  wide_pushup: {
    exId: 'wide_pushup', name: 'Отжимания с широкой постановкой рук', sets: 2, target: 8, unit: 'reps', perSide: false,
    how: 'Ладони чуть шире плеч, корпус прямой, локти примерно под 45°. Движение без боли в плечах и запястьях.',
  },
  hip_hinge: {
    exId: 'hip_hinge', name: 'Наклон с прямой спиной', sets: 2, target: 12, unit: 'reps', perSide: false,
    how: 'Ноги на ширине таза, колени слегка мягкие. Таз назад, корпус наклоняется с нейтральной спиной; вверх за счёт ягодиц.',
  },
  bird_dog: {
    exId: 'bird_dog', name: 'Птица-собака', sets: 2, target: 8, unit: 'reps', perSide: true,
    how: 'Стоя на четвереньках, вытянуть противоположные руку и ногу. Таз и поясница не поворачиваются, движение медленное.',
  },
  split_squat: {
    exId: 'split_squat', name: 'Приседание в выпаде на месте', sets: 2, target: 8, unit: 'reps', perSide: true,
    how: 'Ноги в шаге, корпус вертикален, переднее колено над стопой. Опускаться на комфортную глубину без боли.',
  },
  close_pushup: {
    exId: 'close_pushup', name: 'Отжимания с узкой постановкой рук', sets: 2, target: 8, unit: 'reps', perSide: false,
    how: 'Ладони примерно на ширине плеч, локти движутся вдоль корпуса. Можно делать с колен, корпус остаётся прямым.',
  },
  dead_bug: {
    exId: 'dead_bug', name: 'Мёртвый жук', sets: 2, target: 8, unit: 'reps', perSide: true,
    how: 'Лёжа на спине, поясница прижата. Медленно выпрямлять противоположные руку и ногу, не отрывая поясницу от пола.',
  },
};

const VARIETY = {
  pushup: 'wide_pushup',
  bridge: 'hip_hinge',
  side_plank: 'bird_dog',
  lunge: 'split_squat',
  bench_dip: 'close_pushup',
  wall_sit: 'hip_hinge',
  squat: 'split_squat',
  leg_raise: 'dead_bug',
  plank: 'bird_dog',
};

const cloneExercise = ex => ({ ...ex });

function entriesFor(sessions, type, exId) {
  return sessions
    .filter(s => (s.type || s.orderType) === type)
    .map(s => ({ ...s.entries?.[exId], index: s.index, blockN: s.blockN, type: s.type || s.orderType }))
    .filter(e => e.done && e.feel)
    .sort((a, b) => (a.blockN || 0) - (b.blockN || 0) || a.index - b.index);
}

function fullCompletion(entry, ex) {
  return entry.done.length >= ex.sets && entry.done.slice(0, ex.sets).every(n => n >= ex.target);
}

function increased(ex) {
  const next = cloneExercise(ex);
  if ((ex.unit === 'sec' ? ex.target >= 60 : ex.target >= 20) && ex.sets < 4) next.sets += 1;
  else next.target += ex.unit === 'sec' ? 5 : 1;
  return next;
}

function decreased(ex) {
  const next = cloneExercise(ex);
  next.target = ex.unit === 'sec' ? Math.max(5, ex.target - 5) : Math.max(1, ex.target - 1);
  return next;
}

function bannedFromHistory(history) {
  const banned = new Set();
  for (const s of history) {
    for (const [exId, entry] of Object.entries(s.entries || {})) {
      if (entry.feel !== 'pain') continue;
      banned.add(exId);
      if (/колен/i.test(entry.where || '') && KNEE_LOAD.has(exId)) {
        for (const id of [...KNEE_LOAD, 'split_squat']) banned.add(id);
      }
    }
  }
  return banned;
}

function noChangeReason(entries, ex) {
  if (!entries.length) return 'Записей пока нет — оставляем исходную нагрузку.';
  if (entries.length < 2) return 'Для прибавки нужно больше записей.';
  if (entries.some(e => e.feel === 'hard')) return 'Была отметка «тяжело» — не прибавляем.';
  const lastTwo = entries.slice(-2);
  if (lastTwo.every(e => e.feel === 'easy') && !lastTwo.every(e => fullCompletion(e, ex))) {
    return 'Было легко, но план выполнен не полностью — пока не прибавляем.';
  }
  return 'По последним записям оснований для прибавки нет.';
}

function analyseExercise(ex, type, sessions, history, options, usedIds) {
  const before = cloneExercise(ex);
  const entries = entriesFor(sessions.map(s => ({ ...s, orderType: type })), type, ex.exId);
  const previousEntries = entriesFor(
    history.filter(s => s.blockN === options.blockNumber - 1).map(s => ({ ...s, orderType: type })),
    type,
    ex.exId,
  );
  const pain = entries.find(e => e.feel === 'pain');
  const base = { type, exId: ex.exId, name: ex.name, before, entries };

  if (pain) {
    const kneePain = /колен/i.test(pain.where || '') && KNEE_LOAD.has(ex.exId);
    if (kneePain && !usedIds.has('bridge')) {
      return { ...base, after: cloneExercise(CATALOG.bridge), kind: 'replace', reason: 'Боль в колене — заменяем на ягодичный мостик.' };
    }
    return {
      ...base,
      after: null,
      kind: 'remove',
      reason: kneePain
        ? 'Боль в колене — упражнение убрано; мостик уже есть в этой тренировке.'
        : `Боль${pain.where ? `: ${pain.where}` : ''} — упражнение убрано, безопасную замену нужно подобрать отдельно.`,
    };
  }

  const last = entries.at(-1);
  const hardBefore = previousEntries.at(-1)?.feel === 'hard';
  if (last?.feel === 'hard' && (hardBefore || options.conservative)) {
    return {
      ...base,
      after: decreased(ex),
      kind: 'decrease',
      reason: options.conservative
        ? 'Щадящий режим: после «тяжело» немного снижаем нагрузку.'
        : 'Было тяжело в этом и прошлом блоке — немного снижаем нагрузку.',
    };
  }

  const altId = VARIETY[ex.exId];
  if (options.variety && altId && !PULLING_CORE.has(ex.exId) && !entries.some(e => e.feel === 'hard') && !usedIds.has(altId) && !options.banned.has(altId)) {
    return {
      ...base,
      after: cloneExercise(CATALOG[altId]),
      kind: 'replace',
      reason: 'Для разнообразия заменяем вспомогательное упражнение; нагрузка — стартовая для нового варианта.',
    };
  }

  if (!options.conservative && entries.length >= 2) {
    const lastTwo = entries.slice(-2);
    if (lastTwo.every(e => e.feel === 'easy' && fullCompletion(e, ex))) {
      return { ...base, after: increased(ex), kind: 'increase', reason: 'Два последних раза было легко, план выполнен полностью.' };
    }
    if (ex.unit === 'reps' && entries.every(e => e.feel === 'ok' && fullCompletion(e, ex))) {
      return { ...base, after: increased(ex), kind: 'increase', reason: 'Во всех записях блока «норм», план выполнен полностью.' };
    }
  }

  return { ...base, after: cloneExercise(ex), kind: 'same', reason: noChangeReason(entries, ex) };
}

export function planNextBlock({ block, sessions, history = [], length = block.length, conservative = false, variety = false, startedAt = null }) {
  const nextLength = length === 6 ? 6 : 4;
  const options = { blockNumber: block.n, conservative, variety, banned: bannedFromHistory(history) };
  const analysis = [];
  const plan = {};

  for (const type of ['A', 'B']) {
    const usedIds = new Set((block.plan[type] || []).map(ex => ex.exId));
    const rows = (block.plan[type] || []).map(ex => analyseExercise(ex, type, sessions, history, options, usedIds));
    for (const row of rows) if (row.after) usedIds.add(row.after.exId);
    analysis.push(...rows);
    plan[type] = rows.map(row => row.after).filter(Boolean);
  }

  return {
    analysis,
    block: {
      n: block.n + 1,
      status: 'active',
      length: nextLength,
      order: Array.from({ length: nextLength }, (_, i) => i % 2 ? 'B' : 'A'),
      startedAt,
      plan,
    },
  };
}
