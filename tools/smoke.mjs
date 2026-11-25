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

await page.goto(base + '/index.html?sync=off', { waitUntil: 'commit' });
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

// 10–16. Два упражнения подряд и независимые черновики двух людей.
await page.evaluate(() => {
  localStorage.removeItem('workout.db.v1');
  localStorage.removeItem('workout.drafts.v1');
  localStorage.setItem('workout.person', 'fedor');
});
await page.reload({ waitUntil: 'commit' });
await page.waitForSelector('.ex.open');
await page.click('.ex.open button[data-feel="ok"]');
await page.click('#save-hang');
await page.waitForFunction(() => document.querySelector('.ex.open .name')?.textContent === 'Негативные подтягивания');
await page.fill('#done-neg', '4 4 4');
await page.click('.ex.open button[data-feel="easy"]');
await page.click('#save-neg');
await page.waitForFunction(() => document.querySelector('.ex.open .name')?.textContent === 'Отжимания от пола');
const twoEntries = await page.evaluate(() => {
  const session = JSON.parse(localStorage.getItem('workout.db.v1'))['people/fedor/blocks/b2/sessions/s1'];
  return Object.keys(session.entries).sort().join(',') === 'hang,neg' && session.entries.neg.done.join(',') === '4,4,4' && document.querySelectorAll('.ex.done').length === 2;
});
check('после второго упражнения сохранены обе записи', twoEntries);
check('после второго открывается третье, а не первое', (await page.textContent('.ex.open .name')) === 'Отжимания от пола');

await page.click('[data-toggle="neg"]');
await page.fill('#done-neg', '5 5 5');
await page.click('.ex.open button[data-feel="ok"]');
await page.click('#save-neg');
await page.waitForFunction(() => document.querySelector('.ex.open .name')?.textContent === 'Отжимания от пола');
check('редактирование одного упражнения не затирает другое', await page.evaluate(() => {
  const entries = JSON.parse(localStorage.getItem('workout.db.v1'))['people/fedor/blocks/b2/sessions/s1'].entries;
  return entries.hang.done.join(',') === '20,20,20' && entries.neg.done.join(',') === '5,5,5';
}));
const entriesDownloadPromise = page.waitForEvent('download');
await page.click('#export-btn');
const entriesDownload = await entriesDownloadPromise;
const entriesBackup = JSON.parse(readFileSync(await entriesDownload.path(), 'utf8'));
check('файл-копия содержит обе записи', ['hang', 'neg'].every(id => entriesBackup.docs.find(d => d.path === 'people/fedor/blocks/b2/sessions/s1').data.entries[id]));

await page.fill('#done-pushup', '13 14 15');
await page.click('.ex.open button[data-feel="easy"]');
await page.click('#p-olya');
await page.waitForSelector('.ex.open');
await page.fill('#done-hang', '11 12');
await page.click('.ex.open button[data-feel="hard"]');
await page.click('#p-fedor');
await page.waitForFunction(() => document.querySelector('.ex.open .name')?.textContent === 'Отжимания от пола');
check('при возврате сохраняются карточка, числа и ощущение', await page.evaluate(() => document.querySelector('#done-pushup')?.value === '13 14 15' && document.querySelector('[data-feel="easy"]')?.getAttribute('aria-pressed') === 'true' && document.querySelectorAll('.ex.done').length === 2));
await page.reload({ waitUntil: 'commit' });
await page.waitForSelector('.ex.open');
check('черновик Фёдора сохраняется после перезагрузки', await page.evaluate(() => document.querySelector('.ex.open .name')?.textContent === 'Отжимания от пола' && document.querySelector('#done-pushup')?.value === '13 14 15'));
await page.click('#p-olya');
await page.waitForSelector('.ex.open');
check('черновик Оли отдельный и тоже сохраняется', await page.evaluate(() => document.querySelector('#done-hang')?.value === '11 12' && document.querySelector('[data-feel="hard"]')?.getAttribute('aria-pressed') === 'true'));
await page.click('#p-fedor');
await page.waitForFunction(() => document.querySelector('.ex.open .name')?.textContent === 'Отжимания от пола');

await page.click('[data-toggle="hang"]');
await page.click('#timer-btn');
await page.waitForTimeout(1200);
await page.click('#p-olya');
await page.waitForSelector('.ex.open');
await page.click('#p-fedor');
await page.waitForFunction(() => document.querySelector('.ex.open .name')?.textContent === 'Вис на турнике');
check('переключение останавливает подход и сохраняет секунды', await page.evaluate(() => (document.querySelector('#done-hang')?.value.trim().length || 0) > 0));
await page.click('[data-toggle="pushup"]');
check('секундомер не стирает черновик другого упражнения', (await page.inputValue('#done-pushup')) === '13 14 15');
await page.click('.ex.open button[data-feel="pain"]');
await page.fill('#where-pushup', 'левое плечо');
await page.click('#p-olya');
await page.waitForSelector('.ex.open');
await page.click('#p-fedor');
await page.waitForFunction(() => document.querySelector('.ex.open .name')?.textContent === 'Отжимания от пола');
check('«больно» и место боли сохраняются при переключении', await page.evaluate(() => document.querySelector('[data-feel="pain"]')?.getAttribute('aria-pressed') === 'true' && document.querySelector('#where-pushup')?.value === 'левое плечо'));

await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('workout.db.v1'));
  db['people/fedor/blocks/b2/sessions/s1'].closed = true;
  localStorage.setItem('workout.db.v1', JSON.stringify(db));
});
await page.reload({ waitUntil: 'commit' });
await page.waitForSelector('.ex.open');
await page.fill('#done-hang', '31 32');
await page.click('.ex.open button[data-feel="easy"]');
await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('workout.db.v1'));
  db['people/fedor/blocks/b2/sessions/s1'].closed = false;
  localStorage.setItem('workout.db.v1', JSON.stringify(db));
});
await page.reload({ waitUntil: 'commit' });
await page.waitForFunction(() => document.querySelector('.ex.open .name')?.textContent === 'Отжимания от пола');
const draftA = await page.inputValue('#done-pushup');
await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('workout.db.v1'));
  db['people/fedor/blocks/b2/sessions/s1'].closed = true;
  localStorage.setItem('workout.db.v1', JSON.stringify(db));
});
await page.reload({ waitUntil: 'commit' });
await page.waitForSelector('.ex.open');
const draftB = await page.inputValue('#done-hang');
check('черновики тренировок А и Б не смешиваются', draftA === '13 14 15' && draftB === '31 32');
await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('workout.db.v1'));
  db['people/fedor/blocks/b2/sessions/s1'].closed = false;
  localStorage.setItem('workout.db.v1', JSON.stringify(db));
});
await page.reload({ waitUntil: 'commit' });
await page.waitForFunction(() => document.querySelector('.ex.open .name')?.textContent === 'Отжимания от пола');

// 17. Ошибок в консоли страницы нет
check('в консоли страницы нет ошибок', errors.length === 0, errors.slice(0, 3).join(' | '));

// 18–19. После отключения сети страница, записи и черновики открываются из офлайн-копии
await ctx.setOffline(true);
await page.reload({ waitUntil: 'commit' });
await page.waitForSelector('.ex.done', { timeout: 10000 });
check('без интернета страница и записи открываются', true);
check('без интернета черновик не пропадает', (await page.inputValue('#done-pushup')) === '13 14 15');

await page.click('.ex.open button[data-feel="ok"]');
await page.click('#save-pushup');
await page.waitForFunction(() => document.querySelector('.ex.open .name')?.textContent === 'Ягодичный мостик');
await page.click('.ex.open button[data-feel="ok"]');
await page.click('#save-bridge');
await page.waitForFunction(() => document.querySelector('.ex.open .name')?.textContent === 'Боковая планка');
await page.click('.ex.open button[data-feel="ok"]');
await page.click('#save-side_plank');
await page.waitForSelector('#next-btn');
check('без интернета тренировка закрывается со всеми пятью записями', await page.evaluate(() => {
  const session = JSON.parse(localStorage.getItem('workout.db.v1'))['people/fedor/blocks/b2/sessions/s1'];
  return session.closed && Object.keys(session.entries).length === 5;
}));
await page.click('#next-btn');
await page.waitForSelector('.ex.open');
check('после закрытия открывается тренировка Б', (await page.textContent('.head h1')).includes('Тренировка Б'));

// 20–21. Завершённый блок даёт разбор; принятие создаёт и открывает следующий блок
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

// 22. Даже при ошибке запуска копия сохраняется прямо из памяти браузера.
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
