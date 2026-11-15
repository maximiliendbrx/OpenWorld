import { afterEach, expect, it, vi } from 'vitest';
import { calculateRoute, createGpx, type Point } from './routing';
afterEach(() => vi.unstubAllGlobals());
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
