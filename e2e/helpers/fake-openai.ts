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

      const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
      if (token === 'sk-invalid') {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'invalid api key', type: 'invalid_request_error' } }));
        return;
      }

      if (req.method === 'GET' && matches(req.url, '/models')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ object: 'list', data: [{ id: 'fake-fast', object: 'model' }] }));
        return;
      }

      if (req.method === 'POST' && matches(req.url, '/chat/completions')) {
      const prompt = JSON.stringify(body);
      const analysis = prompt.includes('不要编造库外事实')
        ? JSON.stringify({ summary: '假分析：这些摘录围绕炉火与青瓷。' })
        : prompt.includes('写成正式稿')
          ? '假正式稿：围绕已确认的论点和证据写成正文。'
          : prompt.includes('并列修订')
            ? '假并列修订：换一种说法，不覆盖原文。'
            : '假模型回复';
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            id: 'chatcmpl-fake',
            object: 'chat.completion',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: analysis },
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
