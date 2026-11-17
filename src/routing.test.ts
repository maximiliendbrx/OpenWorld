import { afterEach, expect, it, vi } from 'vitest';
import { calculateRoute, continuousSegments, createGpx, majorRoadDistance, routeTimeoutMs, type Point } from './routing';
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
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(200, 6, 100)).mockResolvedValueOnce({ ok: false, status: 429 }));
  await expect(calculateRoute(points.slice(0, 2), 'road', new AbortController().signal)).rejects.toThrow('invalide');
  await expect(calculateRoute(points.slice(0, 2), 'road', new AbortController().signal)).rejects.toThrow('429');
});
it('exporte tous les points routés en GPX et échappe le nom', () => {
  const gpx = createGpx({ distance: 100, coordinates: [[45, 6], [45, 6.1]], legs: [[[45, 6], [45, 6.1]]] }, 'Lac & <montagne>');
  expect(gpx).toContain('Lac &amp; &lt;montagne&gt;');
  expect(gpx.match(/<trkpt /g)).toHaveLength(2);
});

it('prévoit davantage de temps pour les longs calculs', () => {
  expect(routeTimeoutMs(1)).toBeGreaterThanOrEqual(10 * 60_000);
  expect(routeTimeoutMs(20)).toBeGreaterThan(routeTimeoutMs(1));
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
  expect(result.coordinates).toEqual([[45, 6], [45, 6.2], [45, 6.4]]);
  expect(result.legDistances).toEqual([2000]);
  expect(result.legMajorRoadMetres).toEqual([0]);
  expect(fetchMock).toHaveBeenCalledTimes(4);
});
