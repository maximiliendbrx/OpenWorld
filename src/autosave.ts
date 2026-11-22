import type { Snapshot } from './storage';

/** Empreinte du contenu éditable d'un parcours (hors position sur la carte et brouillon). */
export function routeSignature(s: Pick<Snapshot, 'name' | 'activity' | 'avoidFastRoads' | 'points' | 'boundaries' | 'mandatory' | 'cached' | 'collections'>): string {
  return JSON.stringify([s.name, s.activity, s.avoidFastRoads ?? false, s.points.map(p => [p.id, p.lat, p.lng, p.startsNewStage ?? false]), s.boundaries, (s.mandatory ?? []).map(m => m.id), s.cached?.key ?? null, s.collections ?? []]);
}

export const AUTOSAVE_DELAY_MS = 1500;
/** Un nouveau parcours n'est enregistré automatiquement qu'à partir de 2 points. */
export const AUTOSAVE_MIN_POINTS = 2;
