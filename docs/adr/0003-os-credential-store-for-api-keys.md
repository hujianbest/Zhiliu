# API keys live in the OS credential store

An API key that lands in a Markdown note, a preference file inside the Vault, a generation trace, a crash payload, or Git history is a secret that will be copied, backed up, and published with the rest of the user's knowledge. Model endpoints and model names are not secrets; the key is. The two are stored apart.

Production writes keys through a `CredentialStore` into Windows Credential Manager or macOS Keychain (via `keytar`, service name `zhiliu`). The main end-to-end suite never talks to the real store: when `ZHILIU_E2E=1`, a file-backed fake adapter under the test user-data directory stands in. A thin opt-in contract test (`ZHILIU_PLATFORM_CREDENTIALS=1`) is the only place the OS store is exercised.

Non-secret model settings (Base URL, model name, which roles are filled) live in the application user-data `preferences.json`, not in the Vault.

## Considered Options

- **Encrypt the key into `preferences.json` with Electron `safeStorage`.** The ciphertext still lives in a file the user will copy, and the API is a blob rather than a named OS credential. Rejected for the Vault-adjacent file and for a weaker match to the product rule.
- **Environment variables as the saved configuration.** They are the test seam for the fake OpenAI server (`ZHILIU_OPENAI_BASE_URL` / `ZHILIU_OPENAI_API_KEY`) and must not be treated as the user's saved model roles, or the unconfigured-state tests become tautologies.

## Consequences

- Saving an empty API Key field leaves the previously stored key in place; the renderer never echoes a stored key back into the form.
- Callers that later write traces, logs, exports, or crash reports must read keys only from `CredentialStore` and must never serialize them.
- Packaged builds need `keytar`'s native module; the fake adapter is not a production fallback.
