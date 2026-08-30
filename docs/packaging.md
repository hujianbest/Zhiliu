# 发行包、安全警告与不是消费级安装

知流的首个版本**可以安装**，但**不是**消费级顺畅的安装体验。没有付费的 Apple Developer ID、没有公证、没有 Microsoft Authenticode、没有自动更新。用户会看到操作系统的安全警告；有的环境会直接阻止运行。请按自己的风险判断是否继续。

本仓库用 `electron-builder` 产出 Windows 与 macOS 发行包，配置见 `electron-builder.yml`，入口是 `npm run pack`。Linux 上 `npm run pack:dir` 产出未打包目录，供端到端测试启动与 Electron 安装后相同布局的二进制。

## 明确不包含

- 付费代码签名
- Apple 公证（Notarization）
- 自动更新
- 静默绕过 SmartScreen / Gatekeeper / Smart App Control 的任何技巧

## macOS：「无法验证开发者」

macOS 产物用**稳定的自签证书**签名，而不是完全未签名，也不是纯 ad-hoc 签名（ADR-0010）。完全未签名会得到「已损坏，应移到废纸篓」，界面上没有绕过路径。Ad-hoc 签名每次构建标识都变，文件夹访问授权会在升级后失效。自签把失败降级为用户能绕过的对话框。

首次打开时，系统通常提示**「无法验证开发者」**或「未识别的开发者」。绕过步骤（以当前 macOS 为准，人工发版时必须再核对实际弹窗文案）：

1. 不要双击两次期望它自己好起来。把应用放到「应用程序」文件夹。
2. 在 Finder 中 Control-点击（或右键）应用，选择「打开」，再在对话框里选「打开」。
3. 若仍被拦：打开「系统设置 → 隐私与安全性」，在被拦截记录旁选择仍要打开。
4. 知识库目录的文件夹访问授权在**同一自签证书**的后续版本之间保持有效。若构建机丢失该证书，所有用户都要重新授权。证书保管见 `docs/codesign-certificate.md`。

这不是「已通过 Apple 检查」的体验。文档与发布说明不得改写成「下载即可用」。

`LSMinimumSystemVersion` 由 `scripts/pack.mjs` 按当前 Electron 大版本的 Chromium 下界写入，见 `docs/supported-platforms.md`。

## Windows：SmartScreen 与 Smart App Control

每次发版都会生成新的未签名二进制，**SmartScreen 信誉从零重建**。用户可能看到「Windows 已保护你的电脑」；需要点「更多信息 → 仍要运行」。

Windows 11 的 **Smart App Control** 可能**直接阻止执行**，而不是给出可点的对话框。这不是知流能在未付费签名的前提下修复的问题。发布说明必须写明：若 SAC 处于强制模式，本应用可能无法启动。

NSIS 安装包同样未签名，安装过程中也会触发同类警告。

## 原生模块

`keytar`、以及后续的 `onnxruntime-node` / `better-sqlite3` 必须从 asar 归档解出后再加载（`asarUnpack`）。端到端测试在打包产物上检查这些模块的解出路径，避免「开发模式能跑、安装包里 dlopen 失败」。

## 在本仓库构建

```bash
npm run build
npm run pack:dir    # 当前平台的未打包目录，供测试
npm run pack        # 当前平台的可分发产物
npm run pack:win    # 仅 Windows（建议在 Windows 构建机上）
npm run pack:mac    # 仅 macOS；无稳定自签证书会拒绝构建
```

Linux 云环境可以产出 Linux 目录/AppImage，并以此作为 Playwright 的打包二进制测试缝。它**不能**代替 Windows 安装包与 macOS 自签产物的人工核对。两个平台的安全警告文案与实际弹窗必须由人在真实机器上核对后，把日期与截图结论写回票 06。
