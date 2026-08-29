import http from 'node:http';

export type FakeOpenAIRequest = {
  method: string;
  url: string;
  body: unknown;
};

export type FakeOpenAI = {
  baseUrl: string;
  requests: FakeOpenAIRequest[];
  close(): Promise<void>;
};

function matches(url: string | undefined, suffix: string): boolean {
  if (!url) return false;
  return url === suffix || url.endsWith(suffix);
}

export async function startFakeOpenAI(): Promise<FakeOpenAI> {
  const requests: FakeOpenAIRequest[] = [];

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let body: unknown = raw;
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
      } else {
        body = null;
      }

      requests.push({
        method: req.method ?? '',
        url: req.url ?? '',
        body,
      });

      if (req.method === 'GET' && matches(req.url, '/models')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ object: 'list', data: [{ id: 'fake-fast', object: 'model' }] }));
        return;
      }

      if (req.method === 'POST' && matches(req.url, '/chat/completions')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            id: 'chatcmpl-fake',
            object: 'chat.completion',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: '假模型回复' },
                finish_reason: 'stop',
              },
            ],
          }),
        );
        return;
      }

      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'unknown route', type: 'invalid_request_error' } }));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('假 OpenAI 服务未能绑定端口');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
