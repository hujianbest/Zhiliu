import { expect, test } from '@playwright/test';

test('ONNX 多语言 Embedding 可以编码一段中英文本', async () => {
  test.skip(
    process.env.ZHILIU_PLATFORM_EMBEDDINGS !== '1',
    '主套件使用假 Embedding 适配器；此薄合约测试需显式开启',
  );
  const { OnnxEmbeddingStore } = await import('../src/main/embeddings.ts');
  const store = new OnnxEmbeddingStore();
  const vector = await store.embed('probe', 'The hearth 炉火');
  expect(Array.isArray(vector)).toBeTruthy();
  expect(vector.length).toBeGreaterThan(0);
  expect(vector.every((value) => typeof value === 'number')).toBeTruthy();
});
