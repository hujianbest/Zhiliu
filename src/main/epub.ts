import path from 'node:path';
import JSZip from 'jszip';
import sanitizeHtml from 'sanitize-html';

export type ParsedEpub = {
  title: string;
  authors: string[];
};

export type EpubChapter = {
  label: string;
  html: string;
};

export type EpubTocEntry = {
  label: string;
  spineIndex: number;
};

export type EpubReading = {
  title: string;
  chapters: EpubChapter[];
  toc: EpubTocEntry[];
};

export async function parseEpub(bytes: Buffer): Promise<ParsedEpub> {
  const { opf } = await loadPackage(bytes);
  const titles = dcValues(opf, 'title');
  const authors = dcValues(opf, 'creator');
  return {
    title: titles[0] ?? '',
    authors,
  };
}

export async function extractReading(bytes: Buffer): Promise<EpubReading> {
  const { zip, opf, opfPath } = await loadPackage(bytes);
  const opfDir = path.posix.dirname(opfPath);
  const manifest = parseManifest(opf);
  const chapters: EpubChapter[] = [];
  const chapterIndexByPath = new Map<string, number>();

  for (const idref of parseSpine(opf)) {
    const item = manifest.get(idref);
    if (!item || isNavItem(item)) {
      continue;
    }
    const href = item.href.split('#')[0] ?? item.href;
    const chapterPath = zipResolve(opfDir, href);
    const xhtml = await zip.file(chapterPath)?.async('string');
    if (!xhtml) {
      continue;
    }
    const html = await sanitizeChapter(xhtml, zip, path.posix.dirname(chapterPath));
    chapterIndexByPath.set(chapterPath, chapters.length);
    chapters.push({
      label: headingLabel(html) || `第${chapters.length + 1}章`,
      html,
    });
  }

  if (chapters.length === 0) {
    throw new Error('无法打开：没有可阅读的章节');
  }

  return {
    title: dcValues(opf, 'title')[0] ?? '',
    chapters,
    toc: await parseNavToc(zip, manifest, opfDir, chapterIndexByPath),
  };
}

async function loadPackage(bytes: Buffer): Promise<{ zip: JSZip; opf: string; opfPath: string }> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error('无法打开：不是有效的 EPUB');
  }

  const mimetype = await zip.file('mimetype')?.async('string');
  if (mimetype?.trim() !== 'application/epub+zip') {
    throw new Error('无法打开：不是有效的 EPUB');
  }

  const container = await zip.file('META-INF/container.xml')?.async('string');
  if (!container) {
    throw new Error('无法打开：不是有效的 EPUB');
  }

  const opfPath = container.match(/full-path\s*=\s*"([^"]+)"/i)?.[1];
  if (!opfPath) {
    throw new Error('无法打开：不是有效的 EPUB');
  }

  const opf = await zip.file(opfPath)?.async('string');
  if (!opf) {
    throw new Error('无法打开：不是有效的 EPUB');
  }

  return { zip, opf, opfPath };
}

type ManifestItem = {
  href: string;
  properties: string;
};

function parseManifest(opf: string): Map<string, ManifestItem> {
  const items = new Map<string, ManifestItem>();
  for (const match of opf.matchAll(/<item\b([^>]*)\/?>/gi)) {
    const attrs = xmlAttrs(match[1]);
    const id = attrs.id;
    if (!id || !attrs.href) {
      continue;
    }
    items.set(id, { href: attrs.href, properties: attrs.properties ?? '' });
  }
  return items;
}

function parseSpine(opf: string): string[] {
  const spine = opf.match(/<spine\b[^>]*>([\s\S]*?)<\/spine>/i)?.[1] ?? '';
  const ids: string[] = [];
  for (const match of spine.matchAll(/<itemref\b([^>]*)\/?>/gi)) {
    const attrs = xmlAttrs(match[1]);
    if (attrs.idref) {
      ids.push(attrs.idref);
    }
  }
  return ids;
}

function isNavItem(item: ManifestItem): boolean {
  return /\bnav\b/.test(item.properties);
}

async function parseNavToc(
  zip: JSZip,
  manifest: Map<string, ManifestItem>,
  opfDir: string,
  chapterIndexByPath: Map<string, number>,
): Promise<EpubTocEntry[]> {
  const navItem = [...manifest.values()].find(isNavItem);
  if (!navItem) {
    return [];
  }
  const navPath = zipResolve(opfDir, navItem.href.split('#')[0] ?? navItem.href);
  const navXhtml = await zip.file(navPath)?.async('string');
  if (!navXhtml) {
    return [];
  }
  const tocHtml = tocNavInner(navXhtml);
  if (!tocHtml) {
    return [];
  }

  const toc: EpubTocEntry[] = [];
  const seen = new Set<number>();
  const navDir = path.posix.dirname(navPath);
  for (const match of tocHtml.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = xmlAttrs(match[1]).href;
    if (!href) {
      continue;
    }
    const file = href.split('#')[0] ?? href;
    const resolved = zipResolve(navDir, file);
    const spineIndex = chapterIndexByPath.get(resolved);
    if (spineIndex === undefined || seen.has(spineIndex)) {
      continue;
    }
    const label = decodeXml(match[2].replace(/<[^>]+>/g, '').trim());
    if (!label) {
      continue;
    }
    seen.add(spineIndex);
    toc.push({ label, spineIndex });
  }
  return toc;
}

function tocNavInner(navXhtml: string): string {
  const blocks = navXhtml.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi) ?? [];
  for (const block of blocks) {
    const open = block.match(/<nav\b[^>]*>/i)?.[0] ?? '';
    if (/epub:type\s*=\s*["'][^"']*\btoc\b/i.test(open) || /role\s*=\s*["']doc-toc["']/i.test(open)) {
      return block;
    }
  }
  return blocks[0] ?? '';
}

function xmlAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of raw.matchAll(/([:\w.-]+)\s*=\s*"([^"]*)"/g)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function zipResolve(fromDir: string, href: string): string {
  const decoded = decodeURIComponent(href);
  const joined = fromDir === '.' ? decoded : path.posix.join(fromDir, decoded);
  return path.posix.normalize(joined).replace(/^\//, '');
}

function bodyInner(xhtml: string): string {
  return xhtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1]?.trim() ?? xhtml;
}

function headingLabel(html: string): string {
  const text = html.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1] ?? '';
  return text.replace(/<[^>]+>/g, '').trim();
}

async function sanitizeChapter(xhtml: string, zip: JSZip, chapterDir: string): Promise<string> {
  const inner = bodyInner(xhtml);
  const images = await inlineLocalImages(inner, zip, chapterDir);
  return sanitizeHtml(inner, {
    allowedTags: [
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
      'img',
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
      'small',
      'sub',
      'sup',
      'figure',
      'figcaption',
    ],
    allowedAttributes: {
      img: ['src', 'alt'],
      a: ['href'],
    },
    allowedSchemes: ['data'],
    allowedSchemesByTag: {
      img: ['data'],
      a: [],
    },
    allowedSchemesAppliedToAttributes: ['href', 'src', 'srcset', 'cite'],
    allowProtocolRelative: false,
    transformTags: {
      img: (tagName, attribs) => {
        const original = attribs.src ?? '';
        const inlined = images.get(original);
        if (inlined) {
          return { tagName, attribs: { src: inlined, alt: attribs.alt ?? '' } };
        }
        if (original.startsWith('data:') && !original.startsWith('data:image/svg')) {
          return { tagName, attribs: { src: original, alt: attribs.alt ?? '' } };
        }
        return { tagName, attribs: {} as Record<string, string> };
      },
      a: (tagName, attribs) => {
        const href = attribs.href ?? '';
        if (!href || /^(javascript|data|https?|vbscript|file):/i.test(href)) {
          return { tagName, attribs: {} as Record<string, string> };
        }
        return { tagName, attribs: { href } };
      },
    },
    exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs?.src?.startsWith('data:'),
  });
}

async function inlineLocalImages(html: string, zip: JSZip, chapterDir: string): Promise<Map<string, string>> {
  const images = new Map<string, string>();
  for (const match of html.matchAll(/<img\b[^>]*\bsrc\s*=\s*"([^"]+)"/gi)) {
    const src = decodeXml(match[1]);
    if (/^(https?:|javascript:|data:)/i.test(src)) {
      continue;
    }
    if (path.posix.extname(src).toLowerCase() === '.svg') {
      continue;
    }
    const filePath = zipResolve(chapterDir, src);
    const file = zip.file(filePath) ?? zip.file(decodeURIComponent(filePath));
    if (!file) {
      continue;
    }
    const bytes = Buffer.from(await file.async('uint8array'));
    images.set(src, `data:${mimeFromPath(filePath)};base64,${bytes.toString('base64')}`);
  }
  return images;
}

function mimeFromPath(filePath: string): string {
  const ext = path.posix.extname(filePath).toLowerCase();
  if (ext === '.png') {
    return 'image/png';
  }
  if (ext === '.gif') {
    return 'image/gif';
  }
  if (ext === '.webp') {
    return 'image/webp';
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    return 'image/jpeg';
  }
  return 'application/octet-stream';
}

function dcValues(opf: string, element: string): string[] {
  const pattern = new RegExp(`<(?:dc:)?${element}(?:\\s[^>]*)?>([^<]*)</(?:dc:)?${element}>`, 'gi');
  const values: string[] = [];
  for (const match of opf.matchAll(pattern)) {
    const value = decodeXml(match[1].trim());
    if (value) {
      values.push(value);
    }
  }
  return values;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
