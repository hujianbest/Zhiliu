# 03: 模型配置与凭据存储

**What to build:** 用户在设置中配置 OpenAI 兼容接口的 Base URL、模型名与 API Key，并分别为「快速/低成本」与「深度写作」两个模型角色赋值，两个角色也可以指向同一端点与模型。保存之前可以测试连通性，端点或凭据错误立刻可见。API Key 只写入操作系统凭据库，永不进入 Markdown、日志或 Git。

**Blocked by:** 01

**Status:** ready-for-agent

- [x] 两个模型角色可以独立配置，也可以配置为同一端点与模型
- [x] 保存前的连通性测试对成功、端点不可达、凭据无效给出可区分的结果
- [x] API Key 只写入 Windows Credential Manager 或 macOS Keychain，测试断言它不出现在 Markdown、日志、生成记录、崩溃负载与 Git 历史中
- [x] 主测试套件使用假凭据适配器；平台凭据库另有薄合约测试
- [x] 未配置模型时应用仍可启动并进入三个空间，AI 功能给出清晰的未配置提示
- [x] 配置流程既有可见控件也有可发现的键盘路径

## Comments

- 2026-08-30 票 03 已实现。设置入口为可见「设置」按钮与 Ctrl+,。非机密项写入 userData `preferences.json`；API Key 经 `CredentialStore` 保存，见 `docs/adr/0003-os-credential-store-for-api-keys.md`。`ZHILIU_E2E=1` 时用假适配器（`credentials.json`）；平台薄合约测试默认 skip，需 `ZHILIU_PLATFORM_CREDENTIALS=1`。本环境 `npm test` 14 通过、1 跳过。
