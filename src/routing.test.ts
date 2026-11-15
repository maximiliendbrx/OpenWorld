import { afterEach, expect, it, vi } from 'vitest';
import { calculateRoute, createGpx, type Point } from './routing';
afterEach(() => vi.unstubAllGlobals());
const points: Point[] = [{ id: 'a', lat: 45, lng: 6 }, { id: 'b', lat: 45, lng: 6.1 }, { id: 'c', lat: 45, lng: 6.2 }];
const response = (start: number, end: number, distance: number) => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [{ geometry: { type: 'LineString', coordinates: [[start, 45, 100], [end, 45, 110]] }, properties: { 'track-length': String(distance) } }] }) });
it.each([['road', 'fastbike'], ['gravel', 'gravel'], ['mtb', 'mtb']] as const)('utilise le profil vélo %s et conserve la géométrie et la distance', async (activity, profile) => {
  const fetchMock = vi.fn().mockResolvedValue(response(6, 6.1, 500));
  vi.stubGlobal('fetch', fetchMock);
  const route = await calculateRoute(points.slice(0, 2), activity, new AbortController().signal);
  expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('profile')).toBe(profile);
  expect(route).toEqual({ coordinates: [[45, 6], [45, 6.1]], legs: [[[45, 6], [45, 6.1]]], distance: 500, legDistances: [500] });
});
it('relie les portions et additionne leurs distances', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(6, 6.1, 200)).mockResolvedValueOnce(response(6.1, 6.2, 250)));
  const route = await calculateRoute(points, 'gravel', new AbortController().signal);
  expect(route.coordinates).toEqual([[45, 6], [45, 6.1], [45, 6.2]]);
  expect(route.distance).toBe(450);
  expect(route.legDistances).toEqual([200, 250]);
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
