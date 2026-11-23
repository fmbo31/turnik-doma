import { readFileSync, writeFileSync } from 'node:fs';

const indexUrl = new URL('../index.html', import.meta.url);
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

function inline(html, name, source) {
  const open = `// <inline:${name}>`;
  const close = `// </inline:${name}>`;
  const start = html.indexOf(open);
  const end = html.indexOf(close, start + open.length);
  if (start < 0 || end < 0 || html.indexOf(open, start + 1) >= 0 || html.indexOf(close, end + 1) >= 0) {
    throw new Error(`Проверь метки ${open} и ${close} в index.html`);
  }
  return html.slice(0, start + open.length) + '\n' + source.trim() + '\n' + html.slice(end);
}

const original = read('index.html');
let html = original;
for (const name of ['logic.js', 'planner.js', 'store.js']) {
  html = inline(html, name, read(name).replace(/^export /gm, ''));
}
const seed = JSON.stringify(JSON.parse(read('seed/seed.json')), null, 2).replace(/</g, '\\u003c');
html = inline(html, 'seed/seed.json', `const SEED = ${seed};`);

if (process.argv.includes('--check')) {
  if (html !== original) {
    console.error('Встроенные файлы устарели: выполни node app/tools/inline-runtime.mjs');
    process.exitCode = 1;
  } else console.log('Встроенные программа и данные актуальны.');
} else {
  writeFileSync(indexUrl, html);
  console.log('Программа и стартовые данные встроены в app/index.html.');
}
