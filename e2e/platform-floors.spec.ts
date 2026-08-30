import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  electronMajor,
  knownMacOSFloorForMajor,
  macOSMinimum,
  readInstalledElectronVersion,
} from '../scripts/platform-floors.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('最低 macOS 取自当前 Electron 大版本的 Chromium 下界，而不是手写死的独立版本号', async () => {
  const version = readInstalledElectronVersion();
  const major = electronMajor(version);
  const floor = macOSMinimum(version);

  // Published Chromium floors for the Electron majors we currently ship.
  // Source: https://www.electronjs.org/docs/latest/tutorial/support
  // If this fails after an Electron bump, re-read that page and update the map —
  // do not "fix" the test by writing a version into Info.plist by hand.
  if (major === 38 || major === 39 || major === 40) {
    expect(floor).toBe('12.0');
  } else if (major >= 32 && major <= 35) {
    expect(floor).toBe('11.0');
  } else {
    throw new Error(
      `Electron ${major} 需要对照 https://www.electronjs.org/docs/latest/tutorial/support 更新已知 Chromium 下界`,
    );
  }
  expect(knownMacOSFloorForMajor(major)).toBe(floor);

  const docs = await readFile(path.join(repoRoot, 'docs/supported-platforms.md'), 'utf8');
  expect(docs).toContain(floor);
  expect(docs).toContain(version.split('.')[0] ?? version);
  expect(docs).not.toMatch(/不要改这个数字/);
});
