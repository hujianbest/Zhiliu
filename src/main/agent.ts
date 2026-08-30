import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ModelSettings } from './models';
import type { SearchIndex } from './search';
import type { Vault } from './vault';

export const BUILTIN_PROMPT_VERSION = 'builtin-v1';

export type GenerationTrace = {
  id: string;
  taskType: string;
  channel: 'interactive' | 'background';
  model: string;
  promptVersion: string;
  sourceIds: string[];
  timestamp: string;
  usage: { promptTokens: number; completionTokens: number; estimated: boolean };
  result: string;
};

export class AgentRuntime {
  constructor(
    private readonly vault: Vault,
    private readonly models: ModelSettings,
    private readonly search: SearchIndex,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async analyze(channel: 'interactive' | 'background' = 'interactive', promptVersion = BUILTIN_PROMPT_VERSION): Promise<{ status: string; trace: GenerationTrace }> {
    const root = this.vault.path;
    if (!root) {
      throw new Error('还没有打开知识库');
    }
    const endpoint = await this.models.resolve('fast');
    if (!endpoint) {
      throw new Error('尚未配置模型。');
    }
    const excerpts = await this.selectExcerpts();
    const sourceIds = [...new Set(excerpts.map((note) => note.sourceId).filter((id): id is string => Boolean(id)))];
    const payload = excerpts.map((note) => ({
      id: note.id,
      quotation: note.quotation,
      thought: note.thought,
    }));
    const result = await this.complete(endpoint.baseUrl, endpoint.model, endpoint.apiKey, payload, promptVersion);
    const trace: GenerationTrace = {
      id: randomUUID(),
      taskType: 'analyze',
      channel,
      model: endpoint.model,
      promptVersion,
      sourceIds,
      timestamp: new Date().toISOString(),
      usage: {
        promptTokens: estimateTokens(JSON.stringify(payload)),
        completionTokens: estimateTokens(result),
        estimated: true,
      },
      result,
    };
    await this.writeTrace(root, trace);
    return { status: '分析完成', trace };
  }

  async latestTrace(): Promise<GenerationTrace | null> {
    const root = this.vault.path;
    if (!root) {
      return null;
    }
    const dir = path.join(root, '.zhiliu', 'traces');
    let names: string[] = [];
    try {
      names = (await readdir(dir)).filter((name) => name.endsWith('.json'));
    } catch {
      return null;
    }
    const traces: GenerationTrace[] = [];
    for (const name of names) {
      traces.push(JSON.parse(await readFile(path.join(dir, name), 'utf8')) as GenerationTrace);
    }
    traces.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return traces.at(-1) ?? null;
  }

  async completeTask(
    taskType: string,
    channel: 'interactive' | 'background',
    promptVersion: string,
    userContent: string,
  ): Promise<{ text: string; trace: GenerationTrace }> {
    const root = this.vault.path;
    if (!root) {
      throw new Error('还没有打开知识库');
    }
    const endpoint = await this.models.resolve(taskType === 'write' ? 'deep' : 'fast');
    if (!endpoint) {
      throw new Error('尚未配置模型。');
    }
    const text = await this.complete(endpoint.baseUrl, endpoint.model, endpoint.apiKey, userContent, promptVersion);
    const trace: GenerationTrace = {
      id: randomUUID(),
      taskType,
      channel,
      model: endpoint.model,
      promptVersion,
      sourceIds: [],
      timestamp: new Date().toISOString(),
      usage: {
        promptTokens: estimateTokens(userContent),
        completionTokens: estimateTokens(text),
        estimated: true,
      },
      result: text,
    };
    await this.writeTrace(root, trace);
    return { text, trace };
  }

  private async selectExcerpts(): Promise<{ id: string; quotation: string; thought: string; sourceId: string | null }[]> {
    const hits = await this.search.query('分析', { mode: 'mix' });
    const selected: { id: string; quotation: string; thought: string; sourceId: string | null }[] = [];
    const seen = new Set<string>();
    for (const hit of hits) {
      if (!hit.noteId || seen.has(hit.noteId) || selected.length >= 8) {
        continue;
      }
      const note = await this.vault.getNote(hit.noteId);
      if (!note) {
        continue;
      }
      seen.add(note.id);
      selected.push({ id: note.id, quotation: note.quotation, thought: note.thought, sourceId: note.sourceId });
    }
    if (selected.length > 0) {
      return selected;
    }
    return (await this.vault.listNotes())
      .filter((note) => note.kind === 'thought_note')
      .slice(0, 8)
      .map((note) => ({ id: note.id, quotation: note.quotation, thought: note.thought, sourceId: note.sourceId }));
  }

  private async complete(
    baseUrl: string,
    model: string,
    apiKey: string,
    excerpts: { id: string; quotation: string; thought: string }[] | string,
    promptVersion: string,
  ): Promise<string> {
    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    const userContent =
      typeof excerpts === 'string' ? excerpts : `请根据这些摘录做一次分析，不要编造库外事实。\n${JSON.stringify(excerpts)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: `zhiliu prompt ${promptVersion}` },
          { role: 'user', content: userContent },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error('模型调用失败');
    }
    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    return payload.choices?.[0]?.message?.content ?? '';
  }

  private async writeTrace(root: string, trace: GenerationTrace): Promise<void> {
    const dir = path.join(root, '.zhiliu', 'traces');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${trace.id}.json`), `${JSON.stringify(trace, null, 2)}\n`, 'utf8');
  }
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
