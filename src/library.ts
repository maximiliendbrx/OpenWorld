import { unzipSync, zipSync, strToU8 } from 'fflate';
import { parseKmz, type MandatoryPoint } from './kmz';

/** Point d'intérêt enregistré dans la bibliothèque du compte (col, point de vue, ravitaillement, checkpoint…). */
export type LibraryPoint = { id: string; name: string; description?: string; lat: number; lng: number; icon: string };
export type Collection = { id: string; name: string; updatedAt: string; points: LibraryPoint[] };
export const LIBRARY_KEY = 'openworld.library.v1';
export const MAX_COLLECTIONS = 50;
export const MAX_COLLECTION_POINTS = 2000;
export const MAX_LIBRARY_POINTS = 10_000;
export const DEFAULT_ICON = '📍';

export const ICON_GROUPS: { label: string; icons: string[] }[] = [
  { label: 'Cols et côtes', icons: ['🏔️', '⛰️', '🗻', '⛷️', '📈', '⬆️', '🚵', '🪨'] },
  { label: 'Points de vue', icons: ['👀', '🌄', '🌅', '📸', '🔭', '🏞️', '🌊', '🌲'] },
  { label: 'Eau', icons: ['💧', '🚰', '⛲', '🏊', '🛁'] },
  { label: 'Manger et boire', icons: ['🍽️', '🥖', '☕', '🍺', '🛒', '🍕', '🥪', '🍦'] },
  { label: 'Dormir', icons: ['🏨', '⛺', '🛏️', '🏠', '🏕️'] },
  { label: 'Services', icons: ['🚲', '🔧', '🏥', '🚉', '⛽', '🚻', '🅿️', '🔋', '📶'] },
  { label: 'Attention', icons: ['⚠️', '🚧', '🚫', '🐕', '⛈️', '❄️'] },
  { label: 'Repères', icons: ['🚩', '🏁', '⭐', '❤️', '📍', '🎯', '🏰', '⛪', '🌉'] },
];

const validIcon = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 16 && !/[\u0000-\u001f<>]/.test(value);
export function isLibraryPoint(value: unknown): value is LibraryPoint {
  const p = value as LibraryPoint;
  return !!p && typeof p.id === 'string' && p.id.length > 0 && p.id.length <= 64 && typeof p.name === 'string' && p.name.length <= 120 && (p.description === undefined || (typeof p.description === 'string' && p.description.length <= 500)) && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180 && validIcon(p.icon);
}
export function isCollection(value: unknown): value is Collection {
  const c = value as Collection;
  return !!c && typeof c.id === 'string' && c.id.length > 0 && c.id.length <= 64 && typeof c.name === 'string' && c.name.length <= 100 && typeof c.updatedAt === 'string' && Array.isArray(c.points) && c.points.length <= MAX_COLLECTION_POINTS && c.points.every(isLibraryPoint) && new Set(c.points.map(p => p.id)).size === c.points.length;
}
export function isLibrary(value: unknown): value is Collection[] {
  return Array.isArray(value) && value.length <= MAX_COLLECTIONS && value.every(isCollection) && new Set(value.map(c => c.id)).size === value.length && value.reduce((sum, c) => sum + c.points.length, 0) <= MAX_LIBRARY_POINTS;
}
export function readLibrary(storage: Storage): Collection[] {
  try { const raw = storage.getItem(LIBRARY_KEY); if (!raw) return []; const value: unknown = JSON.parse(raw); return isLibrary(value) ? value : []; } catch { return []; }
}
export function writeLibrary(storage: Storage, library: Collection[]): void {
  if (library.length) storage.setItem(LIBRARY_KEY, JSON.stringify(library)); else storage.removeItem(LIBRARY_KEY);
}

const RULES: [RegExp, string][] = [
  [/\b(col|cols|port|passo|pass|puerto|pass)\b/i, '🏔️'],
  [/(côte|cote|montée|montee|climb|rampe|mur\b)/i, '⛰️'],
  [/(vue|view|panorama|belvédère|belvedere|point de vue|viewpoint|sommet|summit|cime)/i, '👀'],
  [/(eau|fontaine|water|fountain|source|robinet)/i, '💧'],
  [/(boulanger|bakery|restaurant|resto|café|cafe|bar\b|food|épicerie|epicerie|supermarch|magasin|shop)/i, '🍽️'],
  [/(hôtel|hotel|gîte|gite|camping|bivouac|refuge|auberge|hébergement|hostel)/i, '🏨'],
  [/(gare|station|train|vélo|velo|bike|réparation|repair)/i, '🚲'],
  [/(danger|attention|warning|éboul|eboul|fermé|ferme\b|closed)/i, '⚠️'],
  [/(checkpoint|cp\s?\d|contrôle|controle|départ|depart|arrivée|arrivee|start|finish)/i, '🚩'],
];
/** Devine une icône d'après le nom d'un point (utile à l'import d'un KMZ venant d'ailleurs). */
export function guessIcon(name: string, description = ''): string {
  const text = `${name} ${description}`;
  for (const [rule, icon] of RULES) if (rule.test(text)) return icon;
  return DEFAULT_ICON;
}
const LEADING_EMOJI = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator}){1,2}(?:️|‍(?:\p{Extended_Pictographic}️?)*)*)\s+(.+)$/u;
/** Sépare une éventuelle émoticône placée au début du nom (« ⛰️ Col du Galibier »). */
export function splitLeadingEmoji(name: string): { icon?: string; name: string } {
  const match = LEADING_EMOJI.exec(name.trim());
  return match && validIcon(match[1]) ? { icon: match[1], name: match[2] } : { name: name.trim() };
}

export function pointsFromImport(points: MandatoryPoint[], makeId: () => string = () => crypto.randomUUID()): LibraryPoint[] {
  return points.map(p => {
    const split = splitLeadingEmoji(p.name);
    const name = (split.name || p.name).slice(0, 120);
    const icon = p.icon && validIcon(p.icon) ? p.icon : split.icon ?? guessIcon(name, p.description);
    const point: LibraryPoint = { id: makeId(), name, lat: p.lat, lng: p.lng, icon };
    if (p.description) point.description = p.description.slice(0, 500);
    return point;
  });
}
export function collectionFromFile(bytes: Uint8Array, fileName: string, makeId: () => string = () => crypto.randomUUID()): Collection {
  const found = parseKmz(bytes, makeId);
  const base = fileName.replace(/\.(kmz|kml)$/i, '').replace(/[_]+/g, ' ').trim().slice(0, 100) || 'Points importés';
  return { id: makeId(), name: base, updatedAt: new Date().toISOString(), points: pointsFromImport(found, makeId) };
}

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** KML d'une collection : l'icône est dans le nom (visible partout) et dans un champ dédié pour la relecture. */
export function collectionToKml(collection: Collection): string {
  const marks = collection.points.map(p => `<Placemark><name>${esc(`${p.icon} ${p.name}`)}</name>${p.description ? `<description>${esc(p.description)}</description>` : ''}<ExtendedData><Data name="horizonsgpx_icon"><value>${esc(p.icon)}</value></Data></ExtendedData><Point><coordinates>${p.lng},${p.lat},0</coordinates></Point></Placemark>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(collection.name)}</name>${marks}</Document></kml>`;
}
export function collectionToKmz(collection: Collection): Uint8Array {
  return zipSync({ 'doc.kml': strToU8(collectionToKml(collection)) });
}
