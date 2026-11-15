import type { Point, Route } from './routing';

type TrackPoint = { lat: number; lng: number; elevation: number | null };
const distance = (a: TrackPoint, b: TrackPoint) => {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad, y = (b.lat - a.lat) * rad;
  const h = Math.sin(y / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(x / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** Keep endpoints and the bends furthest from their surrounding segment. */
export function controlPointIndices(points: TrackPoint[], limit = 25): number[] {
  const indices = [0, points.length - 1];
  while (indices.length < Math.min(limit, points.length)) {
    let best = -1, error = 0;
    for (let k = 1; k < indices.length; k++) {
      const first = indices[k - 1], last = indices[k];
      const a = points[first], b = points[last];
      const scale = Math.cos((a.lat + b.lat) * Math.PI / 360);
      const dx = (b.lng - a.lng) * scale, dy = b.lat - a.lat;
      const denominator = dx * dx + dy * dy;
      for (let i = first + 1; i < last; i++) {
        const px = (points[i].lng - a.lng) * scale, py = points[i].lat - a.lat;
        const t = denominator ? Math.max(0, Math.min(1, (px * dx + py * dy) / denominator)) : 0;
        const deviation = (px - t * dx) ** 2 + (py - t * dy) ** 2;
        if (deviation > error) { error = deviation; best = i; }
      }
    }
    if (best < 0) break;
    indices.push(best);
    indices.sort((a, b) => a - b);
  }
  return indices;
}

export function importGpx(xml: string, fallbackName: string): { name: string; points: Point[]; boundaries: string[]; route: Route } {
  if (/<!DOCTYPE/i.test(xml)) throw new Error('Le fichier contient un format XML non pris en charge.');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.getElementsByTagName('parsererror').length || document.documentElement.localName !== 'gpx') throw new Error('Le fichier GPX est invalide ou illisible.');
  const elements = (parent: Element | Document, name: string) => Array.from(parent.getElementsByTagNameNS('*', name));
  const segments = elements(document, 'trkseg').map(segment => elements(segment, 'trkpt')).filter(segment => segment.length);
  const routes = elements(document, 'rte').map(route => elements(route, 'rtept')).filter(route => route.length);
  const groups = [...segments, ...routes];
  if (!groups.length || groups.some(group => group.length < 2)) throw new Error('Chaque trace ou étape du GPX doit contenir au moins deux points.');
  if (groups.length > 25) throw new Error('Ce GPX contient plus de 25 étapes.');
  if (groups.reduce((sum, group) => sum + group.length, 0) > 100000) throw new Error('Ce GPX contient plus de 100 000 points.');
  const readPoint = (node: Element): TrackPoint => {
    const latAttr = node.getAttribute('lat'), lonAttr = node.getAttribute('lon');
    const lat = latAttr === null || !latAttr.trim() ? NaN : Number(latAttr);
    const lng = lonAttr === null || !lonAttr.trim() ? NaN : Number(lonAttr);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Le GPX contient des coordonnées invalides.');
    const eleText = elements(node, 'ele')[0]?.textContent?.trim();
    const ele = eleText ? Number(eleText) : NaN;
    return { lat, lng, elevation: Number.isFinite(ele) ? ele : null };
  };
  const tracks = groups.map(group => group.map(readPoint));
  const points: Point[] = [], boundaries: string[] = [];
  const legs: [number, number][][] = [], legElevations: (number | null)[][] = [], legDistances: number[] = [];
  tracks.forEach((track, groupIndex) => {
    if (groupIndex) { boundaries.push(points[points.length - 1].id); legs.push([]); legElevations.push([]); legDistances.push(0); }
    const indices = controlPointIndices(track, Math.max(2, Math.floor(25 / tracks.length)));
    points.push(...indices.map((i, index) => ({ id: crypto.randomUUID(), lat: track[i].lat, lng: track[i].lng, ...(groupIndex && index === 0 ? { startsNewStage: true } : {}) })));
    indices.slice(1).forEach((end, i) => {
      legs.push(track.slice(indices[i], end + 1).map(p => [p.lat, p.lng]));
      legElevations.push(track.slice(indices[i], end + 1).map(p => p.elevation));
      let total = 0;
      for (let j = indices[i] + 1; j <= end; j++) total += distance(track[j - 1], track[j]);
      legDistances.push(total);
    });
  });
  const legAscents = legElevations.map(values => values.every(value => value !== null) ? values.slice(1).reduce<number>((sum, value, i) => sum + Math.max(0, value! - values[i]!), 0) : null);
  const route: Route = { coordinates: tracks.flatMap(track => track.map(p => [p.lat, p.lng] as [number, number])), legs, legDistances, legAscents, distance: legDistances.reduce((a, b) => a + b, 0), elevations: tracks.flatMap(track => track.map(p => p.elevation)), legElevations };
  const name = elements(document, 'trk')[0]?.getElementsByTagNameNS('*', 'name')[0]?.textContent?.trim() || elements(document, 'rte')[0]?.getElementsByTagNameNS('*', 'name')[0]?.textContent?.trim() || elements(document, 'metadata')[0]?.getElementsByTagNameNS('*', 'name')[0]?.textContent?.trim() || fallbackName;
  return { name: name.slice(0, 100), points, boundaries, route };
}
