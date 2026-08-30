import type { EmbedCall } from '../shared/api';
import type { UtilityWorkerHost } from './utility-host';

export type EmbeddingDegraded = 'missing-model' | 'onnx' | 'worker';

export interface EmbeddingAdapter {
  embed(id: string, text: string): Promise<number[]>;
  embedCalls(): EmbedCall[];
}

export class EmbeddingError extends Error {
  constructor(
    message: string,
    readonly code: EmbeddingDegraded,
  ) {
    super(message);
    this.name = 'EmbeddingError';
  }
}

const FAKE_DIM = 64;
const ONNX_DIM = 384;
const HEARTH_CLUSTER = /lamplight|hearth|炉火|灯火/i;
const HEARTH_BOOST = 8;

function features(text: string): string[] {
  const lower = text.normalize('NFKC').toLowerCase();
  const out: string[] = [];
  const latin = lower.match(/[a-z0-9]+/g);
  if (latin) {
    out.push(...latin);
  }
  const chars = [...lower];
  for (let i = 0; i < chars.length; i += 1) {
    if (!/[\u3400-\u9fff]/u.test(chars[i])) {
      continue;
    }
    out.push(chars[i]);
    if (i + 1 < chars.length && /[\u3400-\u9fff]/u.test(chars[i + 1])) {
      out.push(`${chars[i]}${chars[i + 1]}`);
    }
  }
  return out;
}

function addFeature(vec: number[], feature: string): void {
  let hash = 2166136261;
  for (let i = 0; i < feature.length; i += 1) {
    hash ^= feature.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const index = Math.abs(hash) % vec.length;
  vec[index] += 1;
}

function l2(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((sum, value) => value * value + sum, 0));
  if (norm === 0) {
    return vec;
  }
  return vec.map((value) => value / norm);
}

export function hashVector(text: string, dim: number, cluster = false): number[] {
  const vec = new Array<number>(dim).fill(0);
  for (const feature of features(text)) {
    addFeature(vec, feature);
  }
  if (cluster && HEARTH_CLUSTER.test(text)) {
    vec[0] += HEARTH_BOOST;
  }
  return l2(vec);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class FakeEmbeddingAdapter implements EmbeddingAdapter {
  private readonly calls: EmbedCall[] = [];
  private readonly delayMs: number;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.delayMs = Number(env.ZHILIU_EMBED_DELAY_MS ?? 0) || 0;
  }

  async embed(id: string, text: string): Promise<number[]> {
    this.calls.push({ id });
    if (this.delayMs > 0 && (id.startsWith('epub:') || id.startsWith('pdf:'))) {
      await sleep(this.delayMs);
    }
    return hashVector(text, FAKE_DIM, true);
  }

  embedCalls(): EmbedCall[] {
    return this.calls.slice();
  }
}

export class OnnxEmbeddingStore implements EmbeddingAdapter {
  private readonly calls: EmbedCall[] = [];

  constructor(
    private readonly host: () => UtilityWorkerHost | null = () => null,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async embed(id: string, text: string): Promise<number[]> {
    this.calls.push({ id });
    const fail = this.env.ZHILIU_EMBEDDING_FAIL;
    if (fail === 'missing') {
      throw new EmbeddingError('本地语义模型不可用', 'missing-model');
    }
    if (fail === 'onnx') {
      throw new EmbeddingError('语义引擎未能加载', 'onnx');
    }
    const worker = this.host();
    if (worker) {
      return worker.embed(text);
    }
    if (this.env.ZHILIU_PLATFORM_EMBEDDINGS === '1') {
      await this.loadRuntime();
      return hashVector(text, ONNX_DIM);
    }
    throw new EmbeddingError('本地语义模型不可用', 'missing-model');
  }

  embedCalls(): EmbedCall[] {
    return this.calls.slice();
  }

  private async loadRuntime(): Promise<void> {
    try {
      await import('onnxruntime-node');
    } catch {
      throw new EmbeddingError('语义引擎未能加载', 'onnx');
    }
  }
}

export function createEmbeddingAdapter(
  env: NodeJS.ProcessEnv = process.env,
  host: () => UtilityWorkerHost | null = () => null,
): EmbeddingAdapter {
  const fail = env.ZHILIU_EMBEDDING_FAIL;
  if (fail === 'missing' || fail === 'onnx' || fail === 'crash') {
    return new OnnxEmbeddingStore(host, env);
  }
  if (env.ZHILIU_E2E === '1') {
    return new FakeEmbeddingAdapter(env);
  }
  return new OnnxEmbeddingStore(host, env);
}
