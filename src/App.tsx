import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Mountain, ArrowUpRight, Footprints, Bike, Download, Plus, X, Undo2, Trash2, LocateFixed, Expand, MapPin, Route as RouteIcon, ChevronDown, ArrowDown, LoaderCircle, Check, Info } from 'lucide-react';
import { calculateRoute, createGpx, type Activity, type Point, type Route } from './routing';
const makePoint = (lat: number, lng: number): Point => ({ id: crypto.randomUUID(), lat, lng });
function MapActions({ points, add, fit, locate, onError }: { points: Point[]; add: (lat: number, lng: number) => void; fit: number; locate: number; onError: (message: string) => void }) {
  const map = useMapEvents({ click: e => add(e.latlng.lat, e.latlng.lng) });
  useEffect(() => { if (fit && points.length) map.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lng])), { padding: [65, 65], maxZoom: 15 }); }, [fit]);
  useEffect(() => { if (!locate) return; map.locate({ setView: true, maxZoom: 14 }); const error = () => onError('Localisation indisponible. Autorisez-la dans votre navigateur ou déplacez la carte.'); map.on('locationerror', error); return () => { map.off('locationerror', error); map.stopLocate(); }; }, [locate]);
  useEffect(() => { const observer = new ResizeObserver(() => map.invalidateSize()); observer.observe(map.getContainer()); return () => observer.disconnect(); }, [map]);
  return null;
}
function ZoomButtons() { const map = useMap(); return <div className="zoom-buttons"><button aria-label="Zoom avant" onClick={() => map.zoomIn()}>+</button><button aria-label="Zoom arrière" onClick={() => map.zoomOut()}>−</button></div>; }
export default function App() {
  const [points, setPoints] = useState<Point[]>([]);
  const [activity, setActivity] = useState<Activity>('foot');
  const [name, setName] = useState('Mon prochain grand air');
  const [result, setResult] = useState<{ key: string; route: Route } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [fit, setFit] = useState(0);
  const [locate, setLocate] = useState(0);
  const [insertAfter, setInsertAfter] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [exported, setExported] = useState(false);
  const history = useRef<Point[][]>([]);
  const key = JSON.stringify([activity, points]);
  const route = result?.key === key ? result.route : null;
  const change = (next: Point[]) => { history.current.push(points); setPoints(next); setError(''); setExported(false); };
  const add = (lat: number, lng: number) => {
    if (points.length >= 50) { setError('Limite de 50 points atteinte pour ce parcours.'); return; }
    const next = [...points]; const index = insertAfter ? next.findIndex(p => p.id === insertAfter) + 1 : next.length;
    next.splice(index, 0, makePoint(lat, lng)); change(next); setInsertAfter(null);
  };
  const addCheckpoint = (afterIndex: number, lat: number, lng: number) => {
    if (points.length >= 50) { setError('Limite de 50 points atteinte pour ce parcours.'); return; }
    const next = [...points];
    next.splice(afterIndex + 1, 0, makePoint(lat, lng));
    change(next);
    setInsertAfter(null);
  };
  useEffect(() => {
    setResult(null); setError(''); setExported(false);
    if (points.length < 2) { setBusy(false); return; }
    setBusy(true);
    const controller = new AbortController(); let active = true; let timeout: ReturnType<typeof setTimeout>;
    const timer = setTimeout(() => {
      timeout = setTimeout(() => { if (active) { setError('Le calcul prend trop de temps. Réessayez.'); setBusy(false); controller.abort(); } }, 20000);
      calculateRoute(points, activity, controller.signal).then(route => { if (active) setResult({ key, route }); }).catch(e => { if (active && !controller.signal.aborted) setError(e instanceof Error ? e.message : 'Impossible de calculer le parcours.'); }).finally(() => { clearTimeout(timeout); if (active) setBusy(false); });
    }, 400);
    return () => { active = false; clearTimeout(timer); clearTimeout(timeout); controller.abort(); };
  }, [key, retry]);
  const exportRoute = () => {
    if (!route) return;
    const url = URL.createObjectURL(new Blob([createGpx(route, name || 'Mon itinéraire')], { type: 'application/gpx+xml' }));
    const link = document.createElement('a'); link.href = url; link.download = `${name.replace(/[^a-zA-Z0-9à-ÿ_-]+/g, '-').slice(0, 70) || 'openworld'}.gpx`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setExported(true);
  };
  return <div className="app">
    <header><a className="brand" href="./"><span className="brand-symbol"><Mountain size={25}/></span>openworld<span className="brand-dot">.</span></a><nav><span className="nav-active">Créer un itinéraire</span><button onClick={() => setHelp(true)}>Comment ça marche <ArrowUpRight size={15}/></button></nav><span className="header-note"><span/> L’aventure commence ici</span></header>
    <main>
      <aside className="sidebar">
        <div className="intro"><span className="eyebrow">LE DEHORS VOUS ATTEND</span><h1>Un chemin.<br/>Mille possibilités.</h1><p>Tracez votre parcours, prenez l’air.<br/>Le reste vous appartient.</p></div>
        <section className="planner"><div className="section-label"><span>VOTRE ITINÉRAIRE</span><span className="draft">Brouillon</span></div><label className="name-label" htmlFor="route-name">Nom du parcours</label><input id="route-name" className="route-name" value={name} maxLength={100} onChange={e => setName(e.target.value)}/>
          <div className="activity-label">À chacun son rythme</div><div className="activities"><button className={activity === 'foot' ? 'selected' : ''} aria-pressed={activity === 'foot'} onClick={() => setActivity('foot')}><Footprints size={19}/> À pied {activity === 'foot' && <Check size={14}/>}</button><button className={activity === 'bike' ? 'selected' : ''} aria-pressed={activity === 'bike'} onClick={() => setActivity('bike')}><Bike size={20}/> À vélo {activity === 'bike' && <Check size={14}/>}</button></div>
          <div className="points-heading"><h2>Points de passage <span>{points.length.toString().padStart(2, '0')}</span></h2><button className="icon-button" disabled={!history.current.length} aria-label="Annuler la dernière modification" title="Annuler" onClick={() => { const previous = history.current.pop(); if (previous) { setPoints(previous); setInsertAfter(null); } }}><Undo2 size={17}/></button></div>
          {points.length === 0 ? <div className="empty-points"><div className="point-line"><span className="point-circle start"/><div><strong>Votre point de départ</strong><small>Cliquez sur la carte pour commencer</small></div></div><div className="point-line muted"><span className="point-circle"/><div><strong>Et ensuite, où allez-vous ?</strong><small>Ajoutez votre prochaine étape</small></div></div></div> : <ol className="point-list">{points.map((p, i) => <li key={p.id}><span className={`number ${i === 0 ? 'start' : ''}`}>{i + 1}</span><div><strong>{i === 0 ? 'Départ' : i === points.length - 1 ? 'Arrivée' : `Checkpoint ${i}`}</strong><small>{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</small></div><button className="icon-button" title="Insérer un point après" aria-label={`Insérer après le point ${i + 1}`} onClick={() => setInsertAfter(p.id)}><Plus size={16}/></button><button className="icon-button" aria-label={`Supprimer le point ${i + 1}`} onClick={() => { change(points.filter(x => x.id !== p.id)); setInsertAfter(null); }}><X size={16}/></button></li>)}</ol>}
          <div className="point-tip"><MapPin size={15}/><span>{insertAfter ? 'Cliquez sur la carte pour insérer un checkpoint.' : route ? 'Cliquez directement sur le tracé pour ajouter un checkpoint.' : 'Cliquez sur la carte pour ajouter un point.'}</span>{insertAfter && <button className="icon-button" aria-label="Annuler l’insertion" onClick={() => setInsertAfter(null)}><X size={14}/></button>}</div>
          {points.length > 0 && <button className="clear-button" onClick={() => { change([]); setInsertAfter(null); }}><Trash2 size={13}/> Effacer le parcours</button>}
        </section>
        <div className="summary"><div className="distance-top"><span><RouteIcon size={16}/> Distance totale</span><span className="live-badge">{busy ? 'Calcul…' : route ? 'Calculée' : 'À vous de jouer'}</span></div><div className="distance">{route ? (route.distance / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'} <span>km</span></div><div className="summary-caption">{route ? 'Un parcours qui suit les routes et les chemins.' : 'Votre prochaine aventure prend forme ici.'}</div><button className="export-button" disabled={!route || busy} onClick={exportRoute}>{busy ? <LoaderCircle size={18} className="spin"/> : exported ? <Check size={18}/> : <Download size={18}/>} {exported ? 'GPX téléchargé' : 'Exporter le parcours'}<span>.gpx</span></button><p className="export-note">Emportez votre trace sur votre GPS ou votre app.</p></div>
        <footer><Mountain size={15}/> Moins d’écran. Plus de grand air.</footer>
      </aside>
      <section className="map-panel" aria-label="Carte de création d’itinéraire">
        <MapContainer center={[45.899, 6.129]} zoom={13} zoomControl={false} doubleClickZoom={false} className="map"><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"/><MapActions points={points} add={add} fit={fit} locate={locate} onError={setError}/><ZoomButtons/>{route && route.legs.map((leg, legIndex) => <Polyline key={`leg-${legIndex}`} positions={leg} bubblingMouseEvents={false} pathOptions={{ color: '#207256', weight: 16, opacity: 0.01, className: 'route-hit-area' }} eventHandlers={{ click: e => addCheckpoint(legIndex, e.latlng.lat, e.latlng.lng) }} />)}{route && <Polyline positions={route.coordinates} interactive={false} pathOptions={{ color: '#207256', weight: 5, opacity: 0.9 }}/ >}{points.map((p, i) => <Marker key={p.id} position={[p.lat, p.lng]} draggable icon={L.divIcon({ className: 'waypoint', html: `<span>${i + 1}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] })} eventHandlers={{ dragend: e => { const position = e.target.getLatLng(); change(points.map(x => x.id === p.id ? { ...x, lat: position.lat, lng: position.lng } : x)); } }}><Popup><strong>{i === 0 ? 'Départ' : i === points.length - 1 ? 'Arrivée' : `Checkpoint ${i}`}</strong><p>Déplacez ce point pour forcer le parcours à passer par ici.</p><button onClick={() => change(points.filter(x => x.id !== p.id))}>Supprimer ce point</button></Popup></Marker>)}</MapContainer>
        <div className="map-heading"><span className="map-heading-icon"><Mountain size={20}/></span><div><strong>Le monde est votre terrain de jeu</strong><small>Explorez. Tracez. Partez.</small></div></div>
        <div className="map-tools"><button aria-label="Afficher tout le parcours" title="Afficher le parcours" disabled={!points.length} onClick={() => setFit(x => x + 1)}><Expand size={19}/></button><button aria-label="Me localiser" title="Me localiser" onClick={() => setLocate(x => x + 1)}><LocateFixed size={20}/></button></div>
        <div className="map-instruction"><span className="instruction-icon"><Plus size={18}/></span><span>{points.length === 0 ? 'Tout commence par un premier point.' : insertAfter ? 'Choisissez la position de votre nouveau checkpoint.' : route ? 'Cliquez sur le tracé pour ajouter un checkpoint.' : 'Ajoutez un point ou déplacez vos étapes.'}<small>{points.length === 0 ? 'Cliquez où votre aventure commence' : route ? 'Déplacez-le pour imposer le chemin souhaité' : 'Le parcours s’adapte automatiquement'}</small></span>{points.length === 0 && <ArrowDown size={17}/>}</div>
        <span className="map-layer"><span className="layer-preview"/> OpenStreetMap <ChevronDown size={12}/></span>
        {(busy || error) && <div className={`route-status ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{busy && !error ? <><LoaderCircle className="spin" size={17}/> Recherche du meilleur chemin…</> : <><Info size={18}/><span>{error}</span>{points.length >= 2 && <button onClick={() => setRetry(x => x + 1)}>Réessayer</button>}</>}</div>}
      </section>
    </main>
    {help && <div className="modal-backdrop" onClick={() => setHelp(false)}><div className="help-modal" role="dialog" aria-modal="true" aria-label="Comment ça marche" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setHelp(false); }}><button autoFocus className="modal-close icon-button" aria-label="Fermer l’aide" onClick={() => setHelp(false)}><X/></button><span className="eyebrow">DU PREMIER POINT AU GRAND AIR</span><h2>Votre aventure en 3 étapes.</h2><p><b>01 · Tracez.</b> Choisissez votre activité et cliquez sur la carte pour placer le départ, les étapes et l’arrivée.</p><p><b>02 · Ajustez.</b> Cliquez directement sur la ligne verte pour créer un checkpoint, puis faites-le glisser afin d’imposer la route ou le chemin souhaité. Le bouton + d’un point permet aussi d’en insérer un après celui-ci ; × le supprime.</p><p><b>03 · Partez.</b> Exportez le GPX pour l’ouvrir dans votre GPS ou votre application sportive.</p><div className="help-note">Le calcul repose sur les données OpenStreetMap. Vérifiez l’accès et les conditions sur le terrain. Vos parcours restent dans cet onglet et sont perdus à son rechargement.</div></div></div>}
  </div>;
}
