const SESSION_KEY = 'workout.sync.session';
const PENDING_KEY = 'workout.sync.pending';
const REPLACE_KEY = 'workout.sync.replace';
const INITIALIZED_KEY = 'workout.sync.initialized';

export function createSync({ url, key, storage, fetchImpl = globalThis.fetch.bind(globalThis), now = () => Date.now() }) {
  const read = (name, fallback) => {
    try { return JSON.parse(storage.getItem(name) || 'null') ?? fallback; } catch { return fallback; }
  };
  const write = (name, value) => storage.setItem(name, JSON.stringify(value));
  let session = read(SESSION_KEY, null);
  let pending = new Set(read(PENDING_KEY, []));
  let replace = read(REPLACE_KEY, false);

  async function request(path, { method = 'GET', body, headers = {}, auth = true, activeSession = null } = {}) {
    const token = auth ? (activeSession || await getSession()).access_token : null;
    const response = await fetchImpl(url + path, {
      method,
      headers: {
        apikey: key,
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Supabase ${response.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }

  function saveSession(value) {
    session = { ...value, expires_at: value.expires_at || Math.floor(now() / 1000) + (value.expires_in || 3600) };
    write(SESSION_KEY, session);
    return session;
  }

  async function getSession() {
    if (session?.access_token && session.expires_at * 1000 > now() + 60000) return session;
    if (session?.refresh_token) {
      const refreshed = await request('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', body: { refresh_token: session.refresh_token }, auth: false,
      });
      return saveSession({ ...session, ...refreshed });
    }
    const created = await request('/auth/v1/signup', { method: 'POST', body: {}, auth: false });
    if (!created.access_token || !created.refresh_token || !created.user?.id) throw new Error('Supabase не создал учётную запись');
    return saveSession(created);
  }

  const downloadDocs = activeSession => request('/rest/v1/workout_documents?select=path,data', { activeSession })
    .then(rows => rows.map(row => ({ path: row.path, data: row.data })));

  async function uploadDocs(docs, activeSession) {
    if (!docs.length) return;
    const updatedAt = new Date(now()).toISOString();
    await request('/rest/v1/workout_documents?on_conflict=user_id,path', {
      method: 'POST',
      activeSession,
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: docs.map(d => ({ user_id: activeSession.user.id, path: d.path, data: d.data, updated_at: updatedAt })),
    });
  }

  async function deleteMissing(before, docs, activeSession) {
    const keep = new Set(docs.map(d => d.path));
    const missing = before.map(d => d.path).filter(path => !keep.has(path));
    if (!missing.length) return;
    const filter = docs.length ? `?path=in.(${missing.map(path => `"${path.replace(/"/g, '\\"')}"`).join(',')})` : '';
    await request('/rest/v1/workout_documents' + encodeURI(filter), { method: 'DELETE', activeSession });
  }

  return {
    markPending(paths) {
      for (const path of paths) pending.add(path);
      write(PENDING_KEY, [...pending]);
    },
    markReplace() {
      replace = true;
      write(REPLACE_KEY, true);
    },
    async sync(localDocs) {
      const activeSession = await getSession();
      const initialized = read(INITIALIZED_KEY, false);
      const before = replace || !initialized ? await downloadDocs(activeSession) : null;
      if (replace) {
        await deleteMissing(before, localDocs, activeSession);
        await uploadDocs(localDocs, activeSession);
      } else if (!initialized && before.length === 0) {
        await uploadDocs(localDocs, activeSession);
      } else if (pending.size) {
        await uploadDocs(localDocs.filter(d => pending.has(d.path)), activeSession);
      }
      const remoteDocs = await downloadDocs(activeSession);
      pending.clear(); replace = false;
      write(PENDING_KEY, []); write(REPLACE_KEY, false); write(INITIALIZED_KEY, true);
      return remoteDocs;
    },
  };
}
