import { DRAFT_KEY, SAVED_KEY, isSnapshot, readSaved, type SavedRoute, type Snapshot } from './storage';

export type Backup = { format: 'openworld-backup'; version: 1; draft: Snapshot | null; savedRoutes: SavedRoute[] };
export function createBackup(draft: Snapshot | null, savedRoutes: SavedRoute[]): string {
  return JSON.stringify({ format: 'openworld-backup', version: 1, draft, savedRoutes } satisfies Backup);
}
export function parseBackup(text: string): Backup {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('Ce fichier de sauvegarde est illisible.'); }
  if (!data || typeof data !== 'object') throw new Error('Ce fichier de sauvegarde est invalide.');
  const backup = data as Backup;
  if (backup.format !== 'openworld-backup' || backup.version !== 1 || (backup.draft !== null && !isSnapshot(backup.draft)) || !Array.isArray(backup.savedRoutes) || backup.savedRoutes.length > 1000 || !backup.savedRoutes.every(entry => entry && typeof entry.id === 'string' && entry.id.length > 0 && typeof entry.updatedAt === 'string' && Number.isFinite(Date.parse(entry.updatedAt)) && isSnapshot(entry.snapshot)) || new Set(backup.savedRoutes.map(entry => entry.id)).size !== backup.savedRoutes.length) throw new Error('Ce fichier ne contient pas une sauvegarde OpenWorld valide.');
  return backup;
}
/** Merge saved routes, rolling back both keys if the browser runs out of space. */
export function restoreBackup(storage: Storage, backup: Backup): SavedRoute[] {
  const oldSaved = storage.getItem(SAVED_KEY);
  const oldDraft = storage.getItem(DRAFT_KEY);
  const merged = [...backup.savedRoutes, ...readSaved(storage).filter(entry => !backup.savedRoutes.some(item => item.id === entry.id))];
  try {
    storage.setItem(SAVED_KEY, JSON.stringify(merged));
    if (backup.draft) storage.setItem(DRAFT_KEY, JSON.stringify(backup.draft));
  } catch {
    try {
      if (oldSaved === null) storage.removeItem(SAVED_KEY); else storage.setItem(SAVED_KEY, oldSaved);
      if (oldDraft === null) storage.removeItem(DRAFT_KEY); else storage.setItem(DRAFT_KEY, oldDraft);
    } catch { throw new Error('Le stockage est plein et la restauration automatique a échoué. Gardez votre fichier de sauvegarde.'); }
    throw new Error('Import impossible : le stockage du navigateur est plein ou indisponible.');
  }
  return merged;
}
