import { unzipSync, strFromU8 } from 'fflate';

/** Point obligatoire (ex. checkpoint d'une course ultra-distance) : affiché sur la carte, sans faire partie du tracé tant qu'il n'est pas ajouté. */
export type MandatoryPoint = { id: string; name: string; description?: string; lat: number; lng: number };
export const MAX_MANDATORY = 1000;
const MAX_UNZIPPED_BYTES = 60 * 1024 * 1024;

function kmlFromBytes(bytes: Uint8Array): string {
  // Un KMZ est une archive ZIP (signature « PK ») contenant un fichier .kml ; un KML brut est du texte XML.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    let files: Record<string, Uint8Array>;
    try { files = unzipSync(bytes, { filter: file => /\.kml$/i.test(file.name) && file.originalSize <= MAX_UNZIPPED_BYTES }); }
    catch { throw new Error('Impossible d’ouvrir cette archive KMZ : le fichier est endommagé.'); }
    const names = Object.keys(files);
    const chosen = names.find(name => /(^|\/)doc\.kml$/i.test(name)) ?? names[0];
    if (!chosen) throw new Error('Ce KMZ ne contient aucun fichier KML.');
    return strFromU8(files[chosen]);
  }
  return strFromU8(bytes);
}
const clean = (text: string | null | undefined, max: number) => (text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Lit les repères (Placemark de type Point) d'un fichier KMZ ou KML. Les lignes et polygones sont ignorés. */
export function parseKmz(bytes: Uint8Array, makeId: () => string = () => crypto.randomUUID()): MandatoryPoint[] {
  const xml = kmlFromBytes(bytes);
  if (/<!DOCTYPE/i.test(xml)) throw new Error('Le fichier contient un format XML non pris en charge.');
  let document: Document;
  try { document = new DOMParser().parseFromString(xml, 'application/xml'); } catch { throw new Error('Le fichier KMZ/KML est invalide ou illisible.'); }
  if (document.getElementsByTagName('parsererror').length || document.documentElement?.localName !== 'kml') throw new Error('Le fichier KMZ/KML est invalide ou illisible.');
  const result: MandatoryPoint[] = [];
  for (const placemark of Array.from(document.getElementsByTagNameNS('*', 'Placemark'))) {
    const coordinates = Array.from(placemark.getElementsByTagNameNS('*', 'Point'))[0]?.getElementsByTagNameNS('*', 'coordinates')[0]?.textContent;
    if (!coordinates) continue;
    const [lng, lat] = coordinates.trim().split(/[\s,]+/).map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const child = (name: string) => Array.from(placemark.childNodes).find(node => node.nodeType === 1 && (node as Element).localName === name)?.textContent;
    let description = child('description') ?? '';
    description = description.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
    const point: MandatoryPoint = { id: makeId(), name: clean(child('name'), 80) || `Point ${result.length + 1}`, lat, lng };
    const text = clean(description, 300);
    if (text) point.description = text;
    result.push(point);
    if (result.length > MAX_MANDATORY) throw new Error(`Ce fichier contient plus de ${MAX_MANDATORY} points.`);
  }
  if (!result.length) throw new Error('Aucun point trouvé dans ce fichier. Seuls les repères (points) sont importés, pas les lignes ni les zones.');
  return result;
}

/** Pour chaque point obligatoire : le tracé passe-t-il à moins de `tolerance` mètres ? */
export function visitedPoints(coordinates: [number, number][], points: MandatoryPoint[], tolerance = 150): boolean[] {
  return points.map(point => {
    const scale = Math.cos(point.lat * Math.PI / 180);
    const limit = (tolerance / 111_320) ** 2;
    for (const [lat, lng] of coordinates) {
      const dy = lat - point.lat;
      if (dy * dy > limit) continue;
      const dx = (lng - point.lng) * scale;
      if (dx * dx + dy * dy <= limit) return true;
    }
    return false;
  });
}
