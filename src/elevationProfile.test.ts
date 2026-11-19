import { expect, it } from 'vitest';
import { buildProfile } from './ElevationProfile';
import type { Route } from './routing';
const make = (n: number, ele: (i: number) => number | null): Route => {
  const coordinates = Array.from({ length: n }, (_, i) => [45, 6 + i * 0.001] as [number, number]);
  return { coordinates, legs: [coordinates], distance: (n - 1) * 78.7, elevations: coordinates.map((_, i) => ele(i)) };
};
it('construit un profil calé sur la distance du parcours', () => {
  const profile = buildProfile(make(50, i => 100 + i))!;
  expect(profile[0].d).toBe(0);
  expect(profile.at(-1)!.d).toBeCloseTo(49 * 78.7, 0);
  expect(profile.at(-1)!.ele).toBe(149);
});
it('allège un très long profil en gardant les sommets et les creux', () => {
  const profile = buildProfile(make(50_000, i => i === 25_000 ? 900 : i === 12_000 ? -5 : 100))!;
  expect(profile.length).toBeLessThan(1500);
  expect(Math.max(...profile.map(s => s.ele))).toBe(900);
  expect(Math.min(...profile.map(s => s.ele))).toBe(-5);
});
it('refuse un profil sans altitudes ou presque', () => {
  expect(buildProfile(make(10, () => null))).toBeNull();
  expect(buildProfile(make(10, i => i < 3 ? 100 : null))).toBeNull();
});
import { climb } from './ElevationProfile';
it('calcule le dénivelé positif et négatif en ignorant le bruit', () => {
  const at: [number, number] = [45, 6];
  const make = (values: number[]) => values.map((ele, i) => ({ d: i * 10, ele, at }));
  expect(climb(make([100, 101, 100, 101, 100]))).toEqual({ up: 0, down: 0 });
  expect(climb(make([100, 110, 105, 120, 90]))).toEqual({ up: 25, down: 35 });
});
