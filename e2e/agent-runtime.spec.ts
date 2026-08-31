import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchZhiliu } from './helpers/launch.js';

test.describe.configure({ mode: 'serial' });

test('手动分析留下七字段留痕，不含凭据，出站只带任务相关摘录', async () => {
  const session = await launchZhiliu();
  const vault = session.vaultPath as string;
  const secret = 'sk-e2e-keep-out-of-trace';
  try {
    await session.window.evaluate(
      async ({ baseUrl, apiKey }) => {
        await window.zhiliu.models.save({
          fast: { baseUrl, model: 'fake-fast', apiKey },
          deep: { baseUrl, model: 'fake-deep', apiKey },
        });
        await window.zhiliu.notes.save({
          quotation: '炉火旁值得分析的引文。',
          thought: '分析这些摘录会看到炉火。',
        });
        await window.zhiliu.notes.save({
          quotation: 'XYZZY_CORPUS_DUMP_TOKEN should never leave the machine.',
          thought: 'XYZZY_CORPUS_DUMP_TOKEN is padding, not the analysis task.',
        });
      },
      { baseUrl: session.fakeOpenAI.baseUrl, apiKey: secret },
    );

    await session.window.getByRole('button', { name: '开始分析' }).click();
    await expect(session.window.getByText('分析完成')).toBeVisible();
    await expect(session.window.getByText(/假分析/)).toBeVisible();

    const dir = path.join(vault, '.zhiliu', 'traces');
    const names = (await readdir(dir)).filter((name) => name.endsWith('.json'));
    expect(names.length).toBe(1);
    const raw = await readFile(path.join(dir, names[0]), 'utf8');
    expect(raw).not.toContain(secret);
    expect(raw).not.toContain('apiKey');
    expect(raw).not.toContain('Authorization');
    const trace = JSON.parse(raw) as {
      taskType: string;
      model: string;
      promptVersion: string;
      sourceIds: unknown;
      timestamp: string;
      usage: unknown;
      result: string;
    };
    expect(trace.taskType).toBe('analyze');
    expect(trace.model).toBe('fake-fast');
    expect(trace.promptVersion).toBe('builtin-v1');
    expect(Array.isArray(trace.sourceIds)).toBeTruthy();
    expect(trace.timestamp).toMatch(/^\d{4}-/);
    expect(trace.usage).toEqual(
      expect.objectContaining({
        promptTokens: expect.any(Number),
        completionTokens: expect.any(Number),
        estimated: true,
      }),
    );
    expect(trace.result).toContain('假分析');

    const chat = session.fakeOpenAI.requests.filter((req) => req.url?.endsWith('/chat/completions')).at(-1);
    expect(chat).toBeTruthy();
    const body = JSON.stringify(chat?.body ?? {});
    expect(body).toContain('炉火旁值得分析的引文');
    expect(body).not.toContain('XYZZY_CORPUS_DUMP_TOKEN');
    expect(body).not.toContain(secret);
  } finally {
    await session.close();
  }
});
