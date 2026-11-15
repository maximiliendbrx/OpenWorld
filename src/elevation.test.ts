import { afterEach, expect, it, vi } from 'vitest';
import { calculateAscent, sampleRoute } from './elevation';

afterEach(() => vi.unstubAllGlobals());
it('échantillonne le parcours entier avec un nombre de points limité', () => {
  const samples = sampleRoute([[45, 6], [45, 6.1], [45.1, 6.1]], 100000);
  expect(samples).toHaveLength(1000);
  expect(samples[0]).toEqual([45, 6]);
  expect(samples.at(-1)).toEqual([45.1, 6.1]);
});
it('additionne seulement les montées et refuse une réponse incomplète', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ elevation: [100, 110, 105, 120] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ elevation: [100] }) });
  vi.stubGlobal('fetch', fetchMock);
  const route: [number, number][] = [[45, 6], [45.001, 6]];
  expect(await calculateAscent(route, 90, new AbortController().signal)).toBe(25);
  await expect(calculateAscent(route, 90, new AbortController().signal)).rejects.toThrow();
});
it('compte 10 mètres de dénivelé pour une montée de 10 mètres', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ elevation: [100, 103, 107, 110, 110] }) }));
  expect(await calculateAscent([[45, 6], [45.001, 6]], 100, new AbortController().signal)).toBe(10);
});
