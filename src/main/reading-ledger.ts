import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ReadingStatus } from '../shared/api';

export type { ReadingStatus };

export type BookProgress = {
  spineIndex: number;
  status: ReadingStatus;
  opened: boolean;
};

type ReadingFile = {
  version: 1;
  books: Record<string, BookProgress>;
};

function empty(): ReadingFile {
  return { version: 1, books: {} };
}

export async function readProgress(vaultRoot: string): Promise<ReadingFile> {
  try {
    const parsed = JSON.parse(await readFile(path.join(vaultRoot, '.zhiliu', 'reading.json'), 'utf8')) as ReadingFile;
    if (parsed?.version !== 1 || typeof parsed.books !== 'object' || parsed.books === null) {
      return empty();
    }
    return parsed;
  } catch {
    return empty();
  }
}

export async function getBookProgress(vaultRoot: string, id: string): Promise<BookProgress | null> {
  return (await readProgress(vaultRoot)).books[id] ?? null;
}

export async function putBookProgress(
  vaultRoot: string,
  id: string,
  progress: BookProgress,
): Promise<BookProgress> {
  const file = await readProgress(vaultRoot);
  file.books[id] = progress;
  await writeFile(
    path.join(vaultRoot, '.zhiliu', 'reading.json'),
    `${JSON.stringify(file, null, 2)}\n`,
    'utf8',
  );
  return progress;
}
