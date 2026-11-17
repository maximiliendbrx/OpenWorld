import { expect, it } from 'vitest';
import { createBackup, parseBackup, restoreBackup } from './backup';
import { readDraft, readSaved, writeDraft, writeSaved, type Snapshot } from './storage';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, clear: () => values.clear(), getItem: key => values.get(key) ?? null, key: index => [...values.keys()][index] ?? null, removeItem: key => { values.delete(key); }, setItem: (key, value) => { values.set(key, value); } };
}
const draft: Snapshot = { version: 1, name: 'Mon brouillon', activity: 'gravel', points: [{ id: 'a', lat: 45, lng: 6 }, { id: 'b', lat: 46, lng: 7 }], boundaries: [], cached: null, avoidFastRoads: true };
it('transfère le brouillon et les parcours enregistrés sans supprimer les parcours existants', () => {
  const storage = memoryStorage();
  writeSaved(storage, [{ id: 'existing', updatedAt: '2026-01-01T00:00:00Z', snapshot: draft }]);
  const backup = parseBackup(createBackup(draft, [{ id: 'new', updatedAt: '2026-02-01T00:00:00Z', snapshot: draft }]));
  restoreBackup(storage, backup);
  expect(readDraft(storage)).toEqual(draft);
  expect(readSaved(storage).map(entry => entry.id)).toEqual(['new', 'existing']);
});
it('refuse les fichiers invalides et rétablit le stockage si la restauration échoue', () => {
  expect(() => parseBackup('{"format":"autre"}')).toThrow();
  const storage = memoryStorage();
  writeDraft(storage, draft);
  const original = storage.setItem.bind(storage);
  let fail = true;
  storage.setItem = (key, value) => { if (key === 'openworld.draft.v1' && fail) { fail = false; throw new Error('quota'); } original(key, value); };
  expect(() => restoreBackup(storage, parseBackup(createBackup({ ...draft, name: 'Modifié' }, [])))).toThrow('stockage');
  expect(readDraft(storage)).toEqual(draft);
  expect(readSaved(storage)).toEqual([]);
});
