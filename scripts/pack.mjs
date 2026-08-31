import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as packApp } from 'electron-builder';
import {
  electronMajor,
  macOSMinimum,
  readInstalledElectronVersion,
  windowsMinimum,
} from './platform-floors.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = new Set(process.argv.slice(2));
const dirOnly = args.has('--dir');
const explicitWin = args.has('--win');
const explicitMac = args.has('--mac');
const explicitLinux = args.has('--linux');
const anyExplicit = explicitWin || explicitMac || explicitLinux;
const wantWin = explicitWin || (!anyExplicit && process.platform === 'win32');
const wantMac = explicitMac || (!anyExplicit && process.platform === 'darwin');
const wantLinux = explicitLinux || (!anyExplicit && process.platform === 'linux');

if (wantMac && process.platform !== 'darwin') {
  console.error('macOS 安装包必须在 macOS 上构建并签名（ADR-0010）。Linux 交叉编译无法保持稳定的代码签名标识。');
  process.exit(1);
}

const identity = process.env.ZHILIU_CODESIGN_IDENTITY || process.env.CSC_NAME || undefined;
const certFile = process.env.CSC_LINK;

if (wantMac && !dirOnly) {
  if (!identity && !certFile) {
    console.error(
      '拒绝 ad-hoc 签名。请在构建机登录钥匙串中安装稳定的自签证书，并设置 ZHILIU_CODESIGN_IDENTITY 或 CSC_LINK。流程见 docs/codesign-certificate.md（ADR-0010）。',
    );
    process.exit(1);
  }
}

if (process.platform !== 'darwin' || dirOnly) {
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
}

const electronVersion = readInstalledElectronVersion();
const macFloor = macOSMinimum(electronVersion);
const winFloor = windowsMinimum(electronVersion);
const meta = {
  electronVersion,
  electronMajor: electronMajor(electronVersion),
  macOSMinimum: macFloor,
  windowsMinimum: winFloor,
  source: 'https://www.electronjs.org/docs/latest/tutorial/support',
};

await mkdir(path.join(root, 'dist'), { recursive: true });
await writeFile(path.join(root, 'dist/packaging-meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

await writeFile(
  path.join(root, 'docs/supported-platforms.md'),
  `# 最低支持系统

这些下界不是知流自己挑选的版本号，而是当前依赖的 Electron **${electronVersion}**（大版本 ${electronMajor(electronVersion)}）所捆绑的 Chromium 声明的平台底线。取值由 \`scripts/platform-floors.mjs\` 在打包时从已安装的 \`electron\` 包读出，并对照 [Electron 支持的平台](https://www.electronjs.org/docs/latest/tutorial/support) 维护映射。

| 平台 | 最低版本 |
| --- | --- |
| macOS | ${macFloor}（写入打包产物的 \`LSMinimumSystemVersion\`） |
| Windows | Windows ${winFloor} |
| Linux | 以当前 Electron 大版本的官方说明为准 |

Bump Electron 大版本时，若映射表没有该大版本，打包会失败，必须先打开上述支持页面核对 Chromium 下界再更新映射。不要在 \`electron-builder.yml\` 或 Info.plist 里手写一个与 Electron 脱钩的版本号。
`,
  'utf8',
);

const packOptions = {
  projectDir: root,
  config: {
    mac: {
      minimumSystemVersion: macFloor,
      ...(identity ? { identity } : {}),
    },
  },
};

if (wantMac) {
  packOptions.mac = dirOnly ? ['dir'] : ['dmg', 'zip'];
}
if (wantWin) {
  packOptions.win = dirOnly ? ['dir'] : ['nsis', 'zip'];
}
if (wantLinux) {
  packOptions.linux = dirOnly ? ['dir'] : ['dir', 'AppImage'];
}

await packApp(packOptions);
