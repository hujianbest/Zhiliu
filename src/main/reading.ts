import { readFile } from 'node:fs/promises';
import type { ReadingView, TurnDirection } from '../shared/api';
import { extractReading, type EpubChapter } from './epub';
import type { Library } from './library';

type Session = {
  title: string;
  chapters: EpubChapter[];
  index: number;
};

export class Reading {
  private session: Session | null = null;

  constructor(private readonly library: Library) {}

  async open(id: string): Promise<ReadingView> {
    const source = await this.library.get(id);
    if (!source) {
      throw new Error('找不到这本书');
    }
    const bytes = await readFile(this.library.sourcePath(id));
    const extracted = await extractReading(bytes);
    this.session = {
      title: source.title || extracted.title,
      chapters: extracted.chapters,
      index: 0,
    };
    return this.view();
  }

  turn(direction: TurnDirection): ReadingView {
    const session = this.requireSession();
    if (direction === 'next' && session.index < session.chapters.length - 1) {
      session.index += 1;
    }
    if (direction === 'prev' && session.index > 0) {
      session.index -= 1;
    }
    return this.view();
  }

  private view(): ReadingView {
    const session = this.requireSession();
    const chapter = session.chapters[session.index];
    return {
      title: session.title,
      chapterLabel: chapter.label,
      html: chapter.html,
      hasPrev: session.index > 0,
      hasNext: session.index < session.chapters.length - 1,
    };
  }

  private requireSession(): Session {
    if (!this.session) {
      throw new Error('还没有打开这本书');
    }
    return this.session;
  }
}
