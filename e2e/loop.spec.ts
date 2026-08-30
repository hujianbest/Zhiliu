import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { launchZhiliu } from './helpers/launch.js';

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fireside = path.join(fixtures, 'fireside-notes.epub');
const firesideSentence = '这是一本用于端到端测试的小书。';

test.describe.configure({ mode: 'serial' });

async function configureModels(page: Page, baseUrl: string): Promise<void> {
  await page.evaluate(async (url) => {
    await window.zhiliu.models.save({
      fast: { baseUrl: url, model: 'fake-fast', apiKey: 'e2e-fake-key' },
      deep: { baseUrl: url, model: 'fake-deep', apiKey: 'e2e-fake-key' },
    });
  }, baseUrl);
}

async function serve(pages: Record<string, string>): Promise<{ baseUrl: string; close(): Promise<void> }> {
  const server = http.createServer((req, res) => {
    const body = pages[req.url ?? ''];
    if (!body) {
      res.writeHead(404);
      res.end('missing');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('未能绑定');
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

test('早期贯通：首次运行导入阅读捕获外部编辑检索跳源', async () => {
  const vaultDir = await mkdtemp(path.join(tmpdir(), 'zhiliu-through-'));
  const session = await launchZhiliu({ vaultPath: null, chooseDirectory: vaultDir, chooseFiles: [fireside] });
  try {
    await session.window.getByRole('button', { name: '选择知识库位置' }).click();
    await expect(session.window.getByRole('button', { name: '书库/阅读' })).toBeVisible();
    await session.window.getByRole('button', { name: '导入 EPUB 或 PDF' }).click();
    await session.window.getByRole('button', { name: '炉边小札' }).click();
    const body = session.window.frameLocator('iframe[title="正文"]');
    await expect(body.getByText(firesideSentence)).toBeVisible();
    await body.getByText(firesideSentence).selectText();
    await session.window.getByRole('button', { name: '记下这段' }).click();
    const capture = session.window.getByRole('dialog', { name: '记下这段' });
    await capture.getByLabel('想法').fill('贯通最初的想法。');
    await capture.getByLabel('想法').press('Enter');
    const note = await session.window.evaluate(async () => (await window.zhiliu.notes.list())[0]);
    expect(note?.id).toBeTruthy();
    const raw = await readFile(note!.path, 'utf8');
    await writeFile(note!.path, raw.replace('贯通最初的想法。', '贯通改过的想法。'), 'utf8');
    await expect.poll(async () => {
      const listed = await session.window.evaluate(async () => window.zhiliu.notes.list());
      return listed[0]?.thought;
    }).toBe('贯通改过的想法。');
    await expect.poll(async () => {
      const hits = await session.window.evaluate(async (q) => window.zhiliu.search.query(q, { mode: 'keyword' }), '贯通改过的想法');
      return hits.find((hit) => hit.noteId === note?.id)?.noteId ?? hits[0]?.noteId;
    }).toBe(note?.id);
    const hits = await session.window.evaluate(async (q) => window.zhiliu.search.query(q, { mode: 'keyword' }), '贯通改过的想法');
    expect(hits.find((hit) => hit.noteId === note?.id)?.sourcePosition).toBeTruthy();
    const oldHits = await session.window.evaluate(async (q) => window.zhiliu.search.query(q, { mode: 'keyword' }), '贯通最初的想法');
    expect(oldHits.some((hit) => hit.snippet.includes('贯通最初的想法'))).toBeFalsy();
    await session.window.getByRole('button', { name: '检索', exact: true }).click();
    const search = session.window.getByRole('dialog', { name: '检索' });
    await search.getByRole('searchbox').fill('贯通改过的想法');
    await search.getByRole('list', { name: '检索结果' }).getByRole('button').filter({ hasText: '笔记' }).click();
    await expect(session.window.frameLocator('iframe[title="正文"]').getByText(firesideSentence)).toBeVisible();
  } finally {
    await session.close();
  }
});

test('固定主题在重跑后保留；证据增减会双向改来源', async () => {
  const session = await launchZhiliu();
  try {
    const ids = await session.window.evaluate(async () => {
      const a = await window.zhiliu.notes.save({ quotation: '一。', thought: '青瓷固定主题甲。' });
      const b = await window.zhiliu.notes.save({ quotation: '二。', thought: '青瓷固定主题乙。' });
      const c = await window.zhiliu.notes.save({ quotation: '三。', thought: '青瓷固定主题丙。' });
      return [a.id, b.id, c.id];
    });
    await session.window.evaluate(async () => window.zhiliu.agent.organize());
    const before = await session.window.evaluate(async () => window.zhiliu.workbench.view());
    const topic = before.topics[0];
    expect(topic?.origin).toBe('thought-signal');
    await session.window.evaluate(async (id) => window.zhiliu.workbench.pinTopic(id, true), topic!.id);
    await session.window.evaluate(async () => window.zhiliu.agent.organize());
    const pinned = await session.window.evaluate(async () => window.zhiliu.workbench.view());
    expect(pinned.topics.some((item) => item.id === topic!.id && item.pinned)).toBeTruthy();
    await session.window.evaluate(async (id) => window.zhiliu.notes.save({ id, quotation: '一。', thought: '' }), ids[2]);
    await session.window.evaluate(async () => window.zhiliu.agent.organize());
    const down = await session.window.evaluate(async () => window.zhiliu.workbench.view());
    expect(down.topics.find((item) => item.id === topic!.id)?.origin).toBe('library-discovery');
    await session.window.evaluate(async (id) => window.zhiliu.notes.save({ id, quotation: '一。', thought: '青瓷固定主题丙。' }), ids[2]);
    await session.window.evaluate(async () => window.zhiliu.agent.organize());
    const up = await session.window.evaluate(async () => window.zhiliu.workbench.view());
    expect(up.topics.find((item) => item.id === topic!.id)?.origin).toBe('thought-signal');
  } finally {
    await session.close();
  }
});

test('对话默认不进检索，提炼后命中；稿件归属可无颜色区分', async () => {
  const session = await launchZhiliu();
  try {
    await configureModels(session.window, session.fakeOpenAI.baseUrl);
    await session.window.evaluate(async () => {
      await window.zhiliu.notes.save({ quotation: '依据。', thought: '对话提炼探针种子。' });
      const turn = await window.zhiliu.agent.chat('对话提炼探针种子');
      const unique = turn.paragraphs[0]?.text ?? '';
      const before = await window.zhiliu.search.query(unique, { mode: 'keyword' });
      if (before.some((hit) => hit.kind === 'note' && hit.snippet.includes(unique) && !hit.noteId)) {
        throw new Error('对话不应作为笔记命中');
      }
      await window.zhiliu.workbench.promoteChat(turn.id, 0, '我补写的想法。');
    });
    const chat = await session.window.evaluate(async () => window.zhiliu.workbench.view());
    const snippet = chat.chats[0]?.paragraphs[0]?.text ?? '';
    const hits = await session.window.evaluate(async (q) => window.zhiliu.search.query(q, { mode: 'keyword' }), snippet.slice(0, 12));
    expect(hits.some((hit) => hit.kind === 'note')).toBeTruthy();
    const draft = await session.window.evaluate(async () =>
      window.zhiliu.workbench.createManuscript({
        kind: 'formal',
        title: '归属稿',
        body: '用户句。来源句。AI句。',
        spans: [
          { text: '用户句。', provenance: 'user' },
          { text: '来源句。', provenance: 'source', noteId: 'n1' },
          { text: 'AI句。', provenance: 'ai' },
        ],
      }),
    );
    await session.window.getByRole('button', { name: '创作' }).click();
    await session.window.getByRole('list', { name: '稿件' }).getByRole('button').click();
    const labels = session.window.getByLabel('来源归属');
    await expect(labels.getByText('用户', { exact: true })).toBeVisible();
    await expect(labels.getByText('来源', { exact: true })).toBeVisible();
    await expect(labels.getByText('AI', { exact: true })).toBeVisible();
    const exported = await session.window.evaluate(async (id) => window.zhiliu.workbench.exportManuscript(id), draft.id);
    expect(exported.markdown).not.toContain('data-provenance');
    expect(exported.markdown).not.toContain('#1f4b3a');
  } finally {
    await session.close();
  }
});

test('提案确认次数等于操作次数；就绪后生成正式稿；删除笔记后引用失效', async () => {
  const session = await launchZhiliu();
  try {
    await configureModels(session.window, session.fakeOpenAI.baseUrl);
    const notes = await session.window.evaluate(async () => {
      const created = [];
      created.push(await window.zhiliu.notes.save({ quotation: '一', thought: '青瓷提案甲。' }));
      created.push(await window.zhiliu.notes.save({ quotation: '二', thought: '青瓷提案乙。' }));
      const topics = await window.zhiliu.agent.organize();
      const two = await window.zhiliu.workbench.createProposal(topics[0]!.id);
      if (two.ready !== false) {
        throw new Error('两条思想笔记不应就绪');
      }
      created.push(await window.zhiliu.notes.save({ quotation: '三', thought: '青瓷提案丙。' }));
      await window.zhiliu.agent.organize();
      return created.map((item) => item.id);
    });
    const proposal = await session.window.evaluate(async () => {
      const view = await window.zhiliu.workbench.view();
      const topic = view.topics[0];
      return window.zhiliu.workbench.createProposal(topic!.id);
    });
    await session.window.getByRole('button', { name: '创作' }).click();
    await expect(session.window.getByLabel('提案论点').first()).toBeVisible();
    await expect(session.window.getByRole('button', { name: '确认论点' }).first()).toBeVisible();
    await expect(session.window.getByRole('button', { name: '排除' }).first()).toBeVisible();
    await expect(session.window.getByRole('button', { name: '纳入' }).first()).toBeVisible();
    await session.window.evaluate(async (id) => window.zhiliu.workbench.setThesis(id, '确认后的论点。'), proposal.id);
    const thoughtEvidence = proposal.evidence.filter((item) => item.kind === 'thought');
    for (const item of thoughtEvidence) {
      await session.window.evaluate(
        async ({ proposalId, evidenceId }) => window.zhiliu.workbench.confirmEvidence(proposalId, evidenceId),
        { proposalId: proposal.id, evidenceId: item.id },
      );
    }
    const ready = await session.window.evaluate(async (id) => {
      const view = await window.zhiliu.workbench.view();
      return view.proposals.find((item) => item.id === id);
    }, proposal.id);
    expect(ready?.confirmations.length).toBe(thoughtEvidence.length + 1);
    expect(ready?.ready).toBeTruthy();
    const draft = await session.window.evaluate(async (id) => window.zhiliu.workbench.generateFormal(id), proposal.id);
    expect(draft.kind).toBe('formal');
    expect(thoughtEvidence.every((item) => draft.spans.some((span) => span.text === item.text))).toBeTruthy();
    expect(draft.spans.some((span) => span.text === '确认后的论点。')).toBeTruthy();
    const cited = draft.spans.find((span) => span.noteId)?.noteId;
    if (cited) {
      await writeFile(
        path.join(session.vaultPath as string, 'notes', `${cited}.md`),
        '---\nkind: thought_note\n---\n',
        'utf8',
      );
      await expect.poll(async () => {
        const view = await session.window.evaluate(async () => window.zhiliu.workbench.view());
        return view.manuscripts.find((item) => item.id === draft.id)?.staleRefs.length;
      }).toBeGreaterThan(0);
    }
  } finally {
    await session.close();
  }
});

test('导出可关脚注且不含凭据；试写稿转正产生新正式稿；风格需确认才生效', async () => {
  const session = await launchZhiliu();
  try {
    await configureModels(session.window, session.fakeOpenAI.baseUrl);
    const trial = await session.window.evaluate(async () =>
      window.zhiliu.workbench.createManuscript({ kind: 'trial', title: '试写一篇', body: '试写稿正文探针。' }),
    );
    expect(trial.kind).toBe('trial');
    expect(trial.status).toBe('draft');
    const beforeSearch = await session.window.evaluate(async (q) => window.zhiliu.search.query(q, { mode: 'keyword' }), '试写稿正文探针');
    expect(beforeSearch.some((hit) => hit.snippet.includes('试写稿正文探针'))).toBeFalsy();
    const proposal = await session.window.evaluate(async (id) => window.zhiliu.workbench.promoteTrial(id), trial.id);
    await session.window.evaluate(async (id) => window.zhiliu.workbench.setThesis(id, '转正论点。'), proposal.id);
    const formal = await session.window.evaluate(
      async (trialId) =>
        window.zhiliu.workbench.createManuscript({ kind: 'formal', title: '新的正式稿', body: '正式稿正文。', trialId }),
      trial.id,
    );
    expect(formal.id).not.toBe(trial.id);
    const stillTrial = await session.window.evaluate(async () => window.zhiliu.workbench.view());
    expect(stillTrial.manuscripts.find((item) => item.id === trial.id)?.kind).toBe('trial');
    const exported = await session.window.evaluate(async (id) => window.zhiliu.workbench.exportManuscript(id, { footnotes: false }), formal.id);
    expect(exported.markdown).not.toContain('## 来源');
    expect(exported.markdown).not.toContain('e2e-fake-key');
    await session.window.evaluate(async (id) => window.zhiliu.workbench.finalize(id), formal.id);
    await session.window.evaluate(async (text) => window.zhiliu.workbench.saveStyle(text), '原风格。');
    const before = await session.window.evaluate(async () => window.zhiliu.workbench.view());
    const learned = await session.window.evaluate(async (id) => window.zhiliu.workbench.learnStyle(id), formal.id);
    expect(learned).toBeTruthy();
    const unchanged = await session.window.evaluate(async () => window.zhiliu.workbench.view());
    expect(unchanged.style.text).toBe(before.style.text);
    expect(unchanged.styleProposals[0]?.evidence).toBeTruthy();
    await session.window.getByRole('button', { name: '创作' }).click();
    await expect(session.window.getByRole('list', { name: '风格更新提案' })).toContainText('依据');
    await session.window.getByRole('button', { name: '确认样本' }).click();
    const after = await session.window.evaluate(async () => window.zhiliu.workbench.view());
    expect(after.style.text).toContain('原风格');
    expect(after.style.version).toBeGreaterThan(before.style.version);
  } finally {
    await session.close();
  }
});

test('断网时阅读捕获检索编辑写作可用，AI 以可恢复错误结束', async () => {
  const session = await launchZhiliu({ chooseFiles: [fireside] });
  try {
    await session.window.getByRole('button', { name: '导入 EPUB 或 PDF' }).click();
    await session.window.getByRole('button', { name: '炉边小札' }).click();
    const body = session.window.frameLocator('iframe[title="正文"]');
    await body.getByText(firesideSentence).selectText();
    await session.window.getByRole('button', { name: '记下这段' }).click();
    const capture = session.window.getByRole('dialog', { name: '记下这段' });
    await capture.getByLabel('想法').fill('离线也能记下。');
    await capture.getByLabel('想法').press('Enter');
    await session.window.getByRole('button', { name: '创作' }).click();
    await session.window.getByRole('button', { name: '新建正式稿' }).click();
    await session.window.getByLabel('稿件正文').fill('离线手写稿。');
    await session.window.getByRole('button', { name: '保存稿件' }).click();
    await session.window.evaluate(async () => {
      await window.zhiliu.models.save({
        fast: { baseUrl: 'http://127.0.0.1:9', model: 'down', apiKey: 'x' },
        deep: { baseUrl: 'http://127.0.0.1:9', model: 'down', apiKey: 'x' },
      });
    });
    const failed = await session.window.evaluate(async () => {
      try {
        await window.zhiliu.agent.analyze();
        return 'ok';
      } catch (error) {
        return error instanceof Error ? error.message : '失败';
      }
    });
    expect(failed).not.toBe('ok');
    const chatFailed = await session.window.evaluate(async () => {
      try {
        await window.zhiliu.agent.chat('离线提问');
        return 'ok';
      } catch (error) {
        return error instanceof Error ? error.message : '失败';
      }
    });
    expect(chatFailed).not.toBe('ok');
    const hits = await session.window.evaluate(async (q) => window.zhiliu.search.query(q, { mode: 'keyword' }), '离线也能记下');
    expect(hits.some((hit) => hit.snippet.includes('离线也能记下'))).toBeTruthy();
  } finally {
    await session.close();
  }
});

test('完整闭环：三份合计超过 1MB 的来源走到干净导出', async () => {
  test.setTimeout(180_000);
  const started = Date.now();
  let blocked = 0;
  const chunk = '青石阶还没干。'.repeat(48_000);
  const web = await serve({
    '/a': `<html><body><article><h1>甲卷</h1><p>${chunk} 来源甲独特句。</p></article></body></html>`,
    '/b': `<html><body><article><h1>乙卷</h1><p>${chunk} 来源乙独特句。</p></article></body></html>`,
    '/c': `<html><body><article><h1>丙卷</h1><p>${chunk} 来源丙独特句。</p></article></body></html>`,
  });
  const session = await launchZhiliu({ chooseFiles: [fireside] });
  try {
    await configureModels(session.window, session.fakeOpenAI.baseUrl);
    const t0 = Date.now();
    for (const slug of ['a', 'b', 'c']) {
      await session.window.evaluate(async (url) => window.zhiliu.library.importUrl(url), `${web.baseUrl}/${slug}`);
    }
    blocked += Date.now() - t0;
    expect(chunk.length * 3).toBeGreaterThan(1_000_000);
    await session.window.getByRole('button', { name: '导入 EPUB 或 PDF' }).click();
    await session.window.getByRole('button', { name: '炉边小札' }).click();
    const reader = session.window.frameLocator('iframe[title="正文"]');
    await expect(reader.getByText(firesideSentence)).toBeVisible();
    await reader.getByText(firesideSentence).selectText();
    await session.window.getByRole('button', { name: '记下这段' }).click();
    const capture = session.window.getByRole('dialog', { name: '记下这段' });
    await capture.getByLabel('想法').fill('闭环阅读捕获。');
    await capture.getByRole('button', { name: '保存' }).click();
    await session.window.evaluate(async () => {
      const sources = await window.zhiliu.library.list();
      const webSources = sources.filter((item) => item.kind === 'web');
      await window.zhiliu.notes.save({ quotation: '来源甲独特句。', thought: '闭环思想一。', sourceId: webSources[0]?.id });
      await window.zhiliu.notes.save({ quotation: '来源乙独特句。', thought: '闭环思想二。', sourceId: webSources[1]?.id });
      await window.zhiliu.notes.save({ quotation: '来源丙独特句。', thought: '闭环思想三。', sourceId: webSources[2]?.id });
    });
    await session.window.getByRole('button', { name: '创作' }).click();
    await session.window.getByRole('button', { name: '组织主题（主栏）' }).click();
    await expect(session.window.getByRole('list', { name: '主题' }).getByText('· 思想线索').first()).toBeVisible();
    await session.window
      .getByRole('list', { name: '主题' })
      .locator('li')
      .filter({ hasText: '· 思想线索' })
      .getByRole('button', { name: '生成提案' })
      .click();
    await session.window.getByLabel('提案论点').fill('闭环论点。');
    await session.window.getByRole('button', { name: '确认论点' }).click();
    const thoughtConfirms = session.window.getByRole('button', { name: /^确认：闭环思想/ });
    await expect(thoughtConfirms).toHaveCount(3);
    for (let i = 0; i < 3; i += 1) {
      await thoughtConfirms.first().click();
    }
    await expect(session.window.getByRole('button', { name: '生成正式稿' })).toBeEnabled();
    await session.window.getByRole('button', { name: '生成正式稿' }).click();
    await expect
      .poll(async () => session.window.getByRole('list', { name: '稿件' }).getByRole('button').filter({ hasText: '正式' }).count(), {
        timeout: 30_000,
      })
      .toBeGreaterThan(0);
    await session.window.getByRole('list', { name: '稿件' }).getByRole('button').filter({ hasText: '正式' }).first().click();
    await expect(session.window.getByLabel('来源归属').getByText('用户', { exact: true }).first()).toBeVisible();
    await session.window.getByRole('button', { name: '定稿', exact: true }).click();
    await session.window.getByRole('button', { name: '导出 Markdown' }).click();
    await expect(session.window.getByText('## 来源')).toBeVisible();
    const exported = await session.window.evaluate(async () => {
      const view = await window.zhiliu.workbench.view();
      const draft = view.manuscripts.find((item) => item.status === 'final');
      if (!draft) {
        return null;
      }
      const notes = await window.zhiliu.notes.list();
      const noteIds = new Set(notes.map((item) => item.id));
      const dangling = draft.spans.filter((span) => span.noteId && !noteIds.has(span.noteId));
      const file = await window.zhiliu.workbench.exportManuscript(draft.id, { footnotes: true });
      return { markdown: file.markdown, text: file.text, html: file.html, dangling: dangling.length, sourceIds: [...new Set(draft.spans.map((span) => span.sourceId).filter(Boolean))] };
    });
    expect(exported?.markdown).toContain('## 来源');
    expect(exported?.markdown).toMatch(/甲卷|乙卷|丙卷/);
    expect(exported?.sourceIds.length).toBeGreaterThanOrEqual(2);
    expect(exported?.dangling).toBe(0);
    expect(exported?.markdown).not.toContain('data-provenance');
    expect(exported?.text).not.toContain('e2e-fake-key');
    expect(exported?.html).not.toContain('e2e-fake-key');
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(30 * 60 * 1000);
    expect(blocked).toBeLessThan(5 * 60 * 1000);
    const baseline = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs/loop-baseline.md');
    await writeFile(
      baseline,
      `# 完整闭环基线\n\n- 记录于: ${new Date().toISOString().slice(0, 10)}\n- 挂钟: ${elapsed}ms\n- 阻塞等待: ${blocked}ms\n- 上限: 挂钟 30min，阻塞 5min（基线不得用于放宽上限）\n`,
      'utf8',
    );
  } finally {
    await session.close();
    await web.close();
  }
});
