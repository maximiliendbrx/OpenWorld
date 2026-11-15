import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateRoute, createGpx, type Point } from './routing';
const points: Point[] = [{ id: 'a', lat: 45.9, lng: 6.1 }, { id: 'b', lat: 45.91, lng: 6.12 }];
afterEach(() => vi.unstubAllGlobals());
describe('routage', () => {
  it('envoie longitude/latitude et conserve toute la géométrie routée', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 'Ok', routes: [{ distance: 1700, geometry: { coordinates: [[6.1,45.9],[6.11,45.905],[6.12,45.91]] } }] }) });
    vi.stubGlobal('fetch', fetchMock);
    const route = await calculateRoute(points, 'foot', new AbortController().signal);
    expect(fetchMock.mock.calls[0][0]).toContain('/6.1,45.9;6.12,45.91?');
    expect(route).toEqual({ distance: 1700, coordinates: [[45.9,6.1],[45.905,6.11],[45.91,6.12]] });
  });
  it('refuse une réponse sans chemin au lieu de relier les points en ligne droite', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 'NoRoute' }) }));
    await expect(calculateRoute(points, 'bike', new AbortController().signal)).rejects.toThrow('Aucun chemin');
  });
  it('refuse une géométrie invalide', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 'Ok', routes: [{ distance: 100, geometry: { coordinates: [[200, 95],[6,45]] } }] }) }));
    await expect(calculateRoute(points, 'foot', new AbortController().signal)).rejects.toThrow('invalide');
  });
  it('remonte les erreurs HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(calculateRoute(points, 'foot', new AbortController().signal)).rejects.toThrow('429');
  });
});
it('exporte un GPX 1.1 avec les points routés et un nom XML échappé', () => {
  const gpx = createGpx({ distance: 100, coordinates: [[45.9,6.1],[45.905,6.11],[45.91,6.12]] }, 'Lac & <montagne>');
  expect(gpx).toContain('xmlns="http://www.topografix.com/GPX/1/1"');
  expect(gpx).toContain('Lac &amp; &lt;montagne&gt;');
  expect(gpx.match(/<trkpt /g)).toHaveLength(3);
  expect(gpx).toContain('<trkpt lat="45.905" lon="6.11">');
});
