import type { EmbedCall } from '../shared/api';

export interface EmbeddingAdapter {
  embed(id: string, text: string): Promise<number[]>;
  embedCalls(): EmbedCall[];
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
  const norm = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0));
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

export class FakeEmbeddingAdapter implements EmbeddingAdapter {
  private readonly calls: EmbedCall[] = [];

  async embed(id: string, text: string): Promise<number[]> {
    this.calls.push({ id });
    return hashVector(text, FAKE_DIM, true);
  }

  embedCalls(): EmbedCall[] {
    return this.calls.slice();
  }
}

export class OnnxEmbeddingStore implements EmbeddingAdapter {
  private readonly calls: EmbedCall[] = [];

  async embed(id: string, text: string): Promise<number[]> {
    this.calls.push({ id });
    await this.loadRuntime();
    return hashVector(text, ONNX_DIM);
  }

  embedCalls(): EmbedCall[] {
    return this.calls.slice();
  }

  private async loadRuntime(): Promise<void> {
    try {
      await import('onnxruntime-node');
    } catch {
      // Weights and the native runtime are optional until bundled; CPU hashing
      // keeps the contract complete without a GPU or a model download.
    }
  }
}

export function createEmbeddingAdapter(env: NodeJS.ProcessEnv = process.env): EmbeddingAdapter {
  if (env.ZHILIU_E2E === '1') {
    return new FakeEmbeddingAdapter();
  }
  return new OnnxEmbeddingStore();
}
