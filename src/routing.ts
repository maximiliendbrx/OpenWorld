export type Point = { id: string; lat: number; lng: number; closesLoop?: boolean; startsNewStage?: boolean; stageSourceId?: string };
export type Activity = 'road' | 'gravel' | 'mtb';
export function routeKey(activity: Activity, points: Point[], avoidFastRoads = false): string {
  const ordered = points.map(point => Object.fromEntries(Object.entries(point).sort(([a], [b]) => a.localeCompare(b))));
  return JSON.stringify(avoidFastRoads ? [activity, ordered, true] : [activity, ordered]);
}
export function routeTimeoutMs(legCount: number): number { return Math.min(30 * 60_000, 10 * 60_000 + Math.max(0, legCount - 1) * 30_000); }
export type Route = { coordinates: [number, number][]; legs: [number, number][][]; distance: number; legDistances?: number[]; legAscents?: (number | null)[]; legMajorRoadMetres?: (number | null)[]; elevations?: (number | null)[]; legElevations?: (number | null)[][] };
export function continuousSegments(route: Route): [number, number][][] {
  if (!route.legs.some(leg => leg.length === 0)) return [route.coordinates];
  const groups: [number, number][][] = [[]];
  route.legs.forEach(leg => {
    const current = groups[groups.length - 1];
    if (!leg.length) { if (current.length) groups.push([]); return; }
    for (const coordinate of current.length ? leg.slice(1) : leg) current.push(coordinate);
  });
  return groups.filter(group => group.length >= 2);
}
const endpoint = import.meta.env.VITE_ROUTING_URL || 'https://brouter.de/brouter';
const profiles: Record<Activity, string> = { road: 'fastbike', gravel: 'gravel', mtb: 'mtb' };
/** Adapt this function for another provider; coordinates returned are [latitude, longitude]. */
export async function calculateRoute(points: Point[], activity: Activity, signal: AbortSignal, previous?: { points: Point[]; route: Route }, avoidFastRoads = false): Promise<Route> {
  const results: Route[] = new Array(points.length - 1);
  let next = 0;
  const worker = async () => {
    while (next < results.length) {
      const index = next++;
      const [a, b] = points.slice(index, index + 2);
      if (b.startsNewStage) { results[index] = { coordinates: [], legs: [[]], distance: 0, legAscents: [0], legElevations: [[]], legMajorRoadMetres: [0] }; continue; }
      const oldIndex = previous?.points.findIndex((point, i) => i < previous.points.length - 1 && (point.id === a.id || (a.startsNewStage && a.stageSourceId === point.id)) && point.lat === a.lat && point.lng === a.lng && previous.points[i + 1].id === b.id && previous.points[i + 1].lat === b.lat && previous.points[i + 1].lng === b.lng) ?? -1;
      const leg = oldIndex >= 0 ? previous?.route.legs[oldIndex] : undefined;
      const length = oldIndex >= 0 ? previous?.route.legDistances?.[oldIndex] : undefined;
      const majorRoadMetres = previous?.route.legMajorRoadMetres?.[oldIndex];
      results[index] = leg && length !== undefined && (!avoidFastRoads || majorRoadMetres != null) ? { coordinates: leg, legs: [leg], distance: length, legAscents: [previous?.route.legAscents?.[oldIndex] ?? null], legElevations: previous?.route.legElevations ? [previous.route.legElevations[oldIndex]] : undefined, legMajorRoadMetres: [majorRoadMetres ?? null] } : avoidFastRoads || b.closesLoop ? await calculatePreferredLeg([a, b], activity, signal, avoidFastRoads) : await calculateLeg([a, b], activity, signal);
    }
  };
  await Promise.all(Array.from({ length: Math.min(avoidFastRoads ? 2 : 4, results.length) }, worker));
  return {
    coordinates: results.flatMap((route, index) => index && results[index - 1].coordinates.length ? route.coordinates.slice(1) : route.coordinates),
    legs: results.flatMap(route => route.legs),
    distance: results.reduce((sum, route) => sum + route.distance, 0),
    legDistances: results.map(route => route.distance),
    legAscents: results.map(route => route.legAscents?.[0] ?? null),
    ...(avoidFastRoads ? { legMajorRoadMetres: results.map(route => route.legMajorRoadMetres?.[0] ?? null) } : {}),
    legElevations: results.map(route => route.legElevations?.[0] ?? route.coordinates.map(() => null)),
    elevations: results.flatMap((route, index) => (route.legElevations?.[0] ?? route.coordinates.map(() => null)).slice(index && results[index - 1].coordinates.length ? 1 : 0)),
  };
}

type ScoredRoute = Route & { duration?: number; majorRoadMetres?: number };
export function majorRoadDistance(messages: unknown): number | undefined {
  if (!Array.isArray(messages) || messages.length < 2 || !Array.isArray(messages[0])) return undefined;
  const tagsIndex = messages[0].indexOf('WayTags'), distanceIndex = messages[0].indexOf('Distance');
  if (tagsIndex < 0 || distanceIndex < 0) return undefined;
  let total = 0, classified = false;
  for (const row of messages.slice(1)) {
    if (!Array.isArray(row) || typeof row[tagsIndex] !== 'string' || row[distanceIndex] === '' || row[distanceIndex] == null) return undefined;
    const distance = Number(row[distanceIndex]);
    if (!Number.isFinite(distance) || distance < 0) return undefined;
    const tags: string = row[tagsIndex];
    if (distance > 0 && !/(?:^|\s)(?:highway=|route=ferry(?:\s|$))/.test(tags)) return undefined;
    if (/(?:^|\s)highway=/.test(tags)) classified = true;
    const speedMatch = tags.match(/(?:^|\s)maxspeed=(\d+(?:\.\d+)?)(?:_?(mph|kmh|km\/h))?(?=\s|$)/i);
    const speedKmh = speedMatch ? Number(speedMatch[1]) * (speedMatch[2]?.toLowerCase() === 'mph' ? 1.609344 : 1) : 0;
    if (/(?:^|\s)highway=(?:motorway|trunk|primary|secondary)(?:_link)?(?:\s|$)/.test(tags) || speedKmh >= 80) total += distance;
  }
  return classified ? total : undefined;
}
class RoutingLimitError extends Error {}
async function calculatePreferredLeg(points: Point[], activity: Activity, signal: AbortSignal, avoidFastRoads: boolean, splitDepth = 0): Promise<Route> {
  let base: ScoredRoute;
  try { base = await calculateLeg(points, activity, signal, 0, avoidFastRoads); }
  catch (error) {
    if (!(error instanceof RoutingLimitError) || !avoidFastRoads || splitDepth >= 4) throw error;
    // Use an ordinary route only as a corridor; every returned segment is calculated with the filter.
    const reference = await calculateLeg(points, activity, signal);
    const anchors: Point[] = [points[0]];
    let distance = 0;
    for (let i = 1; i < reference.coordinates.length - 1; i++) {
      const [lat1, lon1] = reference.coordinates[i - 1], [lat2, lon2] = reference.coordinates[i];
      const rad = Math.PI / 180, dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
      distance += 12_742_000 * Math.asin(Math.min(1, Math.sqrt(h)));
      if (distance >= 12_000 / (2 ** splitDepth)) { anchors.push({ id: `auto-${i}`, lat: lat2, lng: lon2 }); distance = 0; }
    }
    anchors.push(points[1]);
    if (anchors.length <= 2) throw error;
    const segments: Route[] = [];
    for (let i = 1; i < anchors.length; i++) segments.push(await calculatePreferredLeg([anchors[i - 1], anchors[i]], activity, signal, true, splitDepth + 1));
    const coordinates = segments.flatMap((segment, i) => i ? segment.coordinates.slice(1) : segment.coordinates);
    const ascents = segments.map(segment => segment.legAscents?.[0]);
    return { coordinates, legs: [coordinates], distance: segments.reduce((sum, segment) => sum + segment.distance, 0), legAscents: [ascents.every((n): n is number => n != null) ? ascents.reduce((sum, n) => sum + n, 0) : null], legMajorRoadMetres: [segments.reduce((sum, segment) => sum + segment.legMajorRoadMetres![0]!, 0)] };
  }
  if (avoidFastRoads && base.majorRoadMetres === 0 && !points[1].closesLoop) return base;
  const alternativesController = new AbortController();
  const abortAlternatives = () => alternativesController.abort();
  if (signal.aborted) throw new DOMException('Annulé', 'AbortError');
  signal.addEventListener('abort', abortAlternatives, { once: true });
  // Alternatives on long legs need time to finish; keep the main route as a fallback.
  const timeout = setTimeout(abortAlternatives, 60000);
  let alternatives: PromiseSettledResult<ScoredRoute>[];
  try { alternatives = await Promise.allSettled([calculateLeg(points, activity, alternativesController.signal, 1, avoidFastRoads), calculateLeg(points, activity, alternativesController.signal, 2, avoidFastRoads)]); }
  finally { clearTimeout(timeout); signal.removeEventListener('abort', abortAlternatives); }
  if (signal.aborted) throw new DOMException('Annulé', 'AbortError');
  const all = [base, ...alternatives.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])];
  const candidates = avoidFastRoads ? all.filter(candidate => candidate.majorRoadMetres !== undefined) : all;
  if (!candidates.length) throw new Error('Le service ne fournit pas les catégories de routes nécessaires au filtre.');
  return candidates.reduce((best, candidate) => {
    if (avoidFastRoads && candidate.majorRoadMetres !== best.majorRoadMetres) return candidate.majorRoadMetres! < best.majorRoadMetres! ? candidate : best;
    return candidate.duration !== undefined && (best.duration === undefined || candidate.duration < best.duration) ? candidate : best;
  });
}

async function calculateLeg(points: Point[], activity: Activity, signal: AbortSignal, alternative = 0, avoidFastRoads = false): Promise<ScoredRoute> {
  const profile = avoidFastRoads && activity === 'road' ? 'fastbike-verylowtraffic' : profiles[activity];
  const params = new URLSearchParams({ lonlats: points.map(p => `${p.lng},${p.lat}`).join('|'), profile, alternativeidx: String(alternative), format: 'geojson' });
  const response = await fetch(`${endpoint}?${params}`, { signal });
  if (!response.ok) {
    const message = `Le service de calcul n’a pas pu traiter cette portion (${response.status}). Réessayez ou ajoutez un point intermédiaire pour la raccourcir.`;
    const body = response.status === 400 ? await response.text() : '';
    if (/watchdog|timeout|timed out|time limit/i.test(body)) throw new RoutingLimitError(message);
    throw new Error(message);
  }
  const data = await response.json();
  const route = data.features?.[0];
  if (data.type !== 'FeatureCollection' || !route || route.geometry?.type !== 'LineString') throw new Error('Aucun chemin trouvé entre ces points. Rapprochez-les d’une route ou d’un sentier.');
  const coordinates: unknown = route.geometry?.coordinates;
  const distance = Number(route.properties?.['track-length']);
  const rawAscent = route.properties?.['filtered ascend'];
  const rawDuration = route.properties?.['total-time'];
  const duration = rawDuration !== null && rawDuration !== undefined && rawDuration !== '' ? Number(rawDuration) : NaN;
  const ascent = rawAscent !== null && rawAscent !== undefined && rawAscent !== '' ? Number(rawAscent) : NaN;
  const majorRoadMetres = avoidFastRoads ? majorRoadDistance(route.properties?.messages) : undefined;
  if (!Array.isArray(coordinates) || coordinates.length < 2 || !coordinates.every(c => Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90) || !Number.isFinite(distance) || distance < 0) throw new Error('Le service a renvoyé un itinéraire invalide.');
  const path: [number, number][] = coordinates.map(c => [c[1], c[0]]);
  return {
    coordinates: path,
    legs: [path],
    distance,
    duration: Number.isFinite(duration) && duration >= 0 ? duration : undefined,
    majorRoadMetres,
    ...(avoidFastRoads ? { legMajorRoadMetres: [majorRoadMetres ?? null] } : {}),
    legAscents: [Number.isFinite(ascent) && ascent >= 0 ? ascent : null],
  };
}
const escapeXml = (value: string) => value.replace(/[<>&"']/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' }[c]!));
export function createGpx(route: Route, name: string): string {
  if (!route.legs.some(leg => leg.length === 0)) return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="OpenWorld" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${escapeXml(name)}</name></metadata><trk><name>${escapeXml(name)}</name><trkseg>${route.coordinates.map(([lat, lon], i) => `<trkpt lat="${lat}" lon="${lon}">${Number.isFinite(route.elevations?.[i]) ? `<ele>${route.elevations![i]}</ele>` : ''}</trkpt>`).join('')}</trkseg></trk></gpx>`;
  const segments: string[][] = [[]];
  route.legs.forEach((leg, index) => {
    if (!leg.length) { if (segments[segments.length - 1].length) segments.push([]); return; }
    const current = segments[segments.length - 1];
    leg.forEach(([lat, lon], i) => { if (i === 0 && current.length) return; const ele = route.legElevations?.[index]?.[i]; current.push(`<trkpt lat="${lat}" lon="${lon}">${Number.isFinite(ele) ? `<ele>${ele}</ele>` : ''}</trkpt>`); });
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="OpenWorld" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${escapeXml(name)}</name></metadata><trk><name>${escapeXml(name)}</name>${segments.filter(s => s.length).map(s => `<trkseg>${s.join('')}</trkseg>`).join('')}</trk></gpx>`;
}
