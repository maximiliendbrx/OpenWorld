import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { hasElevation, type Route } from './routing';

type Sample = { d: number; ele: number; at: [number, number] };
const RAD = Math.PI / 180;
function haversine(a: [number, number], b: [number, number]): number {
  const dLat = (b[0] - a[0]) * RAD, dLon = (b[1] - a[1]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLon / 2) ** 2;
  return 12_742_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** Courbe altitude/distance : distances cumulées calées sur la distance annoncée, trous d'altitude comblés, allégée en gardant les sommets et les creux. */
export function buildProfile(route: Route, maxSamples = 700): Sample[] | null {
  const { coordinates, elevations } = route;
  if (!elevations || elevations.length !== coordinates.length || coordinates.length < 2 || !hasElevation(route)) return null;
  const known = elevations.filter(value => value != null).length;
  if (known < coordinates.length * 0.9) return null;
  const cumulative = [0];
  for (let i = 1; i < coordinates.length; i++) cumulative.push(cumulative[i - 1] + haversine(coordinates[i - 1], coordinates[i]));
  const total = cumulative[cumulative.length - 1];
  const scale = total > 0 && route.distance > 0 ? route.distance / total : 1;
  const filled: number[] = [];
  let last: number | null = null;
  elevations.forEach(value => { if (value != null) last = value; filled.push(last ?? NaN); });
  const first = filled.find(Number.isFinite) ?? 0;
  const all: Sample[] = coordinates.map((at, i) => ({ d: cumulative[i] * scale, ele: Number.isFinite(filled[i]) ? filled[i] : first, at }));
  if (all.length <= maxSamples) return all;
  const size = Math.ceil(all.length / (maxSamples / 2));
  const result: Sample[] = [all[0]];
  for (let start = 1; start < all.length - 1; start += size) {
    const bucket = all.slice(start, Math.min(all.length - 1, start + size));
    if (!bucket.length) continue;
    const low = bucket.reduce((a, b) => b.ele < a.ele ? b : a), high = bucket.reduce((a, b) => b.ele > a.ele ? b : a);
    (low.d <= high.d ? [low, high] : [high, low]).forEach(sample => { if (sample !== result[result.length - 1]) result.push(sample); });
  }
  result.push(all[all.length - 1]);
  return result;
}
const km = (metres: number) => (metres / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const HEIGHT = 100;

export default function ElevationProfile({ route, onHover, onRecalculate }: { route: Route | null; onHover: (point: [number, number] | null) => void; onRecalculate: () => void }) {
  const samples = useMemo(() => route ? buildProfile(route) : null, [route]);
  const [index, setIndex] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  if (!route) return <div className="elevation-profile empty"><span>Le profil d’altitude apparaîtra dès que le parcours sera calculé.</span></div>;
  if (!samples) return <div className="elevation-profile empty"><span>Profil d’altitude indisponible pour ce tracé.</span><button onClick={onRecalculate}>Recalculer le tracé</button></div>;
  const total = samples[samples.length - 1].d || 1;
  const lows = Math.min(...samples.map(s => s.ele)), highs = Math.max(...samples.map(s => s.ele));
  const floor = Math.floor(lows / 10) * 10, top = Math.max(floor + 20, Math.ceil(highs / 10) * 10);
  const x = (d: number) => d / total * 1000, y = (e: number) => HEIGHT - 6 - (e - floor) / (top - floor) * (HEIGHT - 14);
  const line = samples.map((s, i) => `${i ? 'L' : 'M'}${x(s.d).toFixed(1)},${y(s.ele).toFixed(1)}`).join('');
  const area = `${line}L1000,${HEIGHT}L0,${HEIGHT}Z`;
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const rect = box.current!.getBoundingClientRect();
    const target = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * total;
    let low = 0, high = samples.length - 1;
    while (high - low > 1) { const mid = (low + high) >> 1; if (samples[mid].d < target) low = mid; else high = mid; }
    const nearest = target - samples[low].d <= samples[high].d - target ? low : high;
    setIndex(nearest); onHover(samples[nearest].at);
  };
  const leave = () => { setIndex(null); onHover(null); };
  const current = index !== null ? samples[Math.min(index, samples.length - 1)] : null;
  let slope: number | null = null;
  if (current) {
    const i = samples.indexOf(current);
    const a = samples[Math.max(0, i - 3)], b = samples[Math.min(samples.length - 1, i + 3)];
    if (b.d - a.d > 20) slope = (b.ele - a.ele) / (b.d - a.d) * 100;
  }
  return <div className="elevation-profile" aria-label="Profil d’altitude du parcours">
    <div className="profile-scale"><span>{top} m</span><span>{floor} m</span></div>
    <div className="profile-plot" ref={box} onPointerMove={move} onPointerDown={move} onPointerLeave={leave} onPointerCancel={leave}>
      <svg viewBox={`0 0 1000 ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label="Courbe d’altitude">
        <path d={area} className="profile-area"/><path d={line} className="profile-line" vectorEffect="non-scaling-stroke"/>
      </svg>
      {current && <><div className="profile-cursor" style={{ left: `${current.d / total * 100}%` }}/><div className="profile-dot" style={{ left: `${current.d / total * 100}%`, top: `${y(current.ele) / HEIGHT * 100}%` }}/><div className={`profile-tip${current.d / total > 0.7 ? ' left' : ''}`} style={{ left: `${current.d / total * 100}%` }}><strong>{Math.round(current.ele)} m</strong> · km {km(current.d)}{slope !== null && <> · {slope > 0 ? '+' : ''}{slope.toFixed(1).replace('.', ',')} %</>}</div></>}
    </div>
    <div className="profile-axis"><span>0 km</span><span>{km(total)} km</span></div>
  </div>;
}
