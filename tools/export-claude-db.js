// ВЫГРУЗКА ЗАПИСЕЙ ИЗ СТАРОЙ СТРАНИЦЫ НА claude.ai
//
// Что делает: читает все тренировки из базы артефакта и копирует в буфер
// обмена JSON в формате копии нового приложения. Скачивание из изолированного
// окна Claude запрещено браузером, поэтому текст вставляется в Блокнот и
// сохраняется как workout-копия-ГГГГ-ММ-ДД.json.
//
// Как пользоваться (нужен компьютер, на телефоне неудобно):
//   1. Открой в Chrome страницу артефакта:
//      https://claude.ai/artifact/Twor45NvznXsX6jCe3JyHx
//   2. Нажми F12, вкладка «Console» (Консоль).
//   3. Над консолью в списке «top» выбери адрес frame.claudeusercontent.com.
//   4. Скопируй в консоль весь этот файл целиком и нажми Enter.
//   5. Дождись сообщения «Весь файл скопирован в буфер обмена».
//   6. Вставь текст в Блокнот и сохрани как workout-копия-ГГГГ-ММ-ДД.json.
//   7. Перекинь файл на телефон (мессенджер, почта, кабель) и загрузи
//      в новое приложение кнопкой «Загрузить копию».
//
// Если консоль ругается на pasting code — набери в ней сначала: allow pasting
// и нажми Enter, потом вставляй скрипт.
(async () => {
  const db = await window.claude.use('db');
  if (!db) { console.error('Хранилище артефакта не открылось'); return; }

  // doc().get() у базы артефакта может не быть — тогда слушаем один раз через onSnapshot.
  const snapOf = ref => ref.get ? ref.get() : new Promise((res, rej) => {
    const un = ref.onSnapshot(res, rej);
    setTimeout(() => { try { un(); } catch {} }, 10000);
  });

  const docs = [];
  for (const p of ['fedor', 'olya']) {
    const person = await snapOf(db.doc('people/' + p));
    if (!person.exists) continue;
    docs.push({ path: 'people/' + p, data: person.data() });
    const blocks = await snapOf(db.collection('people/' + p + '/blocks'));
    for (const b of blocks.docs) {
      docs.push({ path: 'people/' + p + '/blocks/' + b.id, data: b.data() });
      const sessions = await snapOf(db.collection('people/' + p + '/blocks/' + b.id + '/sessions'));
      for (const s of sessions.docs) {
        docs.push({ path: 'people/' + p + '/blocks/' + b.id + '/sessions/' + s.id, data: s.data() });
      }
    }
  }

  const payload = JSON.stringify({
    app: 'workout', version: 1,
    exportedFrom: 'claude.ai artifact Twor45NvznXsX6jCe3JyHx',
    exportedAt: new Date().toISOString(),
    docs,
  }, null, 1);

  if (typeof copy === 'function') {
    copy(payload);
    console.log('Готово, документов: ' + docs.length + '. Весь файл скопирован в буфер обмена — вставь его в Блокнот.');
  } else {
    console.log('Скопируй текст следующего сообщения в файл целиком. Документов: ' + docs.length);
    console.log(payload);
  }
})()
