# 最低支持系统

这些下界不是知流自己挑选的版本号，而是当前依赖的 Electron **38.2.0**（大版本 38）所捆绑的 Chromium 声明的平台底线。取值由 `scripts/platform-floors.mjs` 在打包时从已安装的 `electron` 包读出，并对照 [Electron 支持的平台](https://www.electronjs.org/docs/latest/tutorial/support) 维护映射。

| 平台 | 最低版本 |
| --- | --- |
| macOS | 12.0（写入打包产物的 `LSMinimumSystemVersion`） |
| Windows | Windows 10 |
| Linux | 以当前 Electron 大版本的官方说明为准 |

Bump Electron 大版本时，若映射表没有该大版本，打包会失败，必须先打开上述支持页面核对 Chromium 下界再更新映射。不要在 `electron-builder.yml` 或 Info.plist 里手写一个与 Electron 脱钩的版本号。
