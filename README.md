# Zhiliu

知流是本地优先的桌面知识工作台。阅读产生自己的想法，想法积成主题，主题变成可以诚实署上自己名字的文章。

## 开发

```bash
npm install
npm test          # 打包当前平台的未打包目录，再用 Playwright 驱动该二进制
npm run dev       # 按当前 Electron 重编原生模块后启动（未打包）
npm run rebuild:native  # 只重编 better-sqlite3 / keytar，供本机 Node 与 Electron ABI 不一致时使用
npm run pack:dir  # 只产出供测试用的安装布局
npm run pack      # 当前平台的可分发产物
```

Windows 与 macOS 的安装包、安全警告与自签证书流程见 `docs/packaging.md` 与 `docs/codesign-certificate.md`。首个版本没有付费签名、公证与自动更新，**不是**消费级顺畅的安装体验。

端到端断言范围见 `docs/e2e-assertions.md`。最低支持系统见 `docs/supported-platforms.md`（随 Electron 大版本推导，不手写死）。
