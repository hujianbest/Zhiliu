import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import matter from 'gray-matter';
import { launchZhiliu } from './helpers/launch.js';

test.describe.configure({ mode: 'serial' });

test('应用内编辑保存；外部改动无需重启即反映；缺标识列为需要修复且不换新标识', async () => {
  const session = await launchZhiliu();
  const vault = session.vaultPath as string;
  try {
    const created = await session.window.evaluate(async () =>
      window.zhiliu.notes.save({
        quotation: '炉边的原句。',
        thought: '应用内先写下的想法。',
      }),
    );

    await session.window.getByRole('button', { name: '思想', exact: true }).click();
    await expect(session.window.getByRole('list', { name: '全部笔记' }).getByText('应用内先写下的想法。')).toBeVisible();
    await session.window.getByRole('button', { name: '编辑' }).click();
    const editor = session.window.getByRole('dialog', { name: '编辑笔记' });
    await expect(editor).toBeVisible();
    await editor.getByLabel('想法').fill('应用内改过的想法。');
    await editor.getByRole('button', { name: '保存' }).click();
    await expect(editor).toBeHidden();
    await expect(session.window.getByRole('list', { name: '全部笔记' }).getByText('应用内改过的想法。')).toBeVisible();
    expect(await readFile(created.path, 'utf8')).toContain('应用内改过的想法。');

    await writeFile(
      created.path,
      (await readFile(created.path, 'utf8')).replace('应用内改过的想法。', '外部编辑器改过的想法。'),
      'utf8',
    );
    await expect(session.window.getByRole('list', { name: '全部笔记' }).getByText('外部编辑器改过的想法。')).toBeVisible({
      timeout: 8_000,
    });
    const afterExternal = await session.window.evaluate(async (q) => window.zhiliu.search.query(q, { mode: 'keyword' }), '外部编辑器改过的想法');
    expect(afterExternal.some((hit) => hit.noteId === created.id)).toBeTruthy();

    const parsed = matter(await readFile(created.path, 'utf8'));
    const originalId = String(parsed.data.id);
    expect(originalId).toBe(created.id);
    delete parsed.data.id;
    await writeFile(created.path, matter.stringify(parsed.content, parsed.data), 'utf8');

    const broken = session.window.getByRole('list', { name: '需要修复' });
    await expect(broken.getByText('缺少稳定标识')).toBeVisible({ timeout: 8_000 });
    const listed = await session.window.evaluate(async () => window.zhiliu.notes.list());
    expect(listed.some((note) => note.id === originalId)).toBeFalsy();
    const missingHits = await session.window.evaluate(async (q) => window.zhiliu.search.query(q, { mode: 'keyword' }), '外部编辑器改过的想法');
    expect(missingHits.some((hit) => hit.noteId === originalId)).toBeFalsy();

    const duplicatePath = path.join(vault, 'notes', 'duplicate-id.md');
    await mkdir(path.join(vault, 'notes'), { recursive: true });
    await writeFile(
      duplicatePath,
      `---
id: 22222222-2222-2222-2222-222222222222
kind: thought_note
quotation: 重复标识甲。
thought: 重复标识探针甲。
created: 2026-01-01T00:00:00.000Z
updated: 2026-01-01T00:00:00.000Z
---
`,
      'utf8',
    );
    await writeFile(
      path.join(vault, 'notes', 'duplicate-id-b.md'),
      `---
id: 22222222-2222-2222-2222-222222222222
kind: thought_note
quotation: 重复标识乙。
thought: 重复标识探针乙。
created: 2026-01-01T00:00:00.000Z
updated: 2026-01-01T00:00:00.000Z
---
`,
      'utf8',
    );
    await expect(broken.getByText('标识重复')).toHaveCount(2, { timeout: 8_000 });
    const dupHits = await session.window.evaluate(async (q) => window.zhiliu.search.query(q, { mode: 'keyword' }), '重复标识探针甲');
    expect(dupHits.some((hit) => hit.snippet.includes('重复标识探针甲'))).toBeFalsy();

    await broken.getByRole('listitem').filter({ hasText: '缺少稳定标识' }).getByRole('button', { name: '修复' }).click();
    const repair = session.window.getByRole('dialog', { name: '修复笔记' });
    await expect(repair).toBeVisible();
    await repair.getByLabel('稳定标识').fill(originalId);
    await repair.getByRole('button', { name: '修复' }).click();
    await expect(repair).toBeHidden();
    await expect(session.window.getByRole('list', { name: '全部笔记' }).getByText('外部编辑器改过的想法。')).toBeVisible();
    const restored = await session.window.evaluate(async () => window.zhiliu.notes.list());
    expect(restored.some((note) => note.id === originalId)).toBeTruthy();
    expect(restored.some((note) => note.id !== originalId && note.path === created.path)).toBeFalsy();
  } finally {
    await session.close();
  }
});
