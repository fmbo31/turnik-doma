// Хранилище на localStorage: замена документной базе артефакта claude.ai.
// Тот же минимальный интерфейс, который использует страница:
//   db.doc(path)     -> { onSnapshot(cb), update(patch), set(data) }
//   db.collection(p) -> { onSnapshot(cb), get() }
// Снапшоты: документ — { exists, data() }, коллекция — { docs: [{ id, data() }] }.
// Плоский формат { docs: [{ path, data }] } — общий для seed.json, копии и выгрузки
// со старой страницы: его же принимает importAll и отдаёт exportAll.

const LS_KEY = 'workout.db.v1';

const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export function createDb(storage, { onChange = () => {}, onReplace = () => {} } = {}) {
  let state = {};
  try { state = JSON.parse(storage.getItem(LS_KEY) || '{}') || {}; } catch { state = {}; }

  const listeners = new Set();

  const persist = () => storage.setItem(LS_KEY, JSON.stringify(state));

  const docSnap = path => ({ exists: state[path] !== undefined, data: () => clone(state[path]) });

  const colSnap = path => {
    const prefix = path + '/';
    return {
      docs: Object.keys(state)
        .filter(k => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
        .sort()
        .map(k => ({ id: k.slice(prefix.length), data: () => clone(state[k]) })),
    };
  };

  function emit(l) {
    try { l.cb(l.kind === 'doc' ? docSnap(l.path) : colSnap(l.path)); }
    catch (e) { if (l.errCb) l.errCb(e); else console.error(e); }
  }
  const notifyAll = () => { for (const l of [...listeners]) emit(l); };

  function replaceState(docs) {
    const next = {};
    for (const d of docs) next[d.path] = clone(d.data);
    state = next;
    persist();
  }

  function subscribe(kind, path, cb, errCb) {
    const l = { kind, path, cb, errCb };
    listeners.add(l);
    queueMicrotask(() => { if (listeners.has(l)) emit(l); });
    return () => listeners.delete(l);
  }

  const api = {
    doc(path) {
      return {
        onSnapshot: (cb, errCb) => subscribe('doc', path, cb, errCb),
        update(patch) {
          if (state[path] === undefined) {
            const e = new Error('Нет документа: ' + path);
            e.code = 'invalid_argument';
            return Promise.reject(e);
          }
          const next = clone(patch);
          if (patch.entries && state[path].entries) next.entries = { ...state[path].entries, ...clone(patch.entries) };
          state[path] = { ...state[path], ...next };
          persist(); onChange([path]); notifyAll();
          return Promise.resolve();
        },
        set(data) {
          state[path] = clone(data);
          persist(); onChange([path]); notifyAll();
          return Promise.resolve();
        },
      };
    },
    collection(path) {
      return {
        onSnapshot: (cb, errCb) => subscribe('col', path, cb, errCb),
        get: () => Promise.resolve(colSnap(path)),
      };
    },
    isEmpty: () => Object.keys(state).length === 0,
    docCount: () => Object.keys(state).length,
    exportAll() {
      return {
        app: 'workout', version: 1, exportedAt: new Date().toISOString(),
        docs: Object.keys(state).sort().map(path => ({ path, data: clone(state[path]) })),
      };
    },
    validateImport(json) {
      if (!json || !Array.isArray(json.docs)) throw new Error('В файле нет списка docs');
      for (const d of json.docs) {
        if (!d || typeof d.path !== 'string' || !d.path.startsWith('people/')) throw new Error('Странный путь в копии: ' + (d && d.path));
        if (!d.data || typeof d.data !== 'object') throw new Error('Нет данных у документа: ' + d.path);
      }
      return json.docs.length;
    },
    importAll(json) {
      api.validateImport(json);
      replaceState(json.docs);
      onReplace(); notifyAll();
      return Object.keys(state).length;
    },
    replaceAll(docs) {
      api.validateImport({ docs });
      replaceState(docs);
      notifyAll();
      return Object.keys(state).length;
    },
    // Подхват изменений, внесённых другой вкладкой этого же браузера.
    reload() {
      try { state = JSON.parse(storage.getItem(LS_KEY) || '{}') || {}; } catch { state = {}; }
      notifyAll();
    },
  };
  return api;
}

export function openDb(hooks) {
  let storage = null;
  try { storage = globalThis.localStorage; } catch { storage = null; }
  if (!storage) return Promise.resolve(null);
  const db = createDb(storage, hooks);
  try {
    globalThis.addEventListener?.('storage', e => { if (e.key === LS_KEY) db.reload(); });
  } catch { /* старые браузеры — просто без синхронизации вкладок */ }
  return Promise.resolve(db);
}
