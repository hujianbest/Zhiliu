import JSZip from 'jszip';

export type ParsedEpub = {
  title: string;
  authors: string[];
};

export async function parseEpub(bytes: Buffer): Promise<ParsedEpub> {
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

  const titles = dcValues(opf, 'title');
  const authors = dcValues(opf, 'creator');
  return {
    title: titles[0] ?? '',
    authors,
  };
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
