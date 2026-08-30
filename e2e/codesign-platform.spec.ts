import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test.skip(
  process.platform !== 'darwin' || process.env.ZHILIU_PLATFORM_CODESIGN !== '1',
  'macOS 连续两次构建的代码签名标识需在持有稳定自签证书的构建机上核对',
);

test('两次连续 macOS 构建的代码签名标识保持一致', async () => {
  const appPath = path.join(repoRoot, 'release/mac/知流.app');
  const { stdout: first } = await execFileAsync('codesign', ['-dv', '--verbose=4', appPath], {
    cwd: repoRoot,
  });
  const authority = /^Authority=(.*)$/m.exec(first)?.[1];
  const identifier = /^Identifier=(.*)$/m.exec(first)?.[1];
  expect(authority).toBeTruthy();
  expect(authority).not.toMatch(/ad hoc/i);
  expect(identifier).toBeTruthy();

  await execFileAsync('node', ['scripts/pack.mjs', '--mac'], { cwd: repoRoot, env: process.env });
  const { stdout: second } = await execFileAsync('codesign', ['-dv', '--verbose=4', appPath], {
    cwd: repoRoot,
  });
  expect(/^Authority=(.*)$/m.exec(second)?.[1]).toBe(authority);
  expect(/^Identifier=(.*)$/m.exec(second)?.[1]).toBe(identifier);
});
