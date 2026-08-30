import { utilityProcess, type UtilityProcess } from 'electron';
import path from 'node:path';

type Pending = {
  resolve: (value: boolean) => void;
  reject: (error: Error) => void;
};

export class UtilityWorkerHost {
  private child: UtilityProcess | null = null;
  private readonly ready: Promise<void>;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;

  constructor() {
    this.ready = this.spawn();
  }

  async ping(): Promise<boolean> {
    await this.ready;
    const child = this.child;
    if (!child) {
      return false;
    }
    const id = this.nextId++;
    return new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('utilityProcess ping 超时'));
      }, 8_000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject,
      });
      child.postMessage({ type: 'ping', id });
    });
  }

  private async spawn(): Promise<void> {
    const script = path.join(__dirname, 'utility-worker.cjs');
    const child = utilityProcess.fork(script, [], { serviceName: 'zhiliu-utility' });
    this.child = child;
    child.on('message', (data: { type?: string; id?: number }) => {
      if (data?.type === 'pong' && typeof data.id === 'number') {
        const waiter = this.pending.get(data.id);
        this.pending.delete(data.id);
        waiter?.resolve(true);
      }
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
