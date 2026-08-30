import { expect, test } from '@playwright/test';

test('操作系统凭据库可以存取 API Key', async () => {
  test.skip(
    process.env.ZHILIU_PLATFORM_CREDENTIALS !== '1',
    '主套件使用假凭据适配器；此薄合约测试需显式开启',
  );
  const { OsCredentialStore } = await import('../src/main/credentials.ts');
  const store = new OsCredentialStore();
  const account = `zhiliu-e2e-${Date.now()}`;
  await store.set(account, 'sk-platform-roundtrip');
  expect(await store.get(account)).toBe('sk-platform-roundtrip');
  await store.delete(account);
  expect(await store.get(account)).toBeNull();
});
