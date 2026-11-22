import { DRAFT_KEY, SAVED_KEY, isSnapshot, type SavedRoute } from './storage';
import { LIBRARY_KEY, isLibrary } from './library';

type DocumentKey = 'draft' | 'saved' | 'library';
type RemoteRow = { document_key: DocumentKey; payload: unknown; revision: number };
type SyncMeta = { revision: number | null; dirty: boolean };
export type SyncStatus = 'synced' | 'saving' | 'offline' | 'conflict';
export interface CloudBackend {
  read(): Promise<RemoteRow[]>;
  insert(key: DocumentKey, payload: unknown): Promise<number | null>;
  update(key: DocumentKey, payload: unknown, revision: number): Promise<number | null>;
}
const keys: Record<DocumentKey, string> = { draft: DRAFT_KEY, saved: SAVED_KEY, library: LIBRARY_KEY };
const documents: DocumentKey[] = ['draft', 'saved', 'library'];
function documentFor(key: string): DocumentKey | undefined { return documents.find(name => keys[name] === key); }
function validPayload(key: DocumentKey, value: unknown): boolean {
  if (key === 'draft') return value === null || isSnapshot(value);
  if (key === 'library') return isLibrary(value);
  return Array.isArray(value) && value.length <= 1000 && value.every((entry: SavedRoute) => entry && typeof entry.id === 'string' && typeof entry.updatedAt === 'string' && isSnapshot(entry.snapshot));
}

/** Local durable cache and revision-checked cloud writes for one authenticated user. */
export class CloudStorage implements Storage {
  private prefix: string;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<boolean> | null = null;
  private disposed = false;
  private conflict = false;
  private readonly online = () => { if (!this.conflict) void this.flush(); };
  constructor(private local: Storage, private backend: CloudBackend, userId: string, private onStatus: (status: SyncStatus) => void) {
    this.prefix = `openworld.account.${userId}.`;
    window.addEventListener('online', this.online);
  }
  get length() { return documents.filter(key => this.getItem(keys[key]) !== null).length; }
  key(index: number) { return documents.map(key => keys[key]).filter(key => this.getItem(key) !== null)[index] ?? null; }
  getItem(key: string) { return this.local.getItem(this.prefix + key); }
  private metaKey(key: DocumentKey) { return `${this.prefix}sync.${key}`; }
  private readMeta(key: DocumentKey): SyncMeta {
    const raw = this.local.getItem(this.metaKey(key));
    if (!raw) return { revision: null, dirty: false };
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') throw new Error('État de synchronisation illisible.');
    const meta = value as SyncMeta;
    if ((meta.revision !== null && (!Number.isSafeInteger(meta.revision) || meta.revision < 1)) || typeof meta.dirty !== 'boolean') throw new Error('État de synchronisation invalide.');
    return meta;
  }
  private writeMeta(key: DocumentKey, meta: SyncMeta) { this.local.setItem(this.metaKey(key), JSON.stringify(meta)); }
  setItem(key: string, value: string) {
    const document = documentFor(key);
    if (!document) { this.local.setItem(this.prefix + key, value); return; }
    if (this.getItem(key) === value) return;
    const parsed: unknown = JSON.parse(value);
    if (!validPayload(document, parsed)) throw new Error('Sauvegarde invalide.');
    const meta = this.readMeta(document);
    // Mark pending first so a failed quota write cannot silently look synchronized.
    this.writeMeta(document, { ...meta, dirty: true });
    this.local.setItem(this.prefix + key, value);
    this.schedule();
  }
  removeItem(key: string) {
    const document = documentFor(key);
    if (!document) { this.local.removeItem(this.prefix + key); return; }
    if (this.getItem(key) === null) return;
    const meta = this.readMeta(document);
    this.writeMeta(document, { ...meta, dirty: true });
    this.local.removeItem(this.prefix + key);
    this.schedule();
  }
  clear() { for (const key of documents) this.removeItem(keys[key]); }
  private schedule() {
    if (this.disposed || this.conflict) return;
    this.onStatus('saving');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 700);
  }
  async initialize(): Promise<void> {
    const rows = await this.backend.read();
    if (this.disposed) return;
    this.validateRows(rows);
    for (const key of documents) {
      const row = rows.find(item => item.document_key === key);
      const meta = this.readMeta(key);
      if (meta.dirty && meta.revision !== (row?.revision ?? null)) { this.conflict = true; continue; }
      if (!meta.dirty) {
        if (row?.payload == null) this.local.removeItem(this.prefix + keys[key]);
        else this.local.setItem(this.prefix + keys[key], JSON.stringify(row.payload));
        this.writeMeta(key, { revision: row?.revision ?? null, dirty: false });
      }
    }
    if (this.conflict) this.onStatus('conflict');
    else if (documents.some(key => this.readMeta(key).dirty)) this.schedule();
    else this.onStatus('synced');
  }
  private validateRows(rows: RemoteRow[]) {
    if (!Array.isArray(rows) || new Set(rows.map(row => row.document_key)).size !== rows.length) throw new Error('Données distantes invalides.');
    for (const row of rows) if (!documents.includes(row.document_key) || !Number.isSafeInteger(row.revision) || row.revision < 1 || !validPayload(row.document_key, row.payload)) throw new Error('Les données distantes sont invalides ; aucune modification locale n’a été remplacée.');
  }
  async resolveConflict(choice: 'local' | 'remote'): Promise<void> {
    const rows = await this.backend.read();
    this.validateRows(rows);
    for (const key of documents) {
      const row = rows.find(item => item.document_key === key);
      const meta = this.readMeta(key);
      if (choice === 'remote' || !meta.dirty) {
        if (row?.payload == null) this.local.removeItem(this.prefix + keys[key]);
        else this.local.setItem(this.prefix + keys[key], JSON.stringify(row.payload));
        this.writeMeta(key, { revision: row?.revision ?? null, dirty: false });
      } else this.writeMeta(key, { revision: row?.revision ?? null, dirty: true });
    }
    this.conflict = false;
    if (documents.some(key => this.readMeta(key).dirty)) this.schedule();
    else this.onStatus('synced');
  }
  hasRemoteOrPending() { return documents.some(key => { const meta = this.readMeta(key); return meta.revision !== null || meta.dirty; }); }
  async flush(): Promise<boolean> {
    clearTimeout(this.timer);
    if (this.disposed || this.conflict) return false;
    if (this.running) return this.running;
    this.running = this.flushDocuments().finally(() => { this.running = null; });
    return this.running;
  }
  private async flushDocuments(): Promise<boolean> {
    try {
      do {
      for (const key of documents) {
        while (!this.disposed && this.readMeta(key).dirty) {
          this.onStatus('saving');
          const meta = this.readMeta(key), raw = this.getItem(keys[key]);
          const payload: unknown = raw === null ? (key === 'saved' || key === 'library' ? [] : null) : JSON.parse(raw);
          if (!validPayload(key, payload)) throw new Error('Sauvegarde locale invalide.');
          const revision = meta.revision === null ? await this.backend.insert(key, payload) : await this.backend.update(key, payload, meta.revision);
          if (this.disposed) return false;
          if (revision === null) { this.conflict = true; this.onStatus('conflict'); return false; }
          // A later local edit must remain pending while taking the new remote revision.
          this.writeMeta(key, { revision, dirty: this.getItem(keys[key]) !== raw });
        }
      }
      } while (!this.disposed && documents.some(key => this.readMeta(key).dirty));
      if (!this.disposed) this.onStatus('synced');
      return !this.disposed;
    } catch {
      if (!this.disposed) { this.onStatus('offline'); this.timer = setTimeout(() => void this.flush(), 10000); }
      return false;
    }
  }
  dispose() { this.disposed = true; clearTimeout(this.timer); window.removeEventListener('online', this.online); }
}
