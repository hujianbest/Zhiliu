export type ProbeResult = 'ok' | 'unauthorized' | 'unreachable';

export async function probeOpenAI(baseUrl: string, apiKey: string): Promise<ProbeResult> {
  const url = `${baseUrl.replace(/\/$/, '')}/models`;
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(4000),
    });
    if (response.status === 401 || response.status === 403) {
      return 'unauthorized';
    }
    if (response.ok) {
      return 'ok';
    }
    return 'unreachable';
  } catch {
    return 'unreachable';
  }
}
