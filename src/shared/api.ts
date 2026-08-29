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

export type ZhiliuApi = {
  vault: {
    current(): Promise<VaultStatus>;
    choose(): Promise<VaultStatus>;
  };
  notes: {
    save(input: SaveNoteInput): Promise<AtomicNote>;
    get(id: string): Promise<AtomicNote | null>;
  };
};
