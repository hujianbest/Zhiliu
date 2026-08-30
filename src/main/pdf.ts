import sanitizeHtml from 'sanitize-html';

export type ParsedPdf = {
  title: string;
  authors: string[];
};

export type PdfPage = {
  label: string;
  html: string;
  hasText: boolean;
};

export type PdfTocEntry = {
  label: string;
  spineIndex: number;
};

export type PdfReading = {
  title: string;
  pages: PdfPage[];
  toc: PdfTocEntry[];
};

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadPdf(bytes: Buffer) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  try {
    return await getDocument({
      data: new Uint8Array(bytes),
      disableWorker: true,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;
  } catch {
    throw new Error('无法打开：不是有效的 PDF');
  }
}

export async function parsePdf(bytes: Buffer): Promise<ParsedPdf> {
  const pdf = await loadPdf(bytes);
  const meta = await pdf.getMetadata().catch(() => null);
  const info = (meta?.info ?? {}) as { Title?: string; Author?: string };
  const authors = info.Author ? [info.Author] : [];
  return {
    title: info.Title?.trim() ?? '',
    authors,
  };
}

export async function extractPdfReading(bytes: Buffer): Promise<PdfReading> {
  const pdf = await loadPdf(bytes);
  if (pdf.numPages < 1) {
    throw new Error('无法打开：没有可阅读的页面');
  }
  const meta = await pdf.getMetadata().catch(() => null);
  const info = (meta?.info ?? {}) as { Title?: string };
  const pages: PdfPage[] = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const viewport = page.getViewport({ scale: 1.25 });
    const text = await page.getTextContent();
    const spans: string[] = [];
    for (const item of text.items) {
      if (!('str' in item) || !item.str) {
        continue;
      }
      const transform = item.transform as number[];
      const x = transform[4] * 1.25;
      const y = transform[5] * 1.25;
      const height = Math.abs(transform[3]) * 1.25 || 16;
      const top = viewport.height - y - height;
      spans.push(
        `<span style="position:absolute;left:${x.toFixed(1)}px;top:${top.toFixed(1)}px;font-size:${height.toFixed(1)}px;white-space:pre">${escapeText(item.str)}</span>`,
      );
    }
    const inner = spans.join('') || '';
    const html = sanitizeHtml(
      `<article class="pdf-page" data-page="${number - 1}" style="position:relative;width:${viewport.width.toFixed(0)}px;height:${viewport.height.toFixed(0)}px;background:#f7f1e6">${inner}</article>`,
      {
        allowedTags: ['article', 'span'],
        allowedAttributes: {
          article: ['class', 'data-page', 'style'],
          span: ['style'],
        },
      },
    );
    pages.push({
      label: `第 ${number} 页`,
      html,
      hasText: spans.length > 0,
    });
  }

  const toc: PdfTocEntry[] = [];
  const outline = await pdf.getOutline().catch(() => null);
  if (outline) {
    for (const entry of outline) {
      const spineIndex = await outlinePageIndex(pdf, entry.dest);
      if (spineIndex === null) {
        continue;
      }
      toc.push({ label: entry.title || `第 ${spineIndex + 1} 页`, spineIndex });
    }
  }

  return {
    title: info.Title?.trim() ?? '',
    pages,
    toc,
  };
}

async function outlinePageIndex(
  pdf: { getPageIndex(ref: unknown): Promise<number>; getDestination(name: string): Promise<unknown> },
  dest: unknown,
): Promise<number | null> {
  try {
    let target = dest;
    if (typeof dest === 'string') {
      target = await pdf.getDestination(dest);
    }
    if (!Array.isArray(target) || target.length === 0) {
      return null;
    }
    const index = await pdf.getPageIndex(target[0]);
    return Number.isInteger(index) ? index : null;
  } catch {
    return null;
  }
}
