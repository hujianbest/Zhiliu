type PingMessage = {
  type: 'ping';
  id: number;
};

const parentPort = (process as NodeJS.Process & {
  parentPort?: { on(event: 'message', listener: (event: { data: PingMessage }) => void): void; postMessage(data: unknown): void };
}).parentPort;

if (!parentPort) {
  throw new Error('utility-worker 必须由 utilityProcess.fork 启动');
}

parentPort.on('message', (event) => {
  const data = event.data;
  if (data?.type === 'ping') {
    parentPort.postMessage({ type: 'pong', id: data.id });
  }
});
