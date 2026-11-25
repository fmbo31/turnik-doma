import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'turnik-doma-pages-'));
const repo = join(temp, 'repo');
const run = (command, args) => execFileSync(command, args, { stdio: 'inherit' });

try {
  run('git', ['clone', 'https://github.com/fmbo31/turnik-doma.git', repo]);
  run('git', ['-C', repo, 'checkout', '-B', 'main']);
  for (const entry of readdirSync(repo, { withFileTypes: true })) {
    if (entry.name !== '.git') rmSync(join(repo, entry.name), { recursive: true, force: true });
  }
  cpSync(source, repo, {
    recursive: true,
    filter: path => !path.split(/[\\/]/).some(part => ['node_modules', '__pycache__'].includes(part)) && !path.endsWith('.pyc'),
  });
  run('git', ['-C', repo, 'add', '-A']);
  const diff = spawnSync('git', ['-C', repo, 'diff', '--cached', '--quiet'], { stdio: 'inherit' });
  if (diff.status === 0) {
    console.log('Изменений для публикации нет.');
  } else if (diff.status === 1) {
    run('git', ['-C', repo, 'commit', '-m', 'Обновление приложения']);
    run('git', ['-C', repo, 'push', '-u', 'origin', 'main']);
  } else {
    throw new Error('Не получилось проверить изменения перед публикацией.');
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
