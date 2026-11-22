import { describe, expect, it } from 'vitest';
import { routeSignature } from './autosave';

const base = { name: 'A', activity: 'road' as const, points: [{ id: 'a', lat: 1, lng: 2 }, { id: 'b', lat: 3, lng: 4 }], boundaries: [], cached: null };
describe('routeSignature', () => {
  it('est stable pour un même contenu', () => { expect(routeSignature(base)).toBe(routeSignature({ ...base })); });
  it('change quand un point bouge', () => { expect(routeSignature(base)).not.toBe(routeSignature({ ...base, points: [base.points[0], { id: 'b', lat: 3, lng: 4.1 }] })); });
  it('change avec le nom, l’activité ou les routes rapides', () => {
    expect(routeSignature(base)).not.toBe(routeSignature({ ...base, name: 'B' }));
    expect(routeSignature(base)).not.toBe(routeSignature({ ...base, activity: 'gravel' }));
    expect(routeSignature(base)).not.toBe(routeSignature({ ...base, avoidFastRoads: true }));
  });
  it('change quand le tracé calculé est mis en cache', () => {
    const cached = { key: 'k', activity: 'road' as const, points: base.points, route: { coordinates: [], legs: [], distance: 1 } };
    expect(routeSignature(base)).not.toBe(routeSignature({ ...base, cached }));
  });
});
