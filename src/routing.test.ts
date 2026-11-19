import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { calculateRoute, clearRouteCache, resetRoutingPace, routeKey, continuousSegments, createGpx, majorRoadDistance, routingTuning, type Point } from './routing';
import { compactRoute } from './compact';
import { readDraft, writeDraft, type Snapshot } from './storage';
beforeEach(() => { clearRouteCache(); routingTuning.retryBaseMs = 0; routingTuning.rateLimitBaseMs = 0; routingTuning.minGapMs = 0; resetRoutingPace(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const points: Point[] = [{ id: 'a', lat: 45, lng: 6 }, { id: 'b', lat: 45, lng: 6.1 }, { id: 'c', lat: 45, lng: 6.2 }];
const response = (start: number, end: number, distance: number, ascent?: number) => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [{ geometry: { type: 'LineString', coordinates: [[start, 45, 100], [end, 45, 110]] }, properties: { 'track-length': String(distance), 'filtered ascend': ascent === undefined ? undefined : String(ascent) } }] }) });
it.each([['road', 'fastbike'], ['gravel', 'gravel'], ['mtb', 'mtb']] as const)('utilise le profil vélo %s et conserve la géométrie et la distance', async (activity, profile) => {
  const fetchMock = vi.fn().mockResolvedValue(response(6, 6.1, 500));
  vi.stubGlobal('fetch', fetchMock);
  const route = await calculateRoute(points.slice(0, 2), activity, new AbortController().signal);
  expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('profile')).toBe(profile);
  expect(route).toEqual({ coordinates: [[45, 6], [45, 6.1]], legs: [[[45, 6], [45, 6.1]]], distance: 500, legDistances: [500], legAscents: [null], legElevations: [[null, null]], elevations: [null, null] });
});
it('préserve les portions inchangées pendant une modification', async () => {
  const fetchMock = vi.fn().mockResolvedValue(response(6.1, 6.3, 300));
  vi.stubGlobal('fetch', fetchMock);
  const previous = { points, route: { coordinates: [[45, 6], [45, 6.05], [45, 6.1], [45, 6.2]] as [number, number][], legs: [[[45, 6], [45, 6.05], [45, 6.1]], [[45, 6.1], [45, 6.2]]] as [number, number][][], distance: 450, legDistances: [200, 250], legAscents: [10, 25], legElevations: [[100, 105, 110], [110, 120]] } };
  const route = await calculateRoute([points[0], points[1], { ...points[2], lng: 6.3 }], 'road', new AbortController().signal, previous);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(route.legs[0]).toEqual(previous.route.legs[0]);
  expect(route.elevations).toEqual([100, 105, 110, null]);
  expect(route.distance).toBe(500);
});
it('recalcule les deux portions adjacentes au point partagé déplacé', async () => {
  const fetchMock = vi.fn(async (url: string) => {
    const pairs = new URL(url).searchParams.get('lonlats')!.split('|').map(pair => pair.split(',').map(Number));
    return { ok: true, json: async () => ({ type: 'FeatureCollection', features: [{ geometry: { type: 'LineString', coordinates: pairs }, properties: { 'track-length': '100' } }] }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  const previous = { points, route: { coordinates: [[45, 6], [45, 6.1], [45, 6.2]] as [number, number][], legs: [[[45, 6], [45, 6.1]], [[45, 6.1], [45, 6.2]]] as [number, number][][], distance: 400, legDistances: [200, 200] } };
  const moved = [points[0], { ...points[1], lat: 45.05 }, points[2]];
  const route = await calculateRoute(moved, 'road', new AbortController().signal, previous);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(route.legs[0].at(-1)).toEqual([45.05, 6.1]);
  expect(route.legs[1][0]).toEqual([45.05, 6.1]);
});
it('relie les portions et additionne leurs distances', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(6, 6.1, 200, 10)).mockResolvedValueOnce(response(6.1, 6.2, 250, 25)));
  const route = await calculateRoute(points, 'gravel', new AbortController().signal);
  expect(route.coordinates).toEqual([[45, 6], [45, 6.1], [45, 6.2]]);
  expect(route.distance).toBe(450);
  expect(route.legDistances).toEqual([200, 250]);
  expect(route.legAscents).toEqual([10, 25]);
});
it('ne trace pas ni ne compte la distance entre étapes indépendantes et exporte deux segments GPX', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(response(6, 6.1, 200)).mockResolvedValueOnce(response(7, 7.1, 300));
  vi.stubGlobal('fetch', fetchMock);
  const stages: Point[] = [points[0], points[1], { id: 'start2', lat: 45, lng: 7, startsNewStage: true }, { id: 'end2', lat: 45, lng: 7.1 }];
  const route = await calculateRoute(stages, 'road', new AbortController().signal);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(route.distance).toBe(500);
  expect(route.legs[1]).toEqual([]);
  expect(continuousSegments(route)).toEqual([[[45, 6], [45, 6.1]], [[45, 7], [45, 7.1]]]);
  expect(createGpx(route, 'Étapes').match(/<trkseg>/g)).toHaveLength(2);
});
it('préserve le tracé de l’étape suivante lorsque seule l’arrivée précédente est déplacée', async () => {
  const fetchMock = vi.fn().mockResolvedValue(response(6, 6.15, 220));
  vi.stubGlobal('fetch', fetchMock);
  const previous = { points, route: { coordinates: [[45, 6], [45, 6.1], [45, 6.2]] as [number, number][], legs: [[[45, 6], [45, 6.1]], [[45, 6.1], [45, 6.15], [45, 6.2]]] as [number, number][][], distance: 400, legDistances: [200, 200] } };
  const updated: Point[] = [points[0], { ...points[1], lng: 6.15 }, { ...points[1], id: 'separate', startsNewStage: true, stageSourceId: points[1].id }, points[2]];
  const route = await calculateRoute(updated, 'road', new AbortController().signal, previous);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(route.legs[1]).toEqual([]);
  expect(route.legs[2]).toEqual(previous.route.legs[1]);
});
it('choisit le retour le plus rapide parmi les options disponibles sans changer le profil', async () => {
  const fetchMock = vi.fn(async (url: string) => {
    const params = new URL(url).searchParams;
    const index = Number(params.get('alternativeidx'));
    const locations = params.get('lonlats')!.split('|');
    const returning = locations[1] === '6,45';
    const duration = returning ? [120, 80, 110][index] : 100;
    const start = returning ? 6.1 : 6, end = returning ? 6 : 6.1;
    return { ok: true, json: async () => ({ type: 'FeatureCollection', features: [{ geometry: { type: 'LineString', coordinates: [[start, 45], [end, 45]] }, properties: { 'track-length': String(returning ? [300, 400, 350][index] : 200), 'total-time': String(duration) } }] }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  const route = await calculateRoute([points[0], points[1], { id: 'return', lat: 45, lng: 6, closesLoop: true }], 'gravel', new AbortController().signal);
  expect(route.legDistances).toEqual([200, 400]);
  expect(route.distance).toBe(600);
  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(fetchMock.mock.calls.every(call => new URL(call[0]).searchParams.get('profile') === 'gravel')).toBe(true);
});
it('conserve le retour principal lorsque les alternatives sont indisponibles', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (new URL(url).searchParams.get('alternativeidx') !== '0') return { ok: false, status: 404 };
    return response(6.1, 6, 300, 10);
  }));
  const route = await calculateRoute([points[1], { id: 'return', lat: 45, lng: 6, closesLoop: true }], 'road', new AbortController().signal);
  expect(route.distance).toBe(300);
  expect(route.coordinates).toEqual([[45, 6.1], [45, 6]]);
});
it('mesure les axes principaux en fonction des catégories retournées par le moteur', () => {
  const messages = [['Distance', 'WayTags'], ['100', 'highway=primary surface=asphalt'], ['60', 'highway=secondary'], ['40', 'highway=cycleway'], ['30', 'highway=trunk_link'], ['20', 'highway=residential'], ['50', 'highway=tertiary maxspeed=50_mph'], ['70', 'highway=unclassified maxspeed=80'], ['25', 'highway=tertiary maxspeed=30_mph']];
  expect(majorRoadDistance(messages)).toBe(310);
  expect(majorRoadDistance([['Distance', 'WayTags'], ['5', 'highway=cycleway']])).toBe(0);
  expect(majorRoadDistance([['Distance', 'WayTags'], ['5', 'highway=cycleway'], ['30', '']])).toBeUndefined();
  expect(majorRoadDistance(undefined)).toBeUndefined();
});
it.each([['road', 'fastbike-verylowtraffic'], ['gravel', 'gravel'], ['mtb', 'mtb']] as const)('privilégie les alternatives avec moins de grands axes en profil %s', async (activity, expectedProfile) => {
  const fetchMock = vi.fn(async (url: string) => {
    const params = new URL(url).searchParams;
    const index = Number(params.get('alternativeidx'));
    const messages = [['Distance', 'WayTags'], [String([100, 0, 30][index]), 'highway=primary'], ['400', 'highway=cycleway']];
    return { ok: true, json: async () => ({ type: 'FeatureCollection', features: [{ geometry: { type: 'LineString', coordinates: [[6, 45], [6.1, 45]] }, properties: { 'track-length': String([500, 700, 600][index]), 'total-time': String([100, 140, 120][index]), messages } }] }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  const route = await calculateRoute(points.slice(0, 2), activity, new AbortController().signal, undefined, true);
  expect(route.distance).toBe(700);
  expect(route.legMajorRoadMetres).toEqual([0]);
  expect(fetchMock.mock.calls.every(call => new URL(call[0]).searchParams.get('profile') === expectedProfile)).toBe(true);
});
it('signale une absence de catégories plutôt que prétendre éviter les grands axes', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(6, 6.1, 500)));
  await expect(calculateRoute(points.slice(0, 2), 'gravel', new AbortController().signal, undefined, true)).rejects.toThrow('catégories');
});
it('refuse un résultat invalide et remonte les erreurs HTTP', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(200, 6, 100)).mockResolvedValue({ ok: false, status: 429 }));
  await expect(calculateRoute(points.slice(0, 2), 'road', new AbortController().signal)).rejects.toThrow('invalide');
  await expect(calculateRoute(points.slice(0, 2), 'road', new AbortController().signal)).rejects.toThrow('saturé');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
  await expect(calculateRoute(points.slice(0, 2), 'road', new AbortController().signal)).rejects.toThrow('404');
});
it('exporte tous les points routés en GPX et échappe le nom', () => {
  const gpx = createGpx({ distance: 100, coordinates: [[45, 6], [45, 6.1]], legs: [[[45, 6], [45, 6.1]]] }, 'Lac & <montagne>');
  expect(gpx).toContain('Lac &amp; &lt;montagne&gt;');
  expect(gpx.match(/<trkpt /g)).toHaveLength(2);
});

it('attend une alternative lente avant de choisir le retour', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const index = Number(new URL(url).searchParams.get('alternativeidx'));
    if (index) await new Promise(resolve => setTimeout(resolve, 5000));
    return { ok: true, json: async () => ({ type: 'FeatureCollection', features: [{ geometry: { type: 'LineString', coordinates: [[6.1, 45], [6, 45]] }, properties: { 'track-length': String(index === 1 ? 400 : 300), 'total-time': String(index === 1 ? 80 : 120) } }] }) };
  }));
  const pending = calculateRoute([points[1], { ...points[0], closesLoop: true }], 'road', new AbortController().signal);
  await vi.advanceTimersByTimeAsync(5000);
  expect((await pending).distance).toBe(400);
});

it('découpe un long trajet si le service interrompt le profil évitant les voies rapides', async () => {
  const longPoints: Point[] = [{ id: 'a', lat: 45, lng: 6 }, { id: 'b', lat: 45, lng: 6.4 }];
  const fetchMock = vi.fn(async (url: string) => {
    const params = new URL(url).searchParams;
    const pair = params.get('lonlats')!.split('|').map(p => p.split(',').map(Number));
    if (params.get('profile') === 'fastbike-verylowtraffic' && pair[1][0] - pair[0][0] > 0.35) return { ok: false, status: 400, text: async () => 'operation killed by thread-priority-watchdog after 2 seconds' };
    const coords = params.get('profile') === 'fastbike' ? [[6, 45], [6.2, 45], [6.4, 45]] : pair;
    return { ok: true, json: async () => ({ type: 'FeatureCollection', features: [{ geometry: { type: 'LineString', coordinates: coords }, properties: { 'track-length': '1000', 'filtered ascend': '10', messages: [['Distance', 'WayTags'], ['1000', 'highway=cycleway']] } }] }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  const result = await calculateRoute(longPoints, 'road', new AbortController().signal, undefined, true);
  expect(result.coordinates).toHaveLength(3);
  expect(result.coordinates[0]).toEqual([45, 6]);
  expect(result.coordinates[2]).toEqual([45, 6.4]);
  expect(result.coordinates[1][1]).toBeCloseTo(6.2, 3);
  expect(result.legDistances).toEqual([2000]);
  expect(result.legMajorRoadMetres).toEqual([0]);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
it('conserve les anciennes portions sans filtre quand les nouveaux points utilisent le filtre', async () => {
  const previous = { points: points.slice(0, 2), route: { coordinates: [[45, 6], [45, 6.05], [45, 6.1]] as [number, number][], legs: [[[45, 6], [45, 6.05], [45, 6.1]]] as [number, number][][], distance: 200, legDistances: [200], legAscents: [10], legElevations: [[100, 105, 110]] } };
  const fetchMock = vi.fn(async (_url: string) => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [{ geometry: { type: 'LineString', coordinates: [[6.1, 45], [6.2, 45]] }, properties: { 'track-length': '300', messages: [['Distance', 'WayTags'], ['300', 'highway=cycleway']] } }] }) }));
  vi.stubGlobal('fetch', fetchMock);
  const route = await calculateRoute(points, 'road', new AbortController().signal, previous, true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(new URL(fetchMock.mock.calls[0][0] as string).searchParams.get('profile')).toBe('fastbike-verylowtraffic');
  expect(route.legs[0]).toEqual(previous.route.legs[0]);
  expect(route.legDistances).toEqual([200, 300]);
  expect(route.legMajorRoadMetres).toEqual([null, 0]);
  expect(route.elevations?.slice(0, 3)).toEqual([100, 105, 110]);
});
it('conserve les portions filtrées quand les nouveaux points ne le sont plus', async () => {
  const previous = { points: points.slice(0, 2), route: { coordinates: [[45, 6], [45, 6.1]] as [number, number][], legs: [[[45, 6], [45, 6.1]]] as [number, number][][], distance: 200, legDistances: [200], legMajorRoadMetres: [42] } };
  const fetchMock = vi.fn().mockResolvedValue(response(6.1, 6.2, 300));
  vi.stubGlobal('fetch', fetchMock);
  const route = await calculateRoute(points, 'road', new AbortController().signal, previous, false);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('profile')).toBe('fastbike');
  expect(route.legs[0]).toEqual(previous.route.legs[0]);
  expect(route.legMajorRoadMetres).toEqual([42, null]);
});

// --- Fiabilité : très longs parcours, centaines de points, reprises ---
const hav = (a: number[], b: number[]) => { const r = Math.PI / 180, h = Math.sin((b[1] - a[1]) * r / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin((b[0] - a[0]) * r / 2) ** 2; return 12742000 * Math.asin(Math.sqrt(h)); };
/** Faux service : interrompt tout calcul de plus de `limit` mètres, comme le vrai (watchdog). */
const fakeService = (limit = 130_000, onCall?: (pair: number[][]) => void) => vi.fn(async (url: string) => {
  const pair = new URL(url).searchParams.get('lonlats')!.split('|').map(p => p.split(',').map(Number));
  onCall?.(pair);
  const d = hav(pair[0], pair[1]);
  if (d > limit) return { ok: false, status: 400, text: async () => 'operation killed by thread-priority-watchdog after 2 seconds' };
  return { ok: true, json: async () => ({ type: 'FeatureCollection', features: [{ geometry: { type: 'LineString', coordinates: [pair[0], [(pair[0][0] + pair[1][0]) / 2, (pair[0][1] + pair[1][1]) / 2], pair[1]] }, properties: { 'track-length': String(d * 1.2), 'filtered ascend': String(d / 100) } }] }) };
});
it('calcule un trajet de 1000 km en deux points en le découpant automatiquement', async () => {
  const fetchMock = fakeService();
  vi.stubGlobal('fetch', fetchMock);
  const route = await calculateRoute([{ id: 'a', lat: 48.85, lng: 2.35 }, { id: 'b', lat: 41.9, lng: 12.5 }], 'road', new AbortController().signal);
  expect(route.legs).toHaveLength(1);
  expect(route.coordinates[0]).toEqual([48.85, 2.35]);
  expect(route.coordinates.at(-1)).toEqual([41.9, 12.5]);
  expect(route.distance).toBeGreaterThan(1_000_000);
  expect(route.legAscents![0]).toBeGreaterThan(0);
  // aucune requête ne dépasse la limite du service
  expect(fetchMock.mock.calls.every(call => hav(...(new URL(call[0]).searchParams.get('lonlats')!.split('|').map(p => p.split(',').map(Number)) as [number[], number[]])) <= 130_000)).toBe(true);
});
it('découpe aussi quand le service interrompt une portion plus courte que prévu', async () => {
  const fetchMock = fakeService(30_000);
  vi.stubGlobal('fetch', fetchMock);
  const route = await calculateRoute([{ id: 'a', lat: 45, lng: 6 }, { id: 'b', lat: 45, lng: 6.8 }], 'gravel', new AbortController().signal);
  expect(route.distance).toBeGreaterThan(60_000);
  expect(route.coordinates.at(-1)).toEqual([45, 6.8]);
});
it('calcule 600 points de passage sans dépasser 3 requêtes simultanées et signale la progression', async () => {
  let live = 0, peak = 0;
  const base = fakeService();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { live++; peak = Math.max(peak, live); await new Promise(r => setTimeout(r, 1)); live--; return base(url); }));
  const many: Point[] = Array.from({ length: 600 }, (_, i) => ({ id: `p${i}`, lat: 45 + i * 0.002, lng: 6 + (i % 7) * 0.003 }));
  const seen: number[] = [];
  const route = await calculateRoute(many, 'road', new AbortController().signal, undefined, false, done => seen.push(done));
  expect(route.legs).toHaveLength(599);
  expect(route.coordinates.length).toBeGreaterThan(1000);
  expect(peak).toBeLessThanOrEqual(3);
  expect(Math.max(...seen)).toBe(599);
});
it('réessaie après une surcharge (429/503/réseau) puis aboutit', async () => {
  let n = 0;
  vi.stubGlobal('fetch', vi.fn(async () => { n++; if (n === 1) return { ok: false, status: 429 }; if (n === 2) throw new TypeError('network'); if (n === 3) return { ok: false, status: 503 }; return response(6, 6.1, 500); }));
  const route = await calculateRoute(points.slice(0, 2), 'road', new AbortController().signal);
  expect(route.distance).toBe(500);
  expect(n).toBe(4);
});
it('conserve les portions déjà calculées quand une autre échoue, et reprend sans les recalculer', async () => {
  const many: Point[] = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, lat: 45, lng: 6 + i * 0.05 }));
  let broken = true;
  const base = fakeService();
  const fetchMock = vi.fn(async (url: string) => { if (broken && new URL(url).searchParams.get('lonlats')!.startsWith('6.15,45|')) return { ok: false, status: 404 }; return base(url); });
  vi.stubGlobal('fetch', fetchMock);
  await expect(calculateRoute(many, 'road', new AbortController().signal)).rejects.toThrow('point 4');
  const callsAfterFailure = fetchMock.mock.calls.length;
  broken = false;
  const route = await calculateRoute(many, 'road', new AbortController().signal);
  expect(route.legs).toHaveLength(5);
  expect(fetchMock.mock.calls.length - callsAfterFailure).toBeLessThan(5);
});
it('déplace le point de découpe quand le milieu tombe hors de tout chemin', async () => {
  const base = fakeService(60_000);
  const mid = { lng: 6.4, lat: 45 };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const pair = new URL(url).searchParams.get('lonlats')!.split('|').map(p => p.split(',').map(Number));
    if (pair.some(p => Math.abs(p[0] - mid.lng) < 1e-6 && Math.abs(p[1] - mid.lat) < 1e-6)) return { ok: false, status: 400, text: async () => 'to-position not mapped in existing datafile' };
    return base(url);
  }));
  const route = await calculateRoute([{ id: 'a', lat: 45, lng: 6 }, { id: 'b', lat: 45, lng: 6.8 }], 'road', new AbortController().signal);
  expect(route.coordinates.at(-1)).toEqual([45, 6.8]);
});
it('supprime l’aller-retour créé quand le point de découpe tombe sur une impasse', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const pair = new URL(url).searchParams.get('lonlats')!.split('|').map(p => p.split(',').map(Number));
    if (hav(pair[0], pair[1]) > 100_000) return { ok: false, status: 400, text: async () => 'operation killed by thread-priority-watchdog after 2 seconds' };
    const [[x1, y1], [x2, y2]] = pair;
    // la première moitié arrive au milieu par une impasse (6.3 -> 6.31 -> milieu), la seconde repart par la même impasse
    const spurIn = Math.abs(x2 - 6.5) < 0.01, spurOut = Math.abs(x1 - 6.5) < 0.01;
    const coords = spurIn ? [[x1, y1], [x2 - 0.01, 45], [x2, y2]] : spurOut ? [[x1, y1], [x1 - 0.01, 45], [x2, y2]] : [[x1, y1], [x2, y2]];
    return { ok: true, json: async () => ({ type: 'FeatureCollection', features: [{ geometry: { type: 'LineString', coordinates: coords }, properties: { 'track-length': '1000' } }] }) };
  }));
  const route = await calculateRoute([{ id: 'a', lat: 45, lng: 6 }, { id: 'b', lat: 45, lng: 7 }], 'road', new AbortController().signal);
  const lngs = route.coordinates.map(c => c[1]);
  expect(lngs).toEqual([...lngs].sort((a, b) => a - b));
});
it('annule immédiatement quand la demande est abandonnée', async () => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
  const controller = new AbortController();
  const pending = calculateRoute(points, 'road', controller.signal);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
});
it('compacte et restaure un très long parcours dans le stockage sans perdre distance ni extrémités', () => {
  const coords: [number, number][] = Array.from({ length: 80_000 }, (_, i) => [45 + i * 1e-5, 6 + Math.sin(i / 50) * 0.01]);
  const legs = [coords.slice(0, 40_000), coords.slice(39_999)];
  const route = { coordinates: coords, legs, distance: 900_000, legDistances: [450_000, 450_000], legAscents: [100, 200], legElevations: legs.map(leg => leg.map(() => 100.4)), elevations: coords.map(() => 100.4) };
  const compact = compactRoute(route, 15_000);
  expect(compact.legs.reduce((s, l) => s + l.length, 0)).toBeLessThanOrEqual(15_000);
  expect(compact.legs[0][0]).toEqual([45, 6]);
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } } as unknown as Storage;
  const pts: Point[] = [{ id: 'a', lat: 45, lng: 6 }, { id: 'b', lat: 45.4, lng: 6 }, { id: 'c', lat: 45.8, lng: 6 }];
  const snapshot: Snapshot = { version: 1, name: 'long', activity: 'road', points: pts, boundaries: [], savedId: null, cached: { key: routeKey('road', pts), activity: 'road', points: pts, route } };
  writeDraft(storage, snapshot);
  expect(store.get('openworld.draft.v1')!.length).toBeLessThan(1_500_000);
  const restored = readDraft(storage)!;
  expect(restored.cached!.route.distance).toBe(900_000);
  expect(restored.cached!.route.coordinates.length).toBe(restored.cached!.route.legs[0].length + restored.cached!.route.legs[1].length - 1);
  expect(restored.cached!.route.elevations!.length).toBe(restored.cached!.route.coordinates.length);
});
it('accepte deux checkpoints voisins qui se calent sur le même point du réseau (ligne d’un seul point)', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [{ geometry: { type: 'LineString', coordinates: [[6.1, 45, 500]] }, properties: { 'track-length': '0', 'filtered ascend': '0' } }] }) })));
  const route = await calculateRoute(points.slice(0, 2), 'gravel', new AbortController().signal);
  expect(route.distance).toBe(0);
  expect(route.legs[0]).toEqual([[45, 6.1], [45, 6.1]]);
});
it('ralentit et patiente quand le service public refuse les rafales (403 « retry later »)', async () => {
  let n = 0;
  vi.stubGlobal('fetch', vi.fn(async () => { n++; if (n <= 3) return { ok: false, status: 403, text: async () => 'Please, retry later!' }; return response(6, 6.1, 500); }));
  const route = await calculateRoute(points.slice(0, 2), 'road', new AbortController().signal);
  expect(route.distance).toBe(500);
  expect(n).toBe(4);
});
