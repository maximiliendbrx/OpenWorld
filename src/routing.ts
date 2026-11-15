export type Point = { id: string; lat: number; lng: number };
export type Activity = 'road' | 'gravel' | 'mtb';
export type Route = { coordinates: [number, number][]; legs: [number, number][][]; distance: number; legDistances?: number[] };
const endpoint = import.meta.env.VITE_ROUTING_URL || 'https://brouter.de/brouter';
const profiles: Record<Activity, string> = { road: 'fastbike', gravel: 'gravel', mtb: 'mtb' };
/** Adapt this function for another provider; coordinates returned are [latitude, longitude]. */
export async function calculateRoute(points: Point[], activity: Activity, signal: AbortSignal): Promise<Route> {
  const results: Route[] = new Array(points.length - 1);
  let next = 0;
  const worker = async () => {
    while (next < results.length) {
      const index = next++;
      results[index] = await calculateLeg(points.slice(index, index + 2), activity, signal);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, results.length) }, worker));
  return {
    coordinates: results.flatMap((route, index) => index ? route.coordinates.slice(1) : route.coordinates),
    legs: results.flatMap(route => route.legs),
    distance: results.reduce((sum, route) => sum + route.distance, 0),
    legDistances: results.map(route => route.distance),
  };
}

async function calculateLeg(points: Point[], activity: Activity, signal: AbortSignal): Promise<Route> {
  const params = new URLSearchParams({ lonlats: points.map(p => `${p.lng},${p.lat}`).join('|'), profile: profiles[activity], alternativeidx: '0', format: 'geojson' });
  const response = await fetch(`${endpoint}?${params}`, { signal });
  if (!response.ok) throw new Error(`Le service de calcul est indisponible (${response.status}). Réessayez dans un instant.`);
  const data = await response.json();
  const route = data.features?.[0];
  if (data.type !== 'FeatureCollection' || !route || route.geometry?.type !== 'LineString') throw new Error('Aucun chemin trouvé entre ces points. Rapprochez-les d’une route ou d’un sentier.');
  const coordinates: unknown = route.geometry?.coordinates;
  const distance = Number(route.properties?.['track-length']);
  if (!Array.isArray(coordinates) || coordinates.length < 2 || !coordinates.every(c => Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90) || !Number.isFinite(distance) || distance < 0) throw new Error('Le service a renvoyé un itinéraire invalide.');
  const path: [number, number][] = coordinates.map(c => [c[1], c[0]]);
  return {
    coordinates: path,
    legs: [path],
    distance,
  };
}
const escapeXml = (value: string) => value.replace(/[<>&"']/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' }[c]!));
export function createGpx(route: Route, name: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="OpenWorld" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${escapeXml(name)}</name></metadata><trk><name>${escapeXml(name)}</name><trkseg>${route.coordinates.map(([lat, lon]) => `<trkpt lat="${lat}" lon="${lon}"></trkpt>`).join('')}</trkseg></trk></gpx>`;
}
