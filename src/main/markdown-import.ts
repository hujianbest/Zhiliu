import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import matter from 'gray-matter';
import type { Vault } from './vault';

const KNOWN = new Set([
  'id',
  'kind',
  'source_id',
  'source_position',
  'quotation',
  'thought',
  'created',
  'updated',
  'provenance',
  'relations',
]);

export type MarkdownImportReport = {
  reportPath: string;
  copied: number;
  renamed: { from: string; to: string }[];
  unmapped: { file: string; fields: string[] }[];
};

export class MarkdownImporter {
  constructor(private readonly vault: Vault) {}

  stubbedDirectory(env: NodeJS.ProcessEnv): string | null {
    if (env.ZHILIU_E2E !== '1') {
      return null;
    }
    const pointer = env.ZHILIU_CHOOSE_MARKDOWN_POINTER;
    if (pointer) {
      try {
        const chosen = readFileSync(pointer, 'utf8').trim();
        if (chosen) {
          return chosen;
        }
      } catch {
        // Fall through to the one-shot directory env.
      }
    }
    return env.ZHILIU_CHOOSE_MARKDOWN_DIR ?? null;
  }

  async importFolder(fromDir: string): Promise<MarkdownImportReport> {
    const root = this.vault.path;
    if (!root) {
      throw new Error('还没有打开知识库');
    }
    const destRoot = path.join(root, 'notes');
    await mkdir(destRoot, { recursive: true });
    const renamed: MarkdownImportReport['renamed'] = [];
    const unmapped: MarkdownImportReport['unmapped'] = [];
    let copied = 0;
    const now = new Date().toISOString();
    for (const filePath of await listMarkdown(fromDir)) {
      const originalName = path.basename(filePath);
      const raw = await readFile(filePath, 'utf8');
      const parsed = matter(raw);
      const unknown = Object.keys(parsed.data).filter((key) => !KNOWN.has(key));
      if (unknown.length > 0) {
        unmapped.push({ file: originalName, fields: unknown });
      }
      const data: Record<string, unknown> = { ...parsed.data };
      if (!data.id) {
        data.id = randomUUID();
      }
      const thought = String(data.thought ?? '');
      if (data.kind !== 'excerpt' && data.kind !== 'thought_note') {
        data.kind = thought.trim() ? 'thought_note' : 'excerpt';
      }
      if (!data.created) {
        data.created = now;
      }
      if (!data.updated) {
        data.updated = now;
      }
      if (!data.provenance) {
        data.provenance = { quotation: 'source', thought: 'user' };
      }
      if (!Array.isArray(data.relations)) {
        data.relations = [];
      }
      let destName = originalName;
      let dest = path.join(destRoot, destName);
      let n = 2;
      while (await exists(dest)) {
        destName = `${path.basename(originalName, '.md')}-${n}.md`;
        dest = path.join(destRoot, destName);
        n += 1;
      }
      if (destName !== originalName) {
        renamed.push({ from: originalName, to: destName });
      }
      const body =
        parsed.content.trim() === ''
          ? ['## 引文', '', String(data.quotation ?? ''), '', '## 想法', '', thought || '（无）', ''].join('\n')
          : parsed.content;
      await writeFile(dest, matter.stringify(body, data), 'utf8');
      copied += 1;
    }
    const reportPath = await writeReport(root, { copied, renamed, unmapped });
    return { reportPath, copied, renamed, unmapped };
  }
}

async function writeReport(
  root: string,
  data: { copied: number; renamed: MarkdownImportReport['renamed']; unmapped: MarkdownImportReport['unmapped'] },
): Promise<string> {
  const dir = path.join(root, '.zhiliu', 'import-reports');
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(dir, `${stamp}.md`);
  const lines = [
    '# 导入报告',
    '',
    '导入是一次性复制。原文件夹之后的修改不会同步到知流。',
    '',
    `复制了 ${data.copied} 个文件。`,
    '',
    '## 重命名',
    '',
  ];
  if (data.renamed.length === 0) {
    lines.push('无。', '');
  } else {
    for (const item of data.renamed) {
      lines.push(`- ${item.from} → ${item.to}`);
    }
    lines.push('');
  }
  lines.push('## 未映射字段', '');
  if (data.unmapped.length === 0) {
    lines.push('无。', '');
  } else {
    for (const item of data.unmapped) {
      lines.push(`- ${item.file}：${item.fields.map((field) => `\`${field}\``).join('、')}`);
    }
    lines.push('');
  }
  await writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');
  return filePath;
}

async function listMarkdown(root: string): Promise<string[]> {
  const found: string[] = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await listMarkdown(full)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      found.push(full);
    }
  }
  return found;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}
