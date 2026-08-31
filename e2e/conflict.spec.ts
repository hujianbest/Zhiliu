import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { launchZhiliu } from './helpers/launch.js';

test.describe.configure({ mode: 'serial' });

test('应用内与外部同时修改时两份措辞都保留，冲突副本不进检索', async () => {
  const session = await launchZhiliu();
  try {
    const note = await session.window.evaluate(async () =>
      window.zhiliu.notes.save({
        quotation: '同一段引文。',
        thought: '应用内最初的想法。',
      }),
    );

    const original = await readFile(note.path, 'utf8');
    await writeFile(note.path, original.replace('应用内最初的想法。', '外部编辑器同时写下的想法。'), 'utf8');
    await expect
      .poll(async () => {
        const listed = await session.window.evaluate(async () => window.zhiliu.notes.list());
        return listed[0]?.thought;
      })
      .toBe('外部编辑器同时写下的想法。');

    await session.window.evaluate(async (id) => {
      await window.zhiliu.notes.save({
        id,
        quotation: '同一段引文。',
        thought: '应用内同时写下的另一份想法。',
        baseQuotation: '同一段引文。',
        baseThought: '应用内最初的想法。',
      });
    }, note.id);

    const disk = await readFile(note.path, 'utf8');
    expect(disk).toContain('外部编辑器同时写下的想法。');
    expect(disk).not.toContain('应用内同时写下的另一份想法。');
    const conflictRaw = await readFile(note.path.replace(/\.md$/, '.conflict.md'), 'utf8');
    expect(conflictRaw).toContain('应用内同时写下的另一份想法。');
    expect(conflictRaw).not.toContain('外部编辑器同时写下的想法。');

    await session.window.getByRole('button', { name: '思想', exact: true }).click();
    const conflicts = session.window.getByRole('list', { name: '冲突副本' });
    await expect(conflicts.getByText('应用内同时写下的另一份想法。')).toBeVisible();
    await expect(conflicts.getByRole('button', { name: '保留知识库中的版本' })).toBeVisible();
    await expect(conflicts.getByRole('button', { name: '保留应用内的版本' })).toBeVisible();

    const hitsIncoming = await session.window.evaluate(
      async (q) => window.zhiliu.search.query(q, { mode: 'keyword' }),
      '应用内同时写下的另一份想法',
    );
    expect(hitsIncoming.some((hit) => hit.snippet.includes('应用内同时写下的另一份想法'))).toBeFalsy();
    const hitsDisk = await session.window.evaluate(
      async (q) => window.zhiliu.search.query(q, { mode: 'keyword' }),
      '外部编辑器同时写下的想法',
    );
    expect(hitsDisk.some((hit) => hit.snippet.includes('外部编辑器同时写下的想法'))).toBeTruthy();
  } finally {
    await session.close();
  }
});
