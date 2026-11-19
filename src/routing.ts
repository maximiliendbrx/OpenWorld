export type Point = { id: string; lat: number; lng: number; closesLoop?: boolean; startsNewStage?: boolean; stageSourceId?: string };
export type Activity = 'road' | 'gravel' | 'mtb';
/** Nombre maximal de points de passage (départ et arrivée compris) pour un parcours. */
export const MAX_POINTS = 1000;
export function routeKey(activity: Activity, points: Point[], avoidFastRoads = false): string {
  const ordered = points.map(point => Object.fromEntries(Object.entries(point).sort(([a], [b]) => a.localeCompare(b))));
  return JSON.stringify(avoidFastRoads ? [activity, ordered, true] : [activity, ordered]);
}
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
/** Reconstruit les coordonnées et altitudes continues à partir des portions (le premier point d'une portion répète le dernier de la précédente). */
export function joinLegs(legs: [number, number][][], legElevations?: (number | null)[][]): { coordinates: [number, number][]; elevations: (number | null)[] } {
  const coordinates: [number, number][] = [], elevations: (number | null)[] = [];
  legs.forEach((leg, index) => {
    const skip = index > 0 && legs[index - 1].length > 0 ? 1 : 0;
    for (let i = skip; i < leg.length; i++) { coordinates.push(leg[i]); elevations.push(legElevations?.[index]?.[i] ?? null); }
  });
  return { coordinates, elevations };
}

const endpoint = import.meta.env.VITE_ROUTING_URL || 'https://brouter.de/brouter';
const profiles: Record<Activity, string> = { road: 'fastbike', gravel: 'gravel', mtb: 'mtb' };
/** Réglages du moteur (modifiables par les tests). */
export const routingTuning = {
  /** Distance à vol d'oiseau au-delà de laquelle une portion est découpée d'office : le service public interrompt les calculs d'environ 130 km. */
  directMaxMetres: 90_000,
  /** En dessous de cette distance, on ne découpe plus : on signale l'échec. */
  minSplitMetres: 3_000,
  /** Au-delà, on ne compare plus plusieurs variantes (trop coûteux). */
  alternativesMaxMetres: 40_000,
  parallel: 3,
  attempts: 6,
  /** Nombre de refus de surcharge (403/429/503) tolérés pour une même requête avant d'abandonner. */
  refusalAttempts: 25,
  rateLimitBaseMs: 2000,
  /** Intervalle minimal entre deux requêtes ; il augmente automatiquement quand le service refuse. */
  minGapMs: 120,
  retryBaseMs: 700,
  requestTimeoutMs: 90_000,
};
const memo = new Map<string, ScoredRoute>();
const MEMO_LIMIT = 6000;
/** Vide la mémoire des portions déjà calculées (utile aux tests). */
export function clearRouteCache() { memo.clear(); }
const remember = (key: string, route: ScoredRoute) => { if (memo.size >= MEMO_LIMIT) memo.delete(memo.keys().next().value as string); memo.set(key, route); };

type ScoredRoute = Route & { duration?: number; majorRoadMetres?: number };
type Context = { signal: AbortSignal; activity: Activity; avoidFastRoads: boolean; tick: () => void };

class RoutingLimitError extends Error {}
class PointError extends Error {}
const abortError = () => new DOMException('Annulé', 'AbortError');
const RAD = Math.PI / 180;
function haversine(a: [number, number], b: [number, number]): number {
  const dLat = (b[0] - a[0]) * RAD, dLon = (b[1] - a[1]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLon / 2) ** 2;
  return 12_742_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** Point situé à la fraction f du grand cercle entre a et b. */
function interpolate(a: [number, number], b: [number, number], f: number): [number, number] {
  const d = haversine(a, b) / 6_371_000;
  if (d < 1e-9) return a;
  const [lat1, lon1, lat2, lon2] = [a[0] * RAD, a[1] * RAD, b[0] * RAD, b[1] * RAD];
  const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
  const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
  const z = A * Math.sin(lat1) + B * Math.sin(lat2);
  return [Math.atan2(z, Math.hypot(x, y)) / RAD, Math.atan2(y, x) / RAD];
}
/** Milieu proposé pour découper une portion, puis variantes décalées perpendiculairement si le premier choix tombe hors de tout chemin. */
function splitCandidates(a: [number, number], b: [number, number]): [number, number][] {
  const mid = interpolate(a, b, 0.5), length = haversine(a, b);
  const scale = Math.cos(mid[0] * RAD) || 1e-6;
  const dx = (b[1] - a[1]) * scale, dy = b[0] - a[0], norm = Math.hypot(dx, dy) || 1;
  const px = -dy / norm, py = dx / norm;
  const result: [number, number][] = [mid];
  for (const offset of [2000, -2000, 6000, -6000, 15000, -15000]) {
    if (Math.abs(offset) > length * 0.25) continue;
    result.push([mid[0] + py * offset / 111_320, mid[1] + px * offset / (111_320 * scale)]);
  }
  return result;
}
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) { reject(abortError()); return; }
  const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
  const onAbort = () => { clearTimeout(timer); reject(abortError()); };
  signal.addEventListener('abort', onAbort, { once: true });
});

// Limiteur global : jamais plus de `parallel` requêtes simultanées vers le service, quel que soit le nombre de portions.
let running = 0;
const waiting: (() => void)[] = [];
async function withSlot<T>(signal: AbortSignal, task: () => Promise<T>): Promise<T> {
  if (running >= routingTuning.parallel) {
    await new Promise<void>((resolve, reject) => {
      const grant = () => { signal.removeEventListener('abort', onAbort); resolve(); };
      const onAbort = () => { const i = waiting.indexOf(grant); if (i >= 0) waiting.splice(i, 1); reject(abortError()); };
      waiting.push(grant);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  } else running++;
  try { return await task(); }
  finally { const next = waiting.shift(); if (next) next(); else running--; }
}

const RETRYABLE = new Set([408, 425, 500, 502, 503, 504, 520, 522, 524]);
const serviceMessage = (status: number | string) => `Le service de calcul n’a pas pu traiter cette portion (${status}). Réessayez ou ajoutez un point intermédiaire pour la raccourcir.`;
// Cadence adaptative : le service public refuse les rafales (403 « retry later » / 429). On ralentit à chaque refus, on réaccélère ensuite.
let gap = 0, nextStart = 0;
async function pace(signal: AbortSignal) {
  const now = Date.now(), at = Math.max(now, nextStart);
  nextStart = at + gap;
  if (at > now) await sleep(at - now, signal);
}
const slowDown = (pauseMs: number) => { gap = Math.min(4000, Math.max(routingTuning.minGapMs, gap * 2 || routingTuning.minGapMs * 2)); nextStart = Math.max(nextStart, Date.now() + pauseMs); };
const speedUp = () => { gap = gap * 0.92 < routingTuning.minGapMs ? routingTuning.minGapMs : gap * 0.92; };
/** Remet la cadence à zéro (utile aux tests). */
export function resetRoutingPace() { gap = routingTuning.minGapMs; nextStart = 0; }
/** Interroge le service avec nouvelles tentatives (réseau, surcharge, 429/403/5xx) et délai maximal par requête. */
async function requestLeg(url: string, ctx: Context): Promise<any> {
  let lastError: Error = new Error(serviceMessage('réseau'));
  let failures = 0, refusals = 0;
  for (;;) {
    if (ctx.signal.aborted) throw abortError();
    if (failures >= routingTuning.attempts) throw lastError;
    if (refusals > routingTuning.refusalAttempts) throw new Error('Le service de calcul est saturé. Patientez une minute puis cliquez sur « Réessayer » : les portions déjà calculées sont conservées.');
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    ctx.signal.addEventListener('abort', onAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, routingTuning.requestTimeoutMs);
    try {
      const aborted = new Promise<never>((_, reject) => { controller.signal.addEventListener('abort', () => reject(abortError()), { once: true }); });
      aborted.catch(() => undefined);
      const response = await withSlot(ctx.signal, async () => { await pace(ctx.signal); return Promise.race([fetch(url, { signal: controller.signal }), aborted]); });
      if (response.ok) { const data = await response.json(); speedUp(); ctx.tick(); return data; }
      const body = (response.status === 400 || response.status === 403 || response.status >= 500 ? (await Promise.resolve(response.text?.()).catch(() => '')) ?? '' : '') as string;
      ctx.tick();
      if (response.status === 429 || (response.status === 403 && /retry|later|too many|rate/i.test(body)) || response.status === 503) {
        refusals++; lastError = new Error(serviceMessage(response.status));
        const pause = Math.min(30_000, routingTuning.rateLimitBaseMs * 2 ** Math.min(refusals - 1, 4)) * (0.8 + Math.random() * 0.4);
        slowDown(pause);
        continue;
      }
      if (/watchdog|timeout|timed out|time limit|too long|maxdistance/i.test(body)) throw new RoutingLimitError(serviceMessage(response.status));
      if (response.status === 400 && /not mapped|position|no track|datafile/i.test(body)) throw new PointError(/not mapped|datafile/i.test(body) ? 'Un point est trop éloigné de toute route ou sentier praticable pour ce type de vélo. Rapprochez-le d’un chemin.' : 'Aucun chemin trouvé entre ces points. Rapprochez-les d’une route ou d’un sentier.');
      if (RETRYABLE.has(response.status)) { failures++; lastError = new Error(serviceMessage(response.status)); }
      else throw new Error(serviceMessage(response.status));
    } catch (error) {
      if (ctx.signal.aborted) throw abortError();
      if (error instanceof RoutingLimitError || error instanceof PointError) throw error;
      if (timedOut) throw new RoutingLimitError(serviceMessage('délai dépassé'));
      if (error instanceof Error && error.message.startsWith('Le service')) throw error;
      failures++;
      lastError = error instanceof SyntaxError ? new Error(serviceMessage('réponse illisible')) : new Error('Connexion au service de calcul impossible. Vérifiez votre connexion Internet puis réessayez.');
    } finally { clearTimeout(timer); ctx.signal.removeEventListener('abort', onAbort); }
    if (failures) await sleep(Math.min(20_000, routingTuning.retryBaseMs * 2 ** (failures - 1)) * (0.7 + Math.random() * 0.6), ctx.signal);
  }
}

async function fetchLeaf(a: Point, b: Point, ctx: Context, alternative: number): Promise<ScoredRoute> {
  const profile = ctx.avoidFastRoads && ctx.activity === 'road' ? 'fastbike-verylowtraffic' : profiles[ctx.activity];
  const params = new URLSearchParams({ lonlats: `${a.lng},${a.lat}|${b.lng},${b.lat}`, profile, alternativeidx: String(alternative), format: 'geojson' });
  const data = await requestLeg(`${endpoint}?${params}`, ctx);
  const route = data.features?.[0];
  if (data.type !== 'FeatureCollection' || !route || route.geometry?.type !== 'LineString') throw new PointError('Aucun chemin trouvé entre ces points. Rapprochez-les d’une route ou d’un sentier.');
  let coordinates: unknown = route.geometry?.coordinates;
  // Deux points voisins qui se calent sur le même nœud routier donnent une ligne d'un seul point (longueur 0) : portion nulle valide.
  if (Array.isArray(coordinates) && coordinates.length === 1) coordinates = [coordinates[0], coordinates[0]];
  const distance = Number(route.properties?.['track-length']);
  const rawAscent = route.properties?.['filtered ascend'];
  const rawDuration = route.properties?.['total-time'];
  const duration = rawDuration !== null && rawDuration !== undefined && rawDuration !== '' ? Number(rawDuration) : NaN;
  const ascent = rawAscent !== null && rawAscent !== undefined && rawAscent !== '' ? Number(rawAscent) : NaN;
  const majorRoadMetres = ctx.avoidFastRoads ? majorRoadDistance(route.properties?.messages) : undefined;
  if (!Array.isArray(coordinates) || coordinates.length < 2 || !coordinates.every(c => Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90) || !Number.isFinite(distance) || distance < 0) throw new Error('Le service a renvoyé un itinéraire invalide.');
  const path: [number, number][] = coordinates.map(c => [c[1], c[0]]);
  const altitudes = coordinates.map(c => Number.isFinite(c[2]) ? Math.round(c[2] * 10) / 10 : null) as (number | null)[];
  return {
    coordinates: path, legs: [path], legElevations: [altitudes], distance,
    duration: Number.isFinite(duration) && duration >= 0 ? duration : undefined,
    majorRoadMetres,
    ...(ctx.avoidFastRoads ? { legMajorRoadMetres: [majorRoadMetres ?? null] } : {}),
    legAscents: [Number.isFinite(ascent) && ascent >= 0 ? ascent : null],
  };
}

/** Assemble deux moitiés en supprimant l'aller-retour éventuel autour du point de découpe (le point peut tomber sur une impasse). */
function joinHalves(left: ScoredRoute, right: ScoredRoute): ScoredRoute {
  const a = left.coordinates.slice(), b = right.coordinates.slice();
  const ea = (left.legElevations?.[0] ?? a.map(() => null)).slice(), eb = (right.legElevations?.[0] ?? b.map(() => null)).slice();
  let trimmed = 0;
  const same = (p: [number, number], q: [number, number]) => p[0] === q[0] && p[1] === q[1];
  if (same(a[a.length - 1], b[0])) {
    while (a.length > 2 && b.length > 2 && same(a[a.length - 2], b[1])) { trimmed += 2 * haversine(a[a.length - 1], a[a.length - 2]); a.pop(); ea.pop(); b.shift(); eb.shift(); }
    b.shift(); eb.shift();
  }
  const coordinates = [...a, ...b];
  const ascents = [left.legAscents?.[0], right.legAscents?.[0]];
  const roads = [left.majorRoadMetres, right.majorRoadMetres];
  const majorRoadMetres = roads.every((v): v is number => v !== undefined) ? roads[0]! + roads[1]! : undefined;
  return {
    coordinates, legs: [coordinates], legElevations: [[...ea, ...eb]],
    distance: Math.max(0, left.distance + right.distance - trimmed),
    duration: left.duration !== undefined && right.duration !== undefined ? left.duration + right.duration : undefined,
    majorRoadMetres,
    ...(left.legMajorRoadMetres || right.legMajorRoadMetres ? { legMajorRoadMetres: [majorRoadMetres ?? null] } : {}),
    legAscents: [ascents.every((v): v is number => v != null) ? ascents[0]! + ascents[1]! : null],
  };
}

const cell = (p: Point) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`;
/** Calcule une portion ; si elle est trop longue pour le service, la coupe récursivement en deux. */
async function solve(a: Point, b: Point, ctx: Context, alternative = 0, depth = 0): Promise<ScoredRoute> {
  const key = `${endpoint}|${ctx.activity}|${ctx.avoidFastRoads ? 'v' : 'n'}|${alternative}|${cell(a)}|${cell(b)}`;
  const known = memo.get(key);
  if (known) { ctx.tick(); return known; }
  const length = haversine([a.lat, a.lng], [b.lat, b.lng]);
  let result: ScoredRoute | undefined;
  let failure: unknown;
  if (length <= routingTuning.directMaxMetres || depth >= 14) {
    try { result = await fetchLeaf(a, b, ctx, alternative); }
    catch (error) { if (!(error instanceof RoutingLimitError) || length < routingTuning.minSplitMetres || depth >= 14) throw error; failure = error; }
  }
  if (!result) {
    let lastError: unknown = failure;
    for (const [lat, lng] of splitCandidates([a.lat, a.lng], [b.lat, b.lng])) {
      const middle: Point = { id: `auto-${depth}`, lat, lng };
      try {
        const [left, right] = await Promise.all([solve(a, middle, ctx, alternative, depth + 1), solve(middle, b, ctx, alternative, depth + 1)]);
        result = joinHalves(left, right);
        break;
      } catch (error) {
        if (!(error instanceof PointError)) throw error;
        lastError = error;
      }
    }
    if (!result) throw lastError ?? new Error(serviceMessage('découpage impossible'));
  }
  remember(key, result);
  return result;
}

async function calculatePreferredLeg(a: Point, b: Point, ctx: Context): Promise<ScoredRoute> {
  const base = await solve(a, b, ctx);
  if (ctx.avoidFastRoads && base.majorRoadMetres === 0 && !b.closesLoop) return base;
  let alternatives: PromiseSettledResult<ScoredRoute>[] = [];
  if (haversine([a.lat, a.lng], [b.lat, b.lng]) <= routingTuning.alternativesMaxMetres) {
    const alternativesController = new AbortController();
    const abortAlternatives = () => alternativesController.abort();
    if (ctx.signal.aborted) throw abortError();
    ctx.signal.addEventListener('abort', abortAlternatives, { once: true });
    // Les variantes sont facultatives : on garde l'itinéraire principal si elles tardent.
    const timeout = setTimeout(abortAlternatives, 60000);
    const alternativeContext = { ...ctx, signal: alternativesController.signal };
    try { alternatives = await Promise.allSettled([solve(a, b, alternativeContext, 1), solve(a, b, alternativeContext, 2)]); }
    finally { clearTimeout(timeout); ctx.signal.removeEventListener('abort', abortAlternatives); }
    if (ctx.signal.aborted) throw abortError();
  }
  const all = [base, ...alternatives.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])];
  const candidates = ctx.avoidFastRoads ? all.filter(candidate => candidate.majorRoadMetres !== undefined) : all;
  if (!candidates.length) throw new Error('Le service ne fournit pas les catégories de routes nécessaires au filtre.');
  return candidates.reduce((best, candidate) => {
    if (ctx.avoidFastRoads && candidate.majorRoadMetres !== best.majorRoadMetres) return candidate.majorRoadMetres! < best.majorRoadMetres! ? candidate : best;
    return candidate.duration !== undefined && (best.duration === undefined || candidate.duration < best.duration) ? candidate : best;
  });
}

/** Vrai si au moins une altitude est connue. */
export function hasElevation(route: Route): boolean { return Boolean(route.elevations?.some(value => value != null)); }
export function assembleRoute(results: Route[]): Route {
  const legs = results.flatMap(route => route.legs);
  const legElevations = results.map(route => route.legElevations?.[0] ?? route.coordinates.map(() => null));
  const { coordinates, elevations } = joinLegs(legs, legElevations);
  return {
    coordinates,
    legs,
    distance: results.reduce((sum, route) => sum + route.distance, 0),
    legDistances: results.map(route => route.distance),
    legAscents: results.map(route => route.legAscents?.[0] ?? null),
    ...(results.some(route => route.legMajorRoadMetres?.[0] != null) ? { legMajorRoadMetres: results.map(route => route.legMajorRoadMetres?.[0] ?? null) } : {}),
    legElevations,
    elevations,
  };
}

const emptyLeg = (): Route => ({ coordinates: [], legs: [[]], distance: 0, legAscents: [0], legElevations: [[]], legMajorRoadMetres: [0] });
/** Calcule un parcours de n'importe quelle longueur et avec des centaines de points ; coordinates returned are [latitude, longitude]. */
export async function calculateRoute(points: Point[], activity: Activity, signal: AbortSignal, previous?: { points: Point[]; route: Route }, avoidFastRoads = false, onProgress?: (done: number, total: number) => void): Promise<Route> {
  const total = points.length - 1;
  const results: Route[] = new Array(Math.max(0, total));
  const inner = new AbortController();
  const forward = () => inner.abort();
  if (signal.aborted) throw abortError();
  signal.addEventListener('abort', forward, { once: true });
  let done = 0;
  const report = () => onProgress?.(done, total);
  const ctx: Context = { signal: inner.signal, activity, avoidFastRoads, tick: report };
  const old = new Map<string, number>();
  previous?.points.forEach((point, i) => {
    const next = previous.points[i + 1];
    if (next) { const k = `${point.id}@${point.lat},${point.lng}>${next.id}@${next.lat},${next.lng}`; if (!old.has(k)) old.set(k, i); }
  });
  const reusable = (a: Point, b: Point): number => {
    for (const id of a.startsNewStage && a.stageSourceId ? [a.id, a.stageSourceId] : [a.id]) {
      const index = old.get(`${id}@${a.lat},${a.lng}>${b.id}@${b.lat},${b.lng}`);
      if (index !== undefined) return index;
    }
    return -1;
  };
  let next = 0;
  const worker = async () => {
    while (next < total && !inner.signal.aborted) {
      const index = next++;
      const a = points[index], b = points[index + 1];
      try {
        if (b.startsNewStage) results[index] = emptyLeg();
        else {
          const oldIndex = previous ? reusable(a, b) : -1;
          const leg = oldIndex >= 0 ? previous?.route.legs[oldIndex] : undefined;
          const length = oldIndex >= 0 ? previous?.route.legDistances?.[oldIndex] : undefined;
          if (leg && length !== undefined) results[index] = { coordinates: leg, legs: [leg], distance: length, legAscents: [previous?.route.legAscents?.[oldIndex] ?? null], legElevations: previous?.route.legElevations ? [previous.route.legElevations[oldIndex]] : undefined, legMajorRoadMetres: [previous?.route.legMajorRoadMetres?.[oldIndex] ?? null] };
          else results[index] = avoidFastRoads || b.closesLoop ? await calculatePreferredLeg(a, b, ctx) : await solve(a, b, ctx);
        }
        done++; report();
      } catch (error) {
        inner.abort();
        if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw abortError();
        const message = error instanceof Error ? error.message : 'Calcul impossible.';
        throw new Error(total > 1 ? `Entre le point ${index + 1} et le point ${index + 2} : ${message}` : message);
      }
    }
  };
  try {
    const outcomes = await Promise.allSettled(Array.from({ length: Math.min(total, 8) }, worker));
    if (signal.aborted) throw abortError();
    const failed = outcomes.find((o): o is PromiseRejectedResult => o.status === 'rejected' && !(o.reason instanceof DOMException && o.reason.name === 'AbortError'));
    if (failed) throw failed.reason;
    if (outcomes.some(o => o.status === 'rejected')) throw abortError();
  } finally { signal.removeEventListener('abort', forward); }
  return assembleRoute(results);
}

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
