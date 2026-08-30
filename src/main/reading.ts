import { readFile } from 'node:fs/promises';
import type { ReadingStatus, ReadingView, TurnDirection } from '../shared/api';
import { extractReading, type EpubChapter, type EpubTocEntry } from './epub';
import type { Library } from './library';
import type { PreferenceStore } from './preferences';
import { getBookProgress, putBookProgress } from './reading-ledger';

type Session = {
  id: string;
  title: string;
  chapters: EpubChapter[];
  toc: EpubTocEntry[];
  index: number;
  status: ReadingStatus;
  opened: boolean;
};

export class Reading {
  private session: Session | null = null;

  constructor(
    private readonly library: Library,
    private readonly preferences: PreferenceStore,
  ) {}

  async open(id: string): Promise<ReadingView> {
    const source = await this.library.get(id);
    if (!source) {
      throw new Error('找不到这本书');
    }
    const bytes = await readFile(this.library.sourcePath(id));
    const extracted = await extractReading(bytes);
    const saved = await getBookProgress(this.library.root(), id);
    const last = saved?.spineIndex ?? 0;
    const index = Math.min(Math.max(0, last), extracted.chapters.length - 1);
    this.session = {
      id,
      title: source.title || extracted.title,
      chapters: extracted.chapters,
      toc: extracted.toc,
      index,
      status: saved?.status === 'read' ? 'read' : 'reading',
      opened: true,
    };
    await this.persist(true);
    return this.view();
  }

  async turn(direction: TurnDirection): Promise<ReadingView> {
    const session = this.requireSession();
    if (direction === 'next' && session.index < session.chapters.length - 1) {
      session.index += 1;
    }
    if (direction === 'prev' && session.index > 0) {
      session.index -= 1;
    }
    this.touchReading();
    await this.persist(true);
    return this.view();
  }

  async jump(spineIndex: number): Promise<ReadingView> {
    const session = this.requireSession();
    if (Number.isInteger(spineIndex) && spineIndex >= 0 && spineIndex < session.chapters.length) {
      session.index = spineIndex;
    }
    this.touchReading();
    await this.persist(true);
    return this.view();
  }

  async resume(): Promise<ReadingView | null> {
    const id = (await this.preferences.read()).openSourceId;
    if (!id) {
      return null;
    }
    try {
      return await this.open(id);
    } catch {
      await this.preferences.update({ openSourceId: null });
      return null;
    }
  }

  async close(): Promise<void> {
    this.session = null;
    await this.preferences.update({ openSourceId: null });
  }

  async markRead(id: string): Promise<ReadingStatus> {
    return this.setStatus(id, 'read');
  }

  async unmarkRead(id: string): Promise<ReadingStatus> {
    const saved = await getBookProgress(this.library.root(), id);
    const status: ReadingStatus = saved?.opened ? 'reading' : 'unread';
    return this.setStatus(id, status);
  }

  async recordAgentLook(_sourceId: string): Promise<void> {
    // Analysis of a source must never write reading status (US 25 / ticket 06).
  }

  private async setStatus(id: string, status: ReadingStatus): Promise<ReadingStatus> {
    const saved = (await getBookProgress(this.library.root(), id)) ?? {
      spineIndex: 0,
      status: 'unread' as ReadingStatus,
      opened: false,
    };
    await putBookProgress(this.library.root(), id, { ...saved, status });
    if (this.session?.id === id) {
      this.session.status = status;
    }
    return status;
  }

  private touchReading(): void {
    const session = this.requireSession();
    if (session.status === 'unread') {
      session.status = 'reading';
    }
  }

  private async persist(keepOpen: boolean): Promise<void> {
    const session = this.requireSession();
    await putBookProgress(this.library.root(), session.id, {
      spineIndex: session.index,
      status: session.status,
      opened: session.opened,
    });
    await this.preferences.update({ openSourceId: keepOpen ? session.id : null });
  }

  private view(): ReadingView {
    const session = this.requireSession();
    const chapter = session.chapters[session.index];
    return {
      sourceId: session.id,
      title: session.title,
      chapterLabel: chapter.label,
      html: chapter.html,
      hasPrev: session.index > 0,
      hasNext: session.index < session.chapters.length - 1,
      toc: session.toc,
      status: session.status,
    };
  }

  private requireSession(): Session {
    if (!this.session) {
      throw new Error('还没有打开这本书');
    }
    return this.session;
  }
}
