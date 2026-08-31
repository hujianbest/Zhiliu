# 06: Windows 与 macOS 安装包

**What to build:** 用户可以直接安装 Windows 与 macOS 的发行包，不必搭建开发环境。首个版本没有付费开发者签名与公证，但 macOS 产物必须用一个稳定的自签证书签名：这既把首次启动的失败降级为用户能绕过的对话框，也让知识库的文件夹访问授权在版本之间保持有效。文档必须如实说明两个平台的安全警告与用户需要采取的操作，不能暗示这是消费级顺畅的安装体验。

本票排在依赖链前段而不是末尾，是因为它承载的恰恰是这个项目最该早暴露的风险：未签名分发、自签证书、原生模块从归档解出（ADR-0008、ADR-0010）。它的实质前置只有票 03 的系统凭据读取与票 04 的一次基础导入；等到创作链全部完成再第一次打包，等于把发布风险压到最后一层。

**Blocked by:** 03, 04

**Status:** ready-for-human

**Starting failing test:** 对打包产物执行冒烟测试：安装、启动、打开文件、读取系统凭据、完成一次基础导入，断言全部通过；断言 macOS 产物的代码签名标识在两次连续构建之间保持一致，而非随内容哈希变化。

**Demo acceptance:** 需要。两个平台的安全警告文案与实际弹窗必须人工核对。

- [ ] Windows 与 macOS 各产出可安装的发行包
- [ ] macOS 产物用一个稳定的自签证书签名，而非纯 ad-hoc 签名，使文件夹访问授权在版本之间保持有效（ADR-0010）
- [ ] 测试断言签名标识在连续两次构建之间不变
- [ ] 该证书作为长期项目机密被保管在构建机的登录钥匙串中，并有一份仓库之外的离线加密备份；文档记录导出流程、恢复路径，以及丢失它会导致所有用户重新授权（ADR-0010）
- [x] `LSMinimumSystemVersion` 取所用 Electron 大版本声明的 macOS 下界，而非写死某个版本号（ADR-0005）
- [x] 原生模块被正确地从打包归档中解出，端到端测试在打包产物上验证其可加载
- [x] 打包应用的冒烟测试覆盖安装、启动、打开文件、读取系统凭据与一次基础导入
- [ ] 文档说明 macOS 会出现「无法验证开发者」及其绕过步骤，并经人工验证
- [x] 文档说明 Windows 每次发版都会重建 SmartScreen 信誉，且 Windows 11 的 Smart App Control 可能直接阻止执行
- [x] 文档不暗示这是消费级顺畅的安装体验
- [x] 首个版本不包含付费签名、公证与自动更新

## Comments

- 2026-08-30 AUTO 在 Linux 云环境落地 `electron-builder`：`npm run pack` / `pack:dir` / `pack:win` / `pack:mac`。Playwright 启动 `release/linux-unpacked/zhiliu`；冒烟覆盖启动、打开 EPUB、读取已保存凭据、导入；`keytar` 从 asar 解出；`EnableNodeCliInspectArguments` fuse 保持开启。`pack:mac` 在缺少 `ZHILIU_CODESIGN_IDENTITY` / `CSC_LINK` 时拒绝 ad-hoc。证书导出/恢复流程见 `docs/codesign-certificate.md`，私钥不进仓库。Windows NSIS 与 macOS 自签 DMG 未在本环境实际产出；连续签名标识测试在 `e2e/codesign-platform.spec.ts` 于非 macOS 上 skip；Gatekeeper 弹窗的人工核对未做。见 `docs/packaging.md`、A-13。
- 2026-08-31 剩余项是 Windows NSIS、macOS 自签 DMG、证书保管与 Gatekeeper/SmartScreen 人验，状态从 ready-for-agent 改为 ready-for-human。
