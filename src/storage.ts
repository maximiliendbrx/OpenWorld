import type { Activity, Point, Route } from './routing';

export type CachedRoute = { key: string; activity: Activity; points: Point[]; route: Route };
export type Snapshot = { version: 1; name: string; activity: Activity; points: Point[]; boundaries: string[]; cached: CachedRoute | null; savedId?: string | null };
export type SavedRoute = { id: string; updatedAt: string; snapshot: Snapshot };
export const DRAFT_KEY = 'openworld.draft.v1';
export const SAVED_KEY = 'openworld.saved.v1';

function validPoints(value: unknown): value is Point[] {
  return Array.isArray(value) && value.length <= 50 && value.every(p => p && typeof p.id === 'string' && p.id.length > 0 && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180) && new Set(value.map(p => p.id)).size === value.length;
}
export function isSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== 'object') return false;
  const s = value as Snapshot;
  if (s.version !== 1 || typeof s.name !== 'string' || s.name.length > 100 || !['road', 'gravel', 'mtb'].includes(s.activity) || !validPoints(s.points) || !Array.isArray(s.boundaries) || (s.savedId != null && typeof s.savedId !== 'string')) return false;
  let previous = 0;
  for (const boundary of s.boundaries) {
    const index = s.points.findIndex(p => p.id === boundary);
    if (index <= previous) return false;
    previous = index;
  }
  if (s.cached !== null) {
    const c = s.cached;
    if (!c || !validPoints(c.points) || !['road', 'gravel', 'mtb'].includes(c.activity) || c.key !== JSON.stringify([c.activity, c.points]) || !c.route || !Array.isArray(c.route.legs) || c.route.legs.length !== c.points.length - 1 || !Array.isArray(c.route.coordinates) || !Number.isFinite(c.route.distance) || c.route.distance < 0) return false;
    const validCoord = (p: unknown) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Math.abs(p[0]) <= 90 && Number.isFinite(p[1]) && Math.abs(p[1]) <= 180;
    if (c.route.coordinates.length < 2 || !c.route.coordinates.every(validCoord) || !c.route.legs.every(leg => Array.isArray(leg) && leg.length >= 2 && leg.every(validCoord))) return false;
    if (c.route.legDistances && (c.route.legDistances.length !== c.route.legs.length || !c.route.legDistances.every(n => Number.isFinite(n) && n >= 0))) return false;
    if (c.route.legAscents && (c.route.legAscents.length !== c.route.legs.length || !c.route.legAscents.every(n => n === null || (Number.isFinite(n) && n >= 0)))) return false;
    if (c.route.elevations && (c.route.elevations.length !== c.route.coordinates.length || !c.route.elevations.every(n => n === null || Number.isFinite(n)))) return false;
    if (c.route.legElevations && (c.route.legElevations.length !== c.route.legs.length || !c.route.legElevations.every((leg, i) => Array.isArray(leg) && leg.length === c.route.legs[i].length && leg.every(n => n === null || Number.isFinite(n))))) return false;
  }
  return true;
}
export function readDraft(storage: Storage): Snapshot | null {
  try { const raw = storage.getItem(DRAFT_KEY); if (!raw) return null; const value: unknown = JSON.parse(raw); return isSnapshot(value) ? value : null; } catch { return null; }
}
export function readSaved(storage: Storage): SavedRoute[] {
  try {
    const raw = storage.getItem(SAVED_KEY); if (!raw) return [];
    const values: unknown = JSON.parse(raw);
    return Array.isArray(values) ? values.filter((v): v is SavedRoute => v && typeof v.id === 'string' && typeof v.updatedAt === 'string' && isSnapshot(v.snapshot)) : [];
  } catch { return []; }
}
export function writeDraft(storage: Storage, snapshot: Snapshot): void {
  if (snapshot.points.length) storage.setItem(DRAFT_KEY, JSON.stringify(snapshot));
  else storage.removeItem(DRAFT_KEY);
}
export function writeSaved(storage: Storage, routes: SavedRoute[]): void { storage.setItem(SAVED_KEY, JSON.stringify(routes)); }
