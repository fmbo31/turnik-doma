// Служебный скрипт: кладёт файлы приложения в кэш, чтобы «Турник дома»
// открывался без интернета и ставился на главный экран телефона.
// При обновлении приложения подними VERSION — старый кэш сотрётся сам.
const VERSION = 'v8';
const CACHE = 'turdom-' + VERSION;
const SHELL = ['./index.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function freshPage(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(request, { signal: controller.signal });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const cache = await caches.open(CACHE);
    await cache.put('./index.html', response.clone());
    return response;
  } catch {
    const cached = await caches.match('./index.html');
    if (cached) return cached;
    return new Response('Нет связи. Открой страницу ещё раз, когда появится интернет.', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } finally {
    clearTimeout(timeout);
  }
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  // При связи обновляем страницу и её офлайн-копию; через 4 секунды открываем сохранённую.
  if (e.request.mode === 'navigate') {
    e.respondWith(freshPage(e.request));
    return;
  }

  // Дополнительные файлы не нужны при установке копии; кэшируем их после загрузки.
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }))
  );
});
