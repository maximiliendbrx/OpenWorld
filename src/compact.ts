import type { Route } from './routing';

type Coordinate = [number, number];
/** Distance (m, approximation plane locale) d'un point à un segment. */
function deviation(p: Coordinate, a: Coordinate, b: Coordinate, scale: number): number {
  const ax = a[1] * scale, ay = a[0], bx = b[1] * scale, by = b[0], px = p[1] * scale, py = p[0];
  const dx = bx - ax, dy = by - ay, denominator = dx * dx + dy * dy;
  const t = denominator ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / denominator)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy) * 111_320;
}
/** Douglas-Peucker itératif (sans récursion : sûr pour des dizaines de milliers de points). Garde toujours les extrémités. */
export function simplifyIndices(points: Coordinate[], tolerance: number): number[] {
  if (points.length <= 2) return points.map((_, i) => i);
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const scale = Math.cos(points[Math.floor(points.length / 2)][0] * Math.PI / 180);
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let best = -1, worst = tolerance;
    for (let i = first + 1; i < last; i++) {
      const d = deviation(points[i], points[first], points[last], scale);
      if (d > worst) { worst = d; best = i; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([first, best], [best, last]); }
  }
  const result: number[] = [];
  keep.forEach((flag, i) => { if (flag) result.push(i); });
  return result;
}
const round = (n: number) => Math.round(n * 1e5) / 1e5;
const cache = new WeakMap<Route, Map<number, Route>>();
/**
 * Version compacte d'un parcours pour le stockage : arrondi à ~1 m, géométrie allégée si elle dépasse `maxPoints`
 * (tolérance croissante), sans doublon `coordinates`/`elevations` (reconstruits à la lecture).
 */
export function compactRoute(route: Route, maxPoints: number): Route {
  const known = cache.get(route)?.get(maxPoints);
  if (known) return known;
  const total = route.legs.reduce((sum, leg) => sum + leg.length, 0);
  let kept: number[][] = route.legs.map(leg => leg.map((_, i) => i));
  if (total > maxPoints) {
    for (const tolerance of [2, 4, 8, 15, 30, 60, 120, 250, 500]) {
      kept = route.legs.map(leg => simplifyIndices(leg, tolerance));
      if (kept.reduce((sum, k) => sum + k.length, 0) <= maxPoints) break;
    }
  }
  const legs = route.legs.map((leg, i) => kept[i].map(index => [round(leg[index][0]), round(leg[index][1])] as Coordinate));
  const hasElevation = route.legElevations?.some(leg => leg.some(value => value !== null && value !== undefined));
  const legElevations = hasElevation ? route.legElevations!.map((leg, i) => kept[i].map(index => { const v = leg[index]; return v == null ? null : Math.round(v); })) : undefined;
  const compact: Route = { coordinates: [], legs, distance: route.distance, legDistances: route.legDistances, legAscents: route.legAscents, legMajorRoadMetres: route.legMajorRoadMetres, ...(legElevations ? { legElevations } : {}) };
  for (const key of Object.keys(compact) as (keyof Route)[]) if (compact[key] === undefined) delete compact[key];
  if (!cache.has(route)) cache.set(route, new Map());
  cache.get(route)!.set(maxPoints, compact);
  return compact;
}
