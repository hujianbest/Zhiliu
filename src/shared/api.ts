export type NoteRelation = {
  type: string;
  id: string;
};

export type AtomicNote = {
  id: string;
  kind: 'excerpt' | 'thought_note';
  sourceId: string | null;
  sourcePosition: string | null;
  quotation: string;
  thought: string;
  created: string;
  updated: string;
  provenance: {
    quotation: 'source';
    thought: 'user';
  };
  relations: NoteRelation[];
  path: string;
};

export type SaveNoteInput = {
  quotation: string;
  thought?: string;
  sourceId?: string;
  sourcePosition?: string;
  relations?: NoteRelation[];
};

export type VaultStatus = {
  firstRun: boolean;
  path: string | null;
};

export type ModelRole = 'fast' | 'deep';

export type ProbeResult = 'ok' | 'unauthorized' | 'unreachable';

export type ProbeOutcome = {
  result: ProbeResult;
};

export type ModelRoleView = {
  baseUrl: string;
  model: string;
  hasKey: boolean;
};

export type ModelSettingsView = {
  configured: boolean;
  fast: ModelRoleView;
  deep: ModelRoleView;
};

export type SaveModelRoleInput = {
  baseUrl: string;
  model: string;
  apiKey: string;
};

export type SaveModelSettingsInput = {
  fast: SaveModelRoleInput;
  deep: SaveModelRoleInput;
};

export type IndexStatus = 'pending' | 'indexing' | 'ready' | 'error';

export type SourceKind = 'epub';

export type ReadingStatus = 'unread' | 'reading' | 'read';

export type SourceDocument = {
  id: string;
  kind: SourceKind;
  title: string;
  authors: string[];
  indexStatus: IndexStatus;
  originalFilename: string;
  readingStatus: ReadingStatus;
};

export type ImportFailure = {
  filename: string;
  message: string;
};

export type ImportResult = {
  sources: SourceDocument[];
  failures: ImportFailure[];
};

export type TurnDirection = 'prev' | 'next';

export type TocEntry = {
  label: string;
  spineIndex: number;
};

export type ReadingView = {
  sourceId: string;
  title: string;
  chapterLabel: string;
  html: string;
  hasPrev: boolean;
  hasNext: boolean;
  toc: TocEntry[];
  status: ReadingStatus;
  spineIndex: number;
};

export type SearchKind = 'epub' | 'note' | 'article' | 'draft';

export type SearchHit = {
  kind: SearchKind;
  title: string;
  snippet: string;
  sourceId: string;
  noteId?: string;
  sourcePosition?: string;
  spineIndex?: number;
  partialIndex: boolean;
};

export type ZhiliuApi = {
  vault: {
    current(): Promise<VaultStatus>;
    choose(): Promise<VaultStatus>;
  };
  notes: {
    save(input: SaveNoteInput): Promise<AtomicNote>;
    get(id: string): Promise<AtomicNote | null>;
    listForSource(sourceId: string): Promise<AtomicNote[]>;
  };
  search: {
    query(q: string): Promise<SearchHit[]>;
  };
  models: {
    view(): Promise<ModelSettingsView>;
    save(input: SaveModelSettingsInput): Promise<ModelSettingsView>;
    probe(input: { baseUrl: string; apiKey: string; role?: ModelRole }): Promise<ProbeOutcome>;
  };
  library: {
    list(): Promise<SourceDocument[]>;
    importEpubs(): Promise<ImportResult>;
    open(id: string): Promise<ReadingView>;
    turn(direction: TurnDirection): Promise<ReadingView>;
    jump(spineIndex: number): Promise<ReadingView>;
    close(): Promise<void>;
    resume(): Promise<ReadingView | null>;
    markRead(id: string): Promise<ReadingStatus>;
    unmarkRead(id: string): Promise<ReadingStatus>;
    recordAgentLook(sourceId: string): Promise<void>;
  };
};
