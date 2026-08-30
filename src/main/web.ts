import sanitizeHtml from 'sanitize-html';

export type WebArticle = {
  title: string;
  authors: string[];
  sourceUrl: string;
  capturedAt: string;
  html: string;
};

const ALLOWED_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'em',
  'strong',
  'blockquote',
  'ul',
  'ol',
  'li',
  'br',
  'span',
  'div',
  'section',
  'article',
  'header',
  'hr',
  'a',
  'cite',
  'i',
  'b',
];

export async function importWebArticle(url: string): Promise<WebArticle> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('无法导入：不是有效的网址');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('无法导入：只支持公开的 http 或 https 页面');
  }

  const response = await fetch(parsed.href, {
    redirect: 'follow',
    headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'Zhiliu/0.1' },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {
    throw new Error('无法导入：页面不可达');
  });

  if (response.status === 401 || response.status === 403 || response.status === 402) {
    throw new Error('无法导入：页面需要登录或付费，未保存任何内容');
  }
  if (!response.ok) {
    throw new Error(`无法导入：服务器返回 ${response.status}`);
  }

  const raw = await response.text();
  if (looksLikeLoginWall(raw)) {
    throw new Error('无法导入：页面需要登录或付费，未保存任何内容');
  }

  const title = metaContent(raw, 'og:title') || headingOrTitle(raw) || parsed.hostname;
  const author = metaContent(raw, 'author') || metaContent(raw, 'og:article:author') || '';
  const html = sanitizeHtml(extractMain(raw), {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      script: () => ({ tagName: 'span', attribs: {}, text: '' }),
    },
  });
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
  if (text.length < 40) {
    throw new Error('无法导入：没有可提取的正文');
  }

  return {
    title,
    authors: author ? [author] : [],
    sourceUrl: parsed.href,
    capturedAt: new Date().toISOString(),
    html,
  };
}

function looksLikeLoginWall(raw: string): boolean {
  const lower = raw.toLowerCase();
  if (/paywall|subscribe to (continue|read)|please sign in|请登录|付费墙/.test(lower)) {
    return true;
  }
  const hasPassword = /type=["']password["']/.test(lower);
  const text = sanitizeHtml(raw, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
  return hasPassword && text.length < 400;
}

function metaContent(raw: string, name: string): string {
  const property = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i');
  const contentFirst = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`, 'i');
  return decode(property.exec(raw)?.[1] ?? contentFirst.exec(raw)?.[1] ?? '').trim();
}

function headingOrTitle(raw: string): string {
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(raw);
  if (h1) {
    return sanitizeHtml(h1[1], { allowedTags: [], allowedAttributes: {} }).trim();
  }
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw);
  return title ? sanitizeHtml(title[1], { allowedTags: [], allowedAttributes: {} }).trim() : '';
}

function extractMain(raw: string): string {
  const article = /<article[^>]*>([\s\S]*?)<\/article>/i.exec(raw);
  if (article) {
    return article[1];
  }
  const main = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(raw);
  if (main) {
    return main[1];
  }
  const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(raw);
  return body?.[1] ?? raw;
}

function decode(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
