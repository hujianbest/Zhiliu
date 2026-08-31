import { expect, test } from '@playwright/test';
import { launchZhiliu } from './helpers/launch.js';

const live = Boolean(process.env.ZHILIU_LIVE_OPENAI_BASE_URL && process.env.ZHILIU_LIVE_OPENAI_API_KEY);

test.describe('optional live OpenAI-compatible provider', () => {
  test.skip(!live, 'set ZHILIU_LIVE_OPENAI_BASE_URL and ZHILIU_LIVE_OPENAI_API_KEY to run');

  test('真实服务商连通性探活默认不进确定性 CI', async () => {
    const session = await launchZhiliu();
    try {
      const outcome = await session.window.evaluate(
        async ({ baseUrl, apiKey }) => window.zhiliu.models.probe({ baseUrl, apiKey, role: 'fast' }),
        {
          baseUrl: process.env.ZHILIU_LIVE_OPENAI_BASE_URL as string,
          apiKey: process.env.ZHILIU_LIVE_OPENAI_API_KEY as string,
        },
      );
      expect(outcome.result).toBe('ok');
    } finally {
      await session.close();
    }
  });
});
