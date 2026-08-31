import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const branded = path.join(root, 'release/dev/知流.app/Contents/MacOS/Electron');
const fallback = path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const cli = path.join(root, 'node_modules/electron/cli.js');

const child =
  process.platform === 'darwin'
    ? spawn(existsSync(branded) ? branded : fallback, [root], { stdio: 'inherit', env: process.env })
    : spawn(process.execPath, [cli, root], { stdio: 'inherit', env: process.env });

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
