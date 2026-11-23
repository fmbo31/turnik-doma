// Проверка страницы в настоящем браузере (Chromium через playwright-core).
// Запуск из корня проекта; по умолчанию сервер на 127.0.0.1:8123 должен отдавать app/.
// Для проверки опубликованного сайта задай SMOKE_BASE:
//   PW_PATH="$LOCALAPPDATA/Temp/wrk-smoke/node_modules/playwright-core/index.mjs" node app/tools/smoke.mjs
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const base = process.env.SMOKE_BASE || 'http://127.0.0.1:8123';
const { chromium } = await import(pathToFileURL(process.env.PW_PATH).href);

let failed = false;
const check = (name, ok, extra = '') => {
  console.log((ok ? '✓' : '✗') + ' ' + name + (extra ? ' — ' + extra : ''));
  if (!ok) failed = true;
};

const exe = process.env.PW_EXE; // например …\ms-playwright\chromium-1223\chrome-win\chrome.exe
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(base + '/index.html', { waitUntil: 'commit' });
await page.waitForSelector('.ex.open', { timeout: 30000 });

// 1. Стартовые данные подложились, тренировка на экране
check('стартовые данные: заголовок', (await page.textContent('.head h1')).includes('Тренировка'));
check('стартовые данные: блок и номер', (await page.textContent('.head .sub')).includes('Блок 2'));

// 2. Первое упражнение раскрыто, карточки все на месте
const openName = await page.$eval('.ex.open .name', el => el.textContent);
check('раскрыто первое упражнение', openName === 'Вис на турнике', openName);
check('карточек в тренировке А: 5', (await page.$$('.ex')).length === 5);

// 3. Записать упражнение: «норм» + «Записать»
await page.click('.ex.open button[data-feel="ok"]');
await page.click('#save-hang');
await page.waitForFunction(() => document.querySelectorAll('.ex.done').length === 1, null, { timeout: 4000 });
check('запись появилась и карточка позеленела', true);
const right = await page.$eval('.ex.done .plan', el => el.textContent);
check('в строке записи план и ощущение', right.includes('20 · 20 · 20 сек') && right.includes('норм'), right);

// 4. Данные ушли в хранилище браузера
const docCount = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('workout.db.v1'))).length);
check('хранилище заполнено (14+ документов)', docCount >= 14, docCount + ' документов');
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('workout.db.v1'))['people/fedor/blocks/b2/sessions/s1']?.entries?.hang?.done?.join(','));
check('в хранилище результат виса', saved === '20,20,20', saved);

// 5. Подсказка про копию видна
check('подсказка «Копия ещё не сохранялась»', (await page.textContent('#backup-hint')).includes('Копия ещё не сохранялась'));

// 6. Переключение человека
await page.click('#p-olya');
await page.waitForFunction(() => document.querySelectorAll('.ex').length === 5, null, { timeout: 4000 });
const olyaSub = await page.textContent('.head .sub');
check('Оля: её тренировка А', (await page.textContent('.head h1')).includes('Тренировка') && olyaSub.includes('Блок 2'), olyaSub);
await page.click('#p-fedor');
await page.waitForSelector('.ex.done', { timeout: 4000 });

// 7. Дождались офлайн-копии, затем перезагрузка — записи на месте
await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 30000 });
await page.reload({ waitUntil: 'commit' });
await page.waitForSelector('.head h1', { timeout: 8000 });
await page.waitForSelector('.ex.done', { timeout: 30000 });
check('после перезагрузки запись сохранилась', true);

// 8. Service worker встал (localhost или HTTPS — подходящие адреса для него)
const swCount = await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(rs => rs.length));
check('service worker зарегистрирован', swCount > 0, swCount + ' шт.');

// 9. Старая сохранённая страница не блокирует получение свежей версии.
await page.evaluate(async () => {
  const keys = await caches.keys();
  const cache = await caches.open(keys.find(k => k.startsWith('turdom-')));
  const stale = '<!doctype html><html><body><div id="head"><h1>Загружаю программу…</h1></div><div id="main"></div></body></html>';
  await cache.put('./index.html', new Response(stale, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
});
await page.reload({ waitUntil: 'commit' });
await page.waitForSelector('.ex.done', { timeout: 10000 });
check('при интернете свежая страница заменяет старую копию', true);

// 10. Ошибок в консоли страницы нет
check('в консоли страницы нет ошибок', errors.length === 0, errors.slice(0, 3).join(' | '));

// 11. После отключения сети страница и записи открываются из офлайн-копии
await ctx.setOffline(true);
await page.reload({ waitUntil: 'commit' });
await page.waitForSelector('.ex.done', { timeout: 10000 });
check('без интернета страница и записи открываются', true);

// 12–13. Завершённый блок даёт разбор; принятие создаёт и открывает следующий блок
await page.evaluate(() => {
  const hang = { exId: 'hang', name: 'Вис на турнике', sets: 2, target: 20, unit: 'sec', perSide: false, how: 'Плечи опущены' };
  const entry = { done: [20, 20], feel: 'easy', where: null };
  const db = {
    'people/fedor': { name: 'Фёдор', activeBlock: 'b2' },
    'people/fedor/blocks/b2': { n: 2, status: 'active', length: 2, order: ['A', 'A'], plan: { A: [hang], B: [] } },
    'people/fedor/blocks/b2/sessions/s1': { index: 1, type: 'A', closed: true, entries: { hang: entry } },
    'people/fedor/blocks/b2/sessions/s2': { index: 2, type: 'A', closed: true, entries: { hang: entry } },
  };
  localStorage.setItem('workout.db.v1', JSON.stringify(db));
});
await page.reload({ waitUntil: 'commit' });
await page.waitForSelector('#accept-next', { timeout: 10000 });
const proposal = await page.textContent('#main');
check('завершённый блок: разбор и предложение', proposal.includes('25 сек') && proposal.includes('Принять — начать блок 3'));
await page.click('#accept-next');
await page.waitForFunction(() => {
  const db = JSON.parse(localStorage.getItem('workout.db.v1'));
  return db['people/fedor'].activeBlock === 'b3' && db['people/fedor/blocks/b3']?.plan.A[0].target === 25 && document.querySelector('.head h1')?.textContent.includes('Тренировка');
}, null, { timeout: 10000 });
check('принятие начинает следующий блок', true);

// 14. Даже при ошибке запуска копия сохраняется прямо из памяти браузера.
await page.evaluate(() => {
  document.querySelector('#head h1').textContent = 'Загружаю программу…';
  window.dispatchEvent(new ErrorEvent('error', { message: 'Проверка аварийной копии', error: new Error('Проверка аварийной копии') }));
});
await page.waitForSelector('#retry-load');
const downloadPromise = page.waitForEvent('download');
await page.click('#export-btn');
const download = await downloadPromise;
const backup = JSON.parse(readFileSync(await download.path(), 'utf8'));
check('при ошибке запуска копия содержит записи', backup.docs.some(d => d.path === 'people/fedor/blocks/b3'));

await browser.close();
process.exit(failed ? 1 : 0);
