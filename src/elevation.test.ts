import { afterEach, expect, it, vi } from 'vitest';
import { calculateAscent, sampleRoute } from './elevation';

afterEach(() => vi.unstubAllGlobals());
it('échantillonne le parcours entier avec un nombre de points limité', () => {
  const samples = sampleRoute([[45, 6], [45, 6.1], [45.1, 6.1]], 100000);
  expect(samples).toHaveLength(100);
  expect(samples[0]).toEqual([45, 6]);
  expect(samples.at(-1)).toEqual([45.1, 6.1]);
});
it('additionne seulement les montées et refuse une réponse incomplète', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ elevation: [100, 110, 105, 120] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ elevation: [100] }) });
  vi.stubGlobal('fetch', fetchMock);
  const route: [number, number][] = [[45, 6], [45.001, 6]];
  expect(await calculateAscent(route, 150, new AbortController().signal)).toBe(25);
  await expect(calculateAscent(route, 150, new AbortController().signal)).rejects.toThrow();
});
