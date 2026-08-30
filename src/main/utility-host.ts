import { utilityProcess, type UtilityProcess } from 'electron';
import path from 'node:path';
import { EmbeddingError, type EmbeddingDegraded } from './embeddings';

type Pending<T> = {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

type WorkerMessage =
  | { type: 'pong'; id: number }
  | { type: 'embedded'; id: number; vector: number[] }
  | { type: 'embed-error'; id: number; code: EmbeddingDegraded; error: string };

export class UtilityWorkerHost {
  private child: UtilityProcess | null = null;
  private readonly ready: Promise<void>;
  private readonly pending = new Map<number, Pending<boolean | number[]>>();
  private nextId = 1;
  private dead = false;

  constructor() {
    this.ready = this.spawn();
  }

  async ping(): Promise<boolean> {
    const result = await this.request<boolean>('ping');
    return result === true;
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.request<number[]>('embed', { text });
    if (!Array.isArray(result)) {
      throw new EmbeddingError('后台语义进程已停止', 'worker');
    }
    return result;
  }

  private async request<T>(type: 'ping' | 'embed', extra: Record<string, unknown> = {}): Promise<T> {
    await this.ready.catch(() => undefined);
    const child = this.child;
    if (!child || this.dead) {
      throw new EmbeddingError('后台语义进程已停止', 'worker');
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new EmbeddingError('后台语义进程已停止', 'worker'));
      }, 15_000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value as T);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      child.postMessage({
        type,
        id,
        fail: process.env.ZHILIU_EMBEDDING_FAIL ?? '',
        ...extra,
      });
    });
  }

  private failAll(error: Error): void {
    this.dead = true;
    this.child = null;
    for (const waiter of this.pending.values()) {
      waiter.reject(error);
    }
    this.pending.clear();
  }

  private async spawn(): Promise<void> {
    const script = path.join(__dirname, 'utility-worker.cjs');
    const child = utilityProcess.fork(script, [], { serviceName: 'zhiliu-utility' });
    this.child = child;
    child.on('message', (data: WorkerMessage) => {
      if (data?.type === 'pong' && typeof data.id === 'number') {
        this.pending.get(data.id)?.resolve(true);
        this.pending.delete(data.id);
        return;
      }
      if (data?.type === 'embedded' && typeof data.id === 'number') {
        this.pending.get(data.id)?.resolve(data.vector);
        this.pending.delete(data.id);
        return;
      }
      if (data?.type === 'embed-error' && typeof data.id === 'number') {
        this.pending.get(data.id)?.reject(new EmbeddingError(data.error, data.code));
        this.pending.delete(data.id);
      }
    });
    child.on('exit', () => {
      this.failAll(new EmbeddingError('后台语义进程已停止', 'worker'));
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('utilityProcess spawn 超时')), 15_000);
      const onExit = (code: number | undefined) => {
        clearTimeout(timer);
        reject(new Error(`utilityProcess 退出 ${code ?? 'unknown'}`));
      };
      child.once('spawn', () => {
        clearTimeout(timer);
        child.off('exit', onExit);
        resolve();
      });
      child.once('exit', onExit);
    });
  }
}
