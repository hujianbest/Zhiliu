import { access, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, lstatSync, readlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

if (process.platform !== 'darwin') {
  process.exit(0);
}

const sourceApp = path.join(root, 'node_modules/electron/dist/Electron.app');
const brandedApp = path.join(root, 'release/dev/知流.app');
const stampPath = path.join(root, 'release/dev/.electron-version');
const icns = path.join(root, 'build/icon.icns');
const version = JSON.parse(await readFile(path.join(root, 'node_modules/electron/package.json'), 'utf8')).version;
const frameworkLink = path.join(
  brandedApp,
  'Contents/Frameworks/Electron Framework.framework/Resources',
);

function bundleIsHealthy() {
  if (!existsSync(brandedApp) || !existsSync(frameworkLink)) {
    return false;
  }
  try {
    if (!lstatSync(frameworkLink).isSymbolicLink()) {
      return false;
    }
    return !readlinkSync(frameworkLink).startsWith('/');
  } catch {
    return false;
  }
}

await access(sourceApp);
await mkdir(path.dirname(brandedApp), { recursive: true });

const stamp = existsSync(stampPath) ? (await readFile(stampPath, 'utf8')).trim() : '';
if (stamp !== version || !bundleIsHealthy()) {
  await rm(brandedApp, { recursive: true, force: true });
  execFileSync('ditto', [sourceApp, brandedApp]);
  await writeFile(stampPath, `${version}\n`, 'utf8');
}

function setString(plist, key, value) {
  try {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist]);
  } catch {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Add :${key} string ${value}`, plist]);
  }
}

await access(icns);
const brandedPlist = path.join(brandedApp, 'Contents/Info.plist');
setString(brandedPlist, 'CFBundleName', '知流');
setString(brandedPlist, 'CFBundleDisplayName', '知流');
setString(brandedPlist, 'CFBundleIdentifier', 'com.zhiliu.desktop.dev');
await copyFile(icns, path.join(brandedApp, 'Contents/Resources/electron.icns'));
execFileSync('touch', [brandedApp]);
try {
  execFileSync(
    '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',
    ['-f', brandedApp],
  );
} catch {
  // Launch Services refresh is best-effort; Dock still reads the bundle name.
}

const sourcePlist = path.join(sourceApp, 'Contents/Info.plist');
setString(sourcePlist, 'CFBundleName', '知流');
setString(sourcePlist, 'CFBundleDisplayName', '知流');
await copyFile(icns, path.join(sourceApp, 'Contents/Resources/electron.icns'));
