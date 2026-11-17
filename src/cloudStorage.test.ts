import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudStorage, type CloudBackend, type SyncStatus } from './cloudStorage';
import { DRAFT_KEY, SAVED_KEY, readDraft, readSaved, type Snapshot } from './storage';
import { routeKey } from './routing';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return { get length() { return data.size; }, key: index => [...data.keys()][index] ?? null, getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); }, clear: () => data.clear() };
}
type Key = 'draft' | 'saved';
class MemoryBackend implements CloudBackend {
  rows = new Map<Key, { payload: unknown; revision: number }>();
  offline = false;
  async read() { if (this.offline) throw new Error('offline'); return [...this.rows].map(([document_key, row]) => ({ document_key, ...row })); }
  async insert(key: Key, payload: unknown) { if (this.offline) throw new Error('offline'); if (this.rows.has(key)) return null; this.rows.set(key, { payload, revision: 1 }); return 1; }
  async update(key: Key, payload: unknown, revision: number) { if (this.offline) throw new Error('offline'); if (this.rows.get(key)?.revision !== revision) return null; this.rows.set(key, { payload, revision: revision + 1 }); return revision + 1; }
}
const sample: Snapshot = { version: 1, name: 'Alpes', activity: 'gravel', points: [{ id: 'a', lat: 45, lng: 6 }, { id: 'b', lat: 46, lng: 7 }], boundaries: [], cached: null };
beforeEach(() => { vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() }); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('synchronisation privée', () => {
  it('charge le compte puis enregistre les changements avec une révision', async () => {
    const local = memoryStorage(), backend = new MemoryBackend(), states: SyncStatus[] = [];
    backend.rows.set('draft', { payload: sample, revision: 2 });
    const store = new CloudStorage(local, backend, 'user-1', status => states.push(status));
    await store.initialize();
    expect(JSON.parse(store.getItem(DRAFT_KEY)!)).toEqual(sample);
    store.setItem(DRAFT_KEY, JSON.stringify({ ...sample, name: 'Nouveau nom' }));
    expect(await store.flush()).toBe(true);
    expect(backend.rows.get('draft')).toEqual({ payload: { ...sample, name: 'Nouveau nom' }, revision: 3 });
    expect(states.at(-1)).toBe('synced');
    store.dispose();
  });
  it('retrouve les parcours après réorganisation des champs JSON par la base', async () => {
    const backend = new MemoryBackend();
    const points = sample.points;
    const route = { coordinates: [[45, 6], [46, 7]] as [number, number][], legs: [[[45, 6], [46, 7]]] as [number, number][][], distance: 500 };
    const cached = { key: JSON.stringify([sample.activity, points]), activity: sample.activity, points, route };
    const original = { ...sample, cached };
    // PostgreSQL jsonb peut renvoyer les champs des objets dans un ordre différent.
    const reordered = JSON.parse(JSON.stringify(original), (_key, value) => value && !Array.isArray(value) && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse()) : value);
    backend.rows.set('draft', { payload: reordered, revision: 1 });
    backend.rows.set('saved', { payload: [{ id: '1', updatedAt: '2026-01-01', snapshot: reordered }], revision: 1 });
    const store = new CloudStorage(memoryStorage(), backend, 'user-1', () => {});
    await store.initialize();
    expect(readDraft(store)?.cached?.route).toEqual(route);
    expect(readSaved(store)[0].snapshot.cached?.route).toEqual(route);
    expect(readDraft(store)?.cached?.key).toBe(routeKey(sample.activity, reordered.cached.points));
    store.dispose();
  });
  it('conserve les modifications hors ligne et les envoie après reconnexion', async () => {
    const local = memoryStorage(), backend = new MemoryBackend();
    backend.rows.set('draft', { payload: sample, revision: 1 });
    let store = new CloudStorage(local, backend, 'user-1', () => {});
    await store.initialize(); backend.offline = true;
    store.setItem(DRAFT_KEY, JSON.stringify({ ...sample, name: 'Hors ligne' }));
    expect(await store.flush()).toBe(false);
    store.dispose(); backend.offline = false;
    store = new CloudStorage(local, backend, 'user-1', () => {});
    await store.initialize();
    expect(JSON.parse(store.getItem(DRAFT_KEY)!).name).toBe('Hors ligne');
    expect(await store.flush()).toBe(true);
    expect((backend.rows.get('draft')?.payload as Snapshot).name).toBe('Hors ligne');
    store.dispose();
  });
  it('n’écrase pas une modification distante et permet de choisir une version', async () => {
    const local = memoryStorage(), backend = new MemoryBackend(), states: SyncStatus[] = [];
    backend.rows.set('draft', { payload: sample, revision: 1 });
    const store = new CloudStorage(local, backend, 'user-1', status => states.push(status));
    await store.initialize();
    store.setItem(DRAFT_KEY, JSON.stringify({ ...sample, name: 'Local' }));
    backend.rows.set('draft', { payload: { ...sample, name: 'Autre appareil' }, revision: 2 });
    expect(await store.flush()).toBe(false);
    expect(states.at(-1)).toBe('conflict');
    expect(JSON.parse(store.getItem(DRAFT_KEY)!).name).toBe('Local');
    await store.resolveConflict('remote');
    expect(JSON.parse(store.getItem(DRAFT_KEY)!).name).toBe('Autre appareil');
    expect(backend.rows.get('draft')?.revision).toBe(2);
    store.dispose();
  });
  it('n’efface pas une modification effectuée pendant un envoi', async () => {
    const local = memoryStorage(), backend = new MemoryBackend();
    backend.rows.set('draft', { payload: sample, revision: 1 });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const update = backend.update.bind(backend);
    let first = true;
    backend.update = async (...args) => { if (first) { first = false; await gate; } return update(...args); };
    const store = new CloudStorage(local, backend, 'user-1', () => {});
    await store.initialize();
    store.setItem(DRAFT_KEY, JSON.stringify({ ...sample, name: 'Premier' }));
    const flushing = store.flush();
    store.setItem(DRAFT_KEY, JSON.stringify({ ...sample, name: 'Dernier' }));
    release();
    expect(await flushing).toBe(true);
    expect((backend.rows.get('draft')?.payload as Snapshot).name).toBe('Dernier');
    expect(backend.rows.get('draft')?.revision).toBe(3);
    store.dispose();
  });
  it('envoie aussi un brouillon modifié pendant l’envoi des parcours', async () => {
    const backend = new MemoryBackend();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const insert = backend.insert.bind(backend);
    backend.insert = async (...args) => { if (args[0] === 'saved') await gate; return insert(...args); };
    const store = new CloudStorage(memoryStorage(), backend, 'user-1', () => {});
    await store.initialize();
    store.setItem(SAVED_KEY, JSON.stringify([{ id: '1', updatedAt: '2026-01-01', snapshot: sample }]));
    const flushing = store.flush();
    store.setItem(DRAFT_KEY, JSON.stringify(sample));
    release();
    expect(await flushing).toBe(true);
    expect(backend.rows.get('draft')?.payload).toEqual(sample);
    store.dispose();
  });
  it('isole les caches locaux entre comptes', async () => {
    const local = memoryStorage(), backend1 = new MemoryBackend(), backend2 = new MemoryBackend();
    const one = new CloudStorage(local, backend1, 'user-1', () => {}), two = new CloudStorage(local, backend2, 'user-2', () => {});
    await one.initialize(); await two.initialize();
    one.setItem(SAVED_KEY, JSON.stringify([{ id: '1', updatedAt: '2026-01-01', snapshot: sample }]));
    expect(two.getItem(SAVED_KEY)).toBeNull();
    one.dispose(); two.dispose();
  });
});
