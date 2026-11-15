import { describe, expect, it } from 'vitest';
import { DRAFT_KEY, SAVED_KEY, readDraft, readSaved, writeDraft, writeSaved, type Snapshot } from './storage';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, clear: () => values.clear(), getItem: key => values.get(key) ?? null, key: index => [...values.keys()][index] ?? null, removeItem: key => { values.delete(key); }, setItem: (key, value) => { values.set(key, value); } };
}
const sample: Snapshot = { version: 1, name: 'Alpes', activity: 'gravel', points: [{ id: 'a', lat: 45, lng: 6 }, { id: 'b', lat: 46, lng: 7 }], boundaries: [], cached: null };
describe('sauvegardes locales', () => {
  it('remplace le brouillon unique et restaure sa dernière version', () => {
    const storage = memoryStorage();
    writeDraft(storage, sample);
    writeDraft(storage, { ...sample, name: 'Alpes modifiées' });
    expect(storage.length).toBe(1);
    expect(readDraft(storage)?.name).toBe('Alpes modifiées');
    writeDraft(storage, { ...sample, points: [] });
    expect(readDraft(storage)).toBeNull();
  });
  it('conserve plusieurs parcours distincts en plus du brouillon', () => {
    const storage = memoryStorage();
    writeDraft(storage, sample);
    writeSaved(storage, [{ id: '1', updatedAt: '2026-01-01T00:00:00Z', snapshot: sample }, { id: '2', updatedAt: '2026-01-02T00:00:00Z', snapshot: { ...sample, name: 'Retour' } }]);
    expect(readSaved(storage).map(entry => entry.snapshot.name)).toEqual(['Alpes', 'Retour']);
    expect(storage.length).toBe(2);
    expect(storage.getItem(DRAFT_KEY)).not.toBeNull();
    expect(storage.getItem(SAVED_KEY)).not.toBeNull();
  });
  it('restaure le tracé détaillé et les altitudes du GPX dans le brouillon', () => {
    const storage = memoryStorage();
    const route = { coordinates: [[45, 6], [45.5, 6.5], [46, 7]] as [number, number][], legs: [[[45, 6], [45.5, 6.5], [46, 7]]] as [number, number][][], distance: 500, legDistances: [500], legAscents: [50], elevations: [100, 125, 150], legElevations: [[100, 125, 150]] };
    const cached = { key: JSON.stringify([sample.activity, sample.points]), activity: sample.activity, points: sample.points, route };
    writeDraft(storage, { ...sample, cached });
    expect(readDraft(storage)?.cached?.route).toEqual(route);
  });
  it('restaure des étapes séparées sans ajouter de liaison', () => {
    const storage = memoryStorage();
    const points = [...sample.points, { id: 'c', lat: 47, lng: 8, startsNewStage: true }, { id: 'd', lat: 48, lng: 9 }];
    const route = { coordinates: [[45, 6], [46, 7], [47, 8], [48, 9]] as [number, number][], legs: [[[45, 6], [46, 7]], [], [[47, 8], [48, 9]]] as [number, number][][], distance: 500, legDistances: [200, 0, 300], legAscents: [10, 0, 20], legElevations: [[100, 110], [], [120, 140]], elevations: [100, 110, 120, 140] };
    const cached = { key: JSON.stringify([sample.activity, points]), activity: sample.activity, points, route };
    writeDraft(storage, { ...sample, points, boundaries: ['b'], cached });
    expect(readDraft(storage)?.cached?.route.legs[1]).toEqual([]);
    expect(readDraft(storage)?.points[2].startsNewStage).toBe(true);
  });
  it('ne masque pas les erreurs de stockage plein', () => {
    const storage = memoryStorage();
    storage.setItem = () => { throw new Error('QuotaExceededError'); };
    expect(() => writeDraft(storage, sample)).toThrow('QuotaExceededError');
    expect(() => writeSaved(storage, [{ id: '1', updatedAt: '2026-01-01T00:00:00Z', snapshot: sample }])).toThrow('QuotaExceededError');
  });
  it('ignore un brouillon corrompu sans effacer son contenu', () => {
    const storage = memoryStorage();
    storage.setItem(DRAFT_KEY, '{invalide');
    expect(readDraft(storage)).toBeNull();
    expect(storage.getItem(DRAFT_KEY)).toBe('{invalide');
  });
});
