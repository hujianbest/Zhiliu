import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * Chromium's macOS floor for a given Electron major, taken from
 * https://www.electronjs.org/docs/latest/tutorial/support
 * rather than chosen by this project. When Electron is bumped, the test in
 * e2e/platform-floors.spec.ts forces this table to be re-checked against that page.
 */
const MACOS_FLOOR_BY_ELECTRON_MAJOR = {
  32: '11.0',
  33: '11.0',
  34: '11.0',
  35: '11.0',
  36: '12.0',
  37: '12.0',
  38: '12.0',
  39: '12.0',
  40: '12.0',
};

const WINDOWS_FLOOR_BY_ELECTRON_MAJOR = {
  32: '10',
  33: '10',
  34: '10',
  35: '10',
  36: '10',
  37: '10',
  38: '10',
  39: '10',
  40: '10',
};

export function readInstalledElectronVersion() {
  const pkg = require(path.join(root, 'node_modules/electron/package.json'));
  return String(pkg.version);
}

export function electronMajor(version = readInstalledElectronVersion()) {
  const major = Number.parseInt(String(version).split('.')[0] ?? '', 10);
  if (!Number.isInteger(major) || major < 1) {
    throw new Error(`无法解析 Electron 版本: ${version}`);
  }
  return major;
}

export function macOSMinimum(version = readInstalledElectronVersion()) {
  const major = electronMajor(version);
  const floor = MACOS_FLOOR_BY_ELECTRON_MAJOR[major];
  if (!floor) {
    throw new Error(
      `Electron ${major} 的 macOS 下界尚未录入。请对照 https://www.electronjs.org/docs/latest/tutorial/support 更新 scripts/platform-floors.mjs`,
    );
  }
  return floor;
}

export function windowsMinimum(version = readInstalledElectronVersion()) {
  const major = electronMajor(version);
  const floor = WINDOWS_FLOOR_BY_ELECTRON_MAJOR[major];
  if (!floor) {
    throw new Error(
      `Electron ${major} 的 Windows 下界尚未录入。请对照 https://www.electronjs.org/docs/latest/tutorial/support 更新 scripts/platform-floors.mjs`,
    );
  }
  return floor;
}

export function knownMacOSFloorForMajor(major) {
  return MACOS_FLOOR_BY_ELECTRON_MAJOR[major];
}
