import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { hasElevation, type Route } from './routing';

type Sample = { d: number; ele: number; at: [number, number] };
const RAD = Math.PI / 180;
function haversine(a: [number, number], b: [number, number]): number {
  const dLat = (b[0] - a[0]) * RAD, dLon = (b[1] - a[1]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLon / 2) ** 2;
  return 12_742_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** Courbe altitude/distance : distances cumulées calées sur la distance annoncée, trous d'altitude comblés, allégée en gardant les sommets et les creux. */
function buildFull(route: Route): Sample[] | null {
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
  return all;
}
function downsample(all: Sample[], maxSamples = 700): Sample[] {
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
export function buildProfile(route: Route, maxSamples = 700): Sample[] | null {
  const all = buildFull(route);
  return all ? downsample(all, maxSamples) : null;
}
/** Dénivelés positif et négatif cumulés sur un tronçon, en ignorant les variations inférieures à `threshold` mètres (bruit des relevés). */
export function climb(samples: Sample[], threshold = 2): { up: number; down: number } {
  let up = 0, down = 0, reference = samples[0]?.ele ?? 0;
  for (const { ele } of samples) {
    if (ele - reference >= threshold) { up += ele - reference; reference = ele; }
    else if (reference - ele >= threshold) { down += reference - ele; reference = ele; }
  }
  return { up, down };
}
const km = (metres: number) => (metres / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const HEIGHT = 100;

export default function ElevationProfile({ route, onHover, onSelect, onRecalculate }: { route: Route | null; onHover: (point: [number, number] | null) => void; onSelect: (path: [number, number][] | null) => void; onRecalculate: () => void }) {
  const full = useMemo(() => route ? buildFull(route) : null, [route]);
  const samples = useMemo(() => full ? downsample(full) : null, [full]);
  const [index, setIndex] = useState<number | null>(null);
  const [selection, setSelection] = useState<[number, number] | null>(null);
  const drag = useRef<{ from: number; moved: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // Facteur qui aligne le dénivelé de la sélection sur le dénivelé total annoncé (calcul du service, plus fin que les relevés bruts).
  const calibration = useMemo(() => {
    if (!full || !route?.legAscents || !route.legAscents.every((v): v is number => v != null)) return 1;
    const official = route.legAscents.reduce((a, b) => a + b, 0), mine = climb(full).up;
    return official > 0 && mine > 50 ? official / mine : 1;
  }, [full, route]);
  useEffect(() => { setSelection(null); onSelect(null); }, [route]);
  if (!route) return <div className="elevation-profile empty"><span>Le profil d’altitude apparaîtra dès que le parcours sera calculé.</span></div>;
  if (!samples || !full) return <div className="elevation-profile empty"><span>Profil d’altitude indisponible pour ce tracé.</span><button onClick={onRecalculate}>Recalculer le tracé</button></div>;
  const total = samples[samples.length - 1].d || 1;
  const lows = Math.min(...samples.map(s => s.ele)), highs = Math.max(...samples.map(s => s.ele));
  const floor = Math.floor(lows / 10) * 10, top = Math.max(floor + 20, Math.ceil(highs / 10) * 10);
  const x = (d: number) => d / total * 1000, y = (e: number) => HEIGHT - 6 - (e - floor) / (top - floor) * (HEIGHT - 14);
  const line = samples.map((s, i) => `${i ? 'L' : 'M'}${x(s.d).toFixed(1)},${y(s.ele).toFixed(1)}`).join('');
  const area = `${line}L1000,${HEIGHT}L0,${HEIGHT}Z`;
  const distanceAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = box.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * total;
  };
  const indexAt = (list: Sample[], target: number) => {
    let low = 0, high = list.length - 1;
    while (high - low > 1) { const mid = (low + high) >> 1; if (list[mid].d < target) low = mid; else high = mid; }
    return target - list[low].d <= list[high].d - target ? low : high;
  };
  const publish = (a: number, b: number) => {
    const first = indexAt(full, a), last = indexAt(full, b), step = Math.max(1, Math.ceil((last - first) / 2000));
    const path: [number, number][] = [];
    for (let i = first; i < last; i += step) path.push(full[i].at);
    path.push(full[last].at);
    onSelect(path);
  };
  const down = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { from: distanceAt(event), moved: false };
    move(event);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const target = distanceAt(event);
    const dragging = drag.current;
    if (dragging && (dragging.moved || Math.abs(target - dragging.from) > total * 0.008)) {
      dragging.moved = true;
      const range: [number, number] = [Math.min(dragging.from, target), Math.max(dragging.from, target)];
      setSelection(range); publish(range[0], range[1]);
    }
    const nearest = indexAt(samples, target);
    setIndex(nearest); onHover(samples[nearest].at);
  };
  const up = () => {
    const dragging = drag.current; drag.current = null;
    if (dragging && !dragging.moved) { setSelection(null); onSelect(null); }
  };
  const leave = () => { if (drag.current) return; setIndex(null); onHover(null); };
  const clear = () => { setSelection(null); onSelect(null); };
  const current = index !== null ? samples[Math.min(index, samples.length - 1)] : null;
  let slope: number | null = null;
  if (current) {
    const i = samples.indexOf(current);
    const a = samples[Math.max(0, i - 3)], b = samples[Math.min(samples.length - 1, i + 3)];
    if (b.d - a.d > 20) slope = (b.ele - a.ele) / (b.d - a.d) * 100;
  }
  let stats: { distance: number; up: number; down: number } | null = null;
  if (selection) {
    const first = indexAt(full, selection[0]), last = Math.max(first + 1, indexAt(full, selection[1]));
    const part = climb(full.slice(first, last + 1));
    stats = { distance: selection[1] - selection[0], up: Math.round(part.up * calibration), down: Math.round(part.down * calibration) };
  }
  return <div className="elevation-profile" aria-label="Profil d’altitude du parcours">
    <div className="profile-scale"><span>{top} m</span><span>{floor} m</span></div>
    <div className="profile-plot" ref={box} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; leave(); }} onPointerLeave={leave}>
      <svg viewBox={`0 0 1000 ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label="Courbe d’altitude">
        <path d={area} className="profile-area"/><path d={line} className="profile-line" vectorEffect="non-scaling-stroke"/>
      </svg>
      {selection && <div className="profile-selection" style={{ left: `${selection[0] / total * 100}%`, width: `${(selection[1] - selection[0]) / total * 100}%` }}/>}
      {current && <><div className="profile-cursor" style={{ left: `${current.d / total * 100}%` }}/><div className="profile-dot" style={{ left: `${current.d / total * 100}%`, top: `${y(current.ele) / HEIGHT * 100}%` }}/><div className={`profile-tip${current.d / total > 0.7 ? ' left' : ''}`} style={{ left: `${current.d / total * 100}%` }}><strong>{Math.round(current.ele)} m</strong> · km {km(current.d)}{slope !== null && <> · {slope > 0 ? '+' : ''}{slope.toFixed(1).replace('.', ',')} %</>}</div></>}
      {stats && <div className="profile-stats" onPointerDown={event => event.stopPropagation()}><span><b>{km(stats.distance)}</b> km</span><span className="up">▲ +{stats.up.toLocaleString('fr-FR')} m</span><span className="down">▼ −{stats.down.toLocaleString('fr-FR')} m</span><button aria-label="Effacer la sélection" onClick={clear}>×</button></div>}
    </div>
    <div className="profile-axis"><span>0 km</span><span>{selection ? 'Glissez pour modifier · cliquez pour effacer' : 'Glissez pour sélectionner un tronçon'}</span><span>{km(total)} km</span></div>
  </div>;
}
