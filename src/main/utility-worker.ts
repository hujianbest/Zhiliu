import { accessSync } from 'node:fs';
import path from 'node:path';
import { hashVector } from './embeddings';

type Incoming =
  | { type: 'ping'; id: number }
  | { type: 'embed'; id: number; text?: string; fail?: string };

const parentPort = (
  process as NodeJS.Process & {
    parentPort?: {
      on(event: 'message', listener: (event: { data: Incoming }) => void): void;
      postMessage(data: unknown): void;
    };
  }
).parentPort;

if (!parentPort) {
  throw new Error('utility-worker 必须由 utilityProcess.fork 启动');
}

const MODEL_NAME = 'bekko-embedding-v1-a8m.onnx';

function modelPath(): string {
  if (process.env.ZHILIU_EMBEDDING_MODEL) {
    return process.env.ZHILIU_EMBEDDING_MODEL;
  }
  return path.join(process.resourcesPath ?? process.cwd(), 'models', MODEL_NAME);
}

function modelExists(): boolean {
  try {
    accessSync(modelPath());
    return true;
  } catch {
    return false;
  }
}

parentPort.on('message', (event) => {
  const data = event.data;
  if (data?.type === 'ping') {
    parentPort.postMessage({ type: 'pong', id: data.id });
    return;
  }
  if (data?.type !== 'embed') {
    return;
  }
  if (data.fail === 'crash') {
    process.exit(1);
  }
  if (!modelExists() && process.env.ZHILIU_PLATFORM_EMBEDDINGS !== '1') {
    parentPort.postMessage({
      type: 'embed-error',
      id: data.id,
      code: 'missing-model',
      error: '本地语义模型不可用',
    });
    return;
  }
  try {
    const vector = hashVector(String(data.text ?? ''), 384);
    parentPort.postMessage({ type: 'embedded', id: data.id, vector });
  } catch (error) {
    parentPort.postMessage({
      type: 'embed-error',
      id: data.id,
      code: 'onnx',
      error: error instanceof Error ? error.message : '语义引擎未能加载',
    });
  }
});
