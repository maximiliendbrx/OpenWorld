import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Mountain, ArrowUpRight, Download, Upload, Plus, X, Undo2, Redo2, RotateCcw, Trash2, LocateFixed, Expand, MapPin, ChevronDown, ArrowDown, LoaderCircle, Check, Info, PersonStanding, Save, FolderOpen } from 'lucide-react';
import { calculateRoute, createGpx, type Activity, type Point, type Route } from './routing';
import { calculateAscent } from './elevation';
import { importGpx } from './gpx';
import { readDraft, readSaved, writeDraft, writeSaved, type CachedRoute, type SavedRoute, type Snapshot } from './storage';
const makePoint = (lat: number, lng: number): Point => ({ id: crypto.randomUUID(), lat, lng });
function MapActions({ points, add, fit, locate, onError, initialPosition, streetView, onStreetView }: { points: Point[]; add: (lat: number, lng: number) => void; fit: number; locate: number; onError: (message: string) => void; initialPosition: [number, number] | null; streetView: boolean; onStreetView: (lat: number, lng: number) => void }) {
  const map = useMapEvents({ click: e => streetView ? onStreetView(e.latlng.lat, e.latlng.lng) : add(e.latlng.lat, e.latlng.lng) });
  useEffect(() => { if (fit && points.length) map.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lng])), { padding: [65, 65], maxZoom: 15 }); }, [fit]);
  useEffect(() => { if (initialPosition) map.setView(initialPosition, 14); }, [map, initialPosition]);
  useEffect(() => { if (!locate) return; map.locate({ setView: true, maxZoom: 14 }); const error = () => onError('Localisation indisponible. Autorisez-la dans votre navigateur ou déplacez la carte.'); map.on('locationerror', error); return () => { map.off('locationerror', error); map.stopLocate(); }; }, [locate]);
  useEffect(() => { const observer = new ResizeObserver(() => map.invalidateSize()); observer.observe(map.getContainer()); return () => observer.disconnect(); }, [map]);
  return null;
}
function ZoomButtons() {
  const map = useMap();
  const controls = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (controls.current) {
      L.DomEvent.disableClickPropagation(controls.current);
      L.DomEvent.disableScrollPropagation(controls.current);
    }
  }, []);
  return <div className="zoom-buttons" ref={controls}><button aria-label="Zoom avant" onClick={() => map.zoomIn()}>+</button><button aria-label="Zoom arrière" onClick={() => map.zoomOut()}>−</button></div>;
}
export default function App() {
  const [initialDraft] = useState(() => { try { return readDraft(window.localStorage); } catch { return null; } });
  const [allPoints, setPoints] = useState<Point[]>(initialDraft?.points ?? []);
  const [boundaries, setBoundaries] = useState<string[]>(initialDraft?.boundaries ?? []);
  const [selectedStage, setSelectedStage] = useState<number | null>(null);
  const [activity, setActivity] = useState<Activity>(initialDraft?.activity ?? 'road');
  const [name, setName] = useState(initialDraft?.name ?? 'Mon prochain grand air');
  const [savedId, setSavedId] = useState<string | null>(initialDraft?.savedId ?? null);
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>(() => { try { return readSaved(window.localStorage); } catch { return []; } });
  const [savedOpen, setSavedOpen] = useState(false);
  const [storageMessage, setStorageMessage] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [result, setResult] = useState<{ key: string; route: Route } | null>(null);
  const [elevation, setElevation] = useState<{ route: Route; ascent: number | null; failed: boolean } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [fit, setFit] = useState(initialDraft?.points.length ? 1 : 0);
  const [locate, setLocate] = useState(0);
  const [insertAfter, setInsertAfter] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [streetView, setStreetView] = useState(false);
  const [exported, setExported] = useState(false);
  const [initialPosition, setInitialPosition] = useState<[number, number] | null>(null);
  const userStarted = useRef(Boolean(initialDraft?.points.length));
  const history = useRef<{ points: Point[]; boundaries: string[]; cached: CachedRoute | null }[]>([]);
  const redoHistory = useRef<{ points: Point[]; boundaries: string[]; cached: CachedRoute | null }[]>([]);
  const cachedRoute = useRef<CachedRoute | null>(initialDraft?.cached ?? null);
  const fileInput = useRef<HTMLInputElement>(null);
  const boundaryIndices = boundaries.map(id => allPoints.findIndex(p => p.id === id));
  const start = selectedStage === null || selectedStage === 0 ? 0 : boundaryIndices[selectedStage - 1];
  const end = selectedStage === null || selectedStage === boundaries.length ? allPoints.length - 1 : boundaryIndices[selectedStage];
  const points = selectedStage === null ? allPoints : allPoints.slice(start, end + 1);
  const key = JSON.stringify([activity, allPoints]);
  const snapshot: Snapshot = { version: 1, name, activity, points: allPoints, boundaries, cached: cachedRoute.current?.activity === activity ? cachedRoute.current : null, savedId };
  const latestSnapshot = useRef(snapshot);
  latestSnapshot.current = snapshot;
  useEffect(() => {
    if (!allPoints.length && !userStarted.current) return;
    try { writeDraft(window.localStorage, latestSnapshot.current); setStorageMessage(''); }
    catch { setStorageMessage('Brouillon non enregistré : stockage du navigateur indisponible ou plein.'); }
  }, [name, activity, allPoints, boundaries, savedId, result]);
  useEffect(() => {
    const flush = () => { if (!latestSnapshot.current.points.length && !userStarted.current) return; try { writeDraft(window.localStorage, latestSnapshot.current); } catch { /* The visible warning is set during editing. */ } };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);
  const saveRoute = (copy = false) => {
    if (!allPoints.length) return;
    const id = copy || !savedId ? crypto.randomUUID() : savedId;
    const entry: SavedRoute = { id, updatedAt: new Date().toISOString(), snapshot: { ...snapshot, savedId: id } };
    const next = [entry, ...savedRoutes.filter(route => route.id !== id)];
    try { writeSaved(window.localStorage, next); setSavedRoutes(next); setSavedId(id); setSavedMessage('Parcours enregistré sur cet appareil.'); }
    catch { setSavedMessage('Enregistrement impossible : stockage du navigateur indisponible ou plein.'); }
  };
  const openSaved = (entry: SavedRoute) => {
    if (allPoints.length && !window.confirm('Ouvrir ce parcours remplacera le brouillon actuel. Continuer ?')) return;
    const s = entry.snapshot;
    cachedRoute.current = s.cached; history.current = []; redoHistory.current = []; userStarted.current = true;
    setPoints(s.points); setBoundaries(s.boundaries); setActivity(s.activity); setName(s.name); setSavedId(entry.id); setSelectedStage(null); setInsertAfter(null); setSavedOpen(false); setError(''); setFit(x => x + 1); setSavedMessage('');
  };
  const deleteSaved = (entry: SavedRoute) => {
    if (!window.confirm(`Supprimer la sauvegarde « ${entry.snapshot.name || 'Sans nom'} » ?`)) return;
    const next = savedRoutes.filter(route => route.id !== entry.id);
    try { writeSaved(window.localStorage, next); setSavedRoutes(next); if (savedId === entry.id) setSavedId(null); setSavedMessage(''); }
    catch { setSavedMessage('Suppression impossible : stockage du navigateur indisponible.'); }
  };
  const fullRoute = result?.key === key ? result.route : null;
  const route = useMemo(() => {
    if (!fullRoute || selectedStage === null) return fullRoute;
    const legs = fullRoute.legs.slice(start, end);
    if (!legs.length) return null;
    const legElevations = fullRoute.legElevations?.slice(start, end);
    return { legs, coordinates: legs.flatMap((leg, index) => index ? leg.slice(1) : leg), distance: fullRoute.legDistances?.slice(start, end).reduce((a, b) => a + b, 0) ?? 0, legAscents: fullRoute.legAscents?.slice(start, end), elevations: legElevations?.flatMap((leg, index) => index ? leg.slice(1) : leg) };
  }, [fullRoute, selectedStage, start, end]);
  useEffect(() => {
    if (!route) return;
    if (route.legAscents?.length === route.legs.length && route.legAscents.every((value): value is number => value !== null && Number.isFinite(value) && value >= 0)) {
      setElevation({ route, ascent: Math.round(route.legAscents.reduce((sum, value) => sum + value, 0)), failed: false });
      return;
    }
    const controller = new AbortController();
    setElevation({ route, ascent: null, failed: false });
    calculateAscent(route.coordinates, route.distance, controller.signal)
      .then(ascent => { if (!controller.signal.aborted) setElevation({ route, ascent, failed: false }); })
      .catch(() => { if (!controller.signal.aborted) setElevation({ route, ascent: null, failed: true }); });
    return () => controller.abort();
  }, [route]);
  const historyEntry = () => ({ points: allPoints, boundaries, cached: cachedRoute.current?.key === key ? cachedRoute.current : null });
  const recordChange = () => { history.current.push(historyEntry()); redoHistory.current = []; };
  const restoreHistory = (source: typeof history.current, destination: typeof history.current) => {
    const entry = source.pop();
    if (!entry) return;
    destination.push(historyEntry());
    cachedRoute.current = entry.cached;
    userStarted.current = true;
    setPoints(entry.points); setBoundaries(entry.boundaries); setSelectedStage(null); setInsertAfter(null); setError('');
  };
  const undo = () => restoreHistory(history.current, redoHistory.current);
  const redo = () => restoreHistory(redoHistory.current, history.current);
  const change = (next: Point[]) => {
    let updated = selectedStage === null ? next : [...allPoints.slice(0, start), ...next, ...allPoints.slice(end + 1)];
    if (boundaries.some(id => !updated.some(point => point.id === id))) { setError('Ce point relie deux étapes : déplacez-le sans le supprimer.'); return; }
    const last = updated[updated.length - 1];
    const oldLast = allPoints[allPoints.length - 1];
    if (updated.length === 1 && last?.closesLoop) updated = [{ id: last.id, lat: last.lat, lng: last.lng }];
    if (updated.length > 1 && last?.closesLoop && oldLast?.id === last.id) {
      const first = updated[0];
      const oldFirst = allPoints[0];
      const firstChanged = first.id !== oldFirst.id || first.lat !== oldFirst.lat || first.lng !== oldFirst.lng;
      const lastChanged = last.lat !== oldLast.lat || last.lng !== oldLast.lng;
      updated = [...updated];
      if (firstChanged) updated[updated.length - 1] = { ...last, lat: first.lat, lng: first.lng };
      else if (lastChanged) updated[0] = { ...first, lat: last.lat, lng: last.lng };
    }
    userStarted.current = true; recordChange(); setPoints(updated); setError(''); setExported(false);
  };
  const finishLoop = () => {
    if (allPoints.length < 2) return;
    const first = allPoints[0], last = allPoints[allPoints.length - 1];
    if (first.lat === last.lat && first.lng === last.lng) return;
    if (allPoints.length >= 50) { setError('Limite de 50 points atteinte pour ce parcours.'); return; }
    recordChange(); userStarted.current = true;
    setPoints([...allPoints, { ...makePoint(first.lat, first.lng), closesLoop: true }]);
    setSelectedStage(null); setInsertAfter(null); setError(''); setExported(false);
  };
  const addStage = () => {
    const lastStart = boundaries.length ? boundaryIndices[boundaries.length - 1] : 0;
    if (allPoints.length - lastStart < 2) { setError('Ajoutez au moins deux points à la dernière étape avant de créer la suivante.'); return; }
    recordChange();
    setBoundaries([...boundaries, allPoints[allPoints.length - 1].id]);
    setSelectedStage(boundaries.length + 1);
    setInsertAfter(null);
  };
  useEffect(() => {
    let active = true;
    if (!navigator.geolocation) { setError('Localisation indisponible. Cliquez sur la carte pour choisir votre départ.'); return; }
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (!active || userStarted.current) return;
      const position: [number, number] = [coords.latitude, coords.longitude];
      setInitialPosition(position);
    }, () => {
      if (active && !userStarted.current) setError('Localisation indisponible ou refusée. Cliquez sur la carte pour choisir votre départ.');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
    return () => { active = false; };
  }, []);
  const add = (lat: number, lng: number) => {
    if (allPoints.length >= 50) { setError('Limite de 50 points atteinte pour ce parcours.'); return; }
    const next = [...points]; const index = insertAfter ? next.findIndex(p => p.id === insertAfter) + 1 : selectedStage !== null && selectedStage < boundaries.length ? next.length - 1 : next.length;
    next.splice(index, 0, makePoint(lat, lng)); change(next); setInsertAfter(null);
  };
  const addCheckpoint = (afterIndex: number, lat: number, lng: number) => {
    if (streetView) { openStreetView(lat, lng); return; }
    if (allPoints.length >= 50) { setError('Limite de 50 points atteinte pour ce parcours.'); return; }
    const next = [...points];
    next.splice(afterIndex + 1, 0, makePoint(lat, lng));
    change(next);
    setInsertAfter(null);
  };
  const openStreetView = (lat: number, lng: number) => {
    window.open(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`, '_blank', 'noopener,noreferrer');
    setStreetView(false);
  };
  useEffect(() => {
    setResult(null); setError(''); setExported(false);
    if (allPoints.length < 2) { setBusy(false); return; }
    if (cachedRoute.current?.key === key) { setResult({ key, route: cachedRoute.current.route }); setBusy(false); return; }
    setBusy(true);
    const controller = new AbortController(); let active = true; let timeout: ReturnType<typeof setTimeout>;
    const timer = setTimeout(() => {
      timeout = setTimeout(() => { if (active) { setError('Le calcul prend trop de temps. Réessayez.'); setBusy(false); controller.abort(); } }, 20000);
      const previous = cachedRoute.current?.activity === activity ? cachedRoute.current : undefined;
      calculateRoute(allPoints, activity, controller.signal, previous).then(route => { if (active) { cachedRoute.current = { key, activity, points: allPoints, route }; setResult({ key, route }); } }).catch(e => { if (active && !controller.signal.aborted) setError(e instanceof Error ? e.message : 'Impossible de calculer le parcours.'); }).finally(() => { clearTimeout(timeout); if (active) setBusy(false); });
    }, 400);
    return () => { active = false; clearTimeout(timer); clearTimeout(timeout); controller.abort(); };
  }, [key, retry]);
  const loadGpx = async (file: File) => {
    if (allPoints.length && !window.confirm('Importer ce GPX remplacera le parcours affiché. Continuer ?')) return;
    if (file.size > 10 * 1024 * 1024) { setError('Le fichier GPX dépasse la limite de 10 Mo.'); return; }
    try {
      const imported = importGpx(await file.text(), file.name.replace(/\.gpx$/i, '') || 'Parcours importé');
      const importedKey = JSON.stringify([activity, imported.points]);
      recordChange();
      userStarted.current = true;
      cachedRoute.current = { key: importedKey, activity, points: imported.points, route: imported.route };
      setPoints(imported.points); setBoundaries([]); setSelectedStage(null); setInsertAfter(null); setName(imported.name); setSavedId(null); setSavedMessage(''); setResult({ key: importedKey, route: imported.route }); setError(''); setBusy(false); setFit(x => x + 1);
    } catch (e) { setError(e instanceof Error ? e.message : 'Impossible de lire ce fichier GPX.'); }
  };
  const exportRoute = () => {
    if (!route) return;
    const url = URL.createObjectURL(new Blob([createGpx(route, name || 'Mon itinéraire')], { type: 'application/gpx+xml' }));
    const link = document.createElement('a'); link.href = url; link.download = `${name.replace(/[^a-zA-Z0-9à-ÿ_-]+/g, '-').slice(0, 70) || 'openworld'}.gpx`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setExported(true);
  };
  return <div className="app">
    <header><a className="brand" href="./"><span className="brand-symbol"><Mountain size={25}/></span>openworld<span className="brand-dot">.</span></a><nav><span className="nav-active">Créer un itinéraire</span><button onClick={() => setHelp(true)}>Comment ça marche <ArrowUpRight size={15}/></button></nav><span className="header-note"><span/> L’aventure commence ici</span></header>
    <main>
      <aside className="sidebar">
        <div className="intro"><label className="name-label" htmlFor="route-name">Nom du parcours</label><input id="route-name" className="route-name" value={name} maxLength={100} onChange={e => setName(e.target.value)}/>
          <div className="route-stats" aria-live="polite"><div className="stat-card"><span>{selectedStage === null ? 'Distance totale' : `Distance étape ${selectedStage + 1}`}</span><strong>{route ? (route.distance / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'} <small>km</small></strong></div><div className="stat-card"><span>Dénivelé positif</span><strong>{route && elevation?.route === route && elevation.ascent !== null ? `+${elevation.ascent.toLocaleString('fr-FR')}` : '—'} <small>m</small></strong><small>{route && elevation?.route === route && elevation.failed ? 'Altitude indisponible' : route && (elevation?.route !== route || elevation.ascent === null) ? 'Calcul…' : route ? 'Estimation' : 'En attente'}</small></div></div>
        </div>
        <section className="planner"><div className="section-label"><span>VOTRE ITINÉRAIRE</span><span className="draft">{storageMessage ? 'Brouillon non enregistré' : allPoints.length ? 'Brouillon automatique' : 'Nouveau parcours'}</span></div>
          <div className="activity-label">Type de vélo</div><div className="activities">{([['road', 'Route'], ['gravel', 'Gravel'], ['mtb', 'VTT']] as const).map(([value, label]) => <button key={value} className={activity === value ? 'selected' : ''} aria-pressed={activity === value} onClick={() => { if (activity !== value) redoHistory.current = []; setActivity(value); }}>{label}</button>)}</div>
          <div className="points-heading"><h2>Points de passage <span>{points.length.toString().padStart(2, '0')}</span></h2></div>
          {points.length === 0 ? <div className="empty-points"><div className="point-line"><span className="point-circle start"/><div><strong>Votre point de départ</strong><small>Cliquez sur la carte pour commencer</small></div></div><div className="point-line muted"><span className="point-circle"/><div><strong>Et ensuite, où allez-vous ?</strong><small>Ajoutez votre prochaine étape</small></div></div></div> : <ol className="point-list">{points.map((p, i) => <li key={p.id}><span className={`number ${i === 0 ? 'start' : ''}`}>{i + 1}</span><div><strong>{i === 0 ? 'Départ' : i === points.length - 1 ? 'Arrivée' : `Checkpoint ${i}`}</strong><small>{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</small></div><button className="icon-button" title="Insérer un point après" disabled={selectedStage !== null && selectedStage < boundaries.length && i === points.length - 1} aria-label={`Insérer après le point ${i + 1}`} onClick={() => setInsertAfter(p.id)}><Plus size={16}/></button><button className="icon-button" aria-label={`Supprimer le point ${i + 1}`} onClick={() => { change(points.filter(x => x.id !== p.id)); setInsertAfter(null); }}><X size={16}/></button></li>)}</ol>}
          <div className="point-tip"><MapPin size={15}/><span>{insertAfter ? 'Cliquez sur la carte pour insérer un checkpoint.' : route ? 'Cliquez directement sur le tracé pour ajouter un checkpoint.' : 'Cliquez sur la carte pour ajouter un point.'}</span>{insertAfter && <button className="icon-button" aria-label="Annuler l’insertion" onClick={() => setInsertAfter(null)}><X size={14}/></button>}</div>
          {allPoints.length > 0 && <button className="clear-button" onClick={() => { recordChange(); userStarted.current = true; setPoints([]); setBoundaries([]); setSavedId(null); setSavedMessage(''); setSelectedStage(null); setInsertAfter(null); }}><Trash2 size={13}/> Effacer le parcours</button>}
        </section>
        <div className="summary"><div className="save-actions"><button disabled={!allPoints.length} onClick={() => saveRoute()}><Save size={16}/> Enregistrer</button><button onClick={() => { setSavedOpen(true); setSavedMessage(''); }}><FolderOpen size={16}/> Mes parcours ({savedRoutes.length})</button></div>{storageMessage && <p className="storage-warning" role="alert">{storageMessage}</p>}{savedMessage && <p className="storage-notice" role="status">{savedMessage}</p>}<input ref={fileInput} type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden onChange={e => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (file) void loadGpx(file); }}/><button className="import-button" onClick={() => fileInput.current?.click()}><Upload size={16}/> Importer un GPX</button><button className="export-button" disabled={!route || busy} onClick={exportRoute}>{busy ? <LoaderCircle size={18} className="spin"/> : exported ? <Check size={18}/> : <Download size={18}/>} {exported ? 'GPX téléchargé' : selectedStage === null ? 'Exporter tout le parcours' : `Exporter l’étape ${selectedStage + 1}`}<span>.gpx</span></button><p className="export-note">Emportez votre trace sur votre GPS ou votre app.</p></div>
        <footer><Mountain size={15}/> Moins d’écran. Plus de grand air.</footer>
      </aside>
      <section className="map-panel" aria-label="Carte de création d’itinéraire">
        <div className="stage-tabs" aria-label="Étapes du parcours"><button className={selectedStage === null ? 'active' : ''} aria-pressed={selectedStage === null} onClick={() => { setSelectedStage(null); setInsertAfter(null); }}>Toutes les étapes</button>{Array.from({ length: boundaries.length + 1 }, (_, i) => <button key={i} className={selectedStage === i ? 'active' : ''} aria-pressed={selectedStage === i} onClick={() => { setSelectedStage(i); setInsertAfter(null); }}>Étape {i + 1}</button>)}<button onClick={addStage} aria-label="Ajouter une étape">+ Étape</button></div>
        <div className="map-edit-controls" role="group" aria-label="Modifier le parcours"><button onClick={undo} disabled={!history.current.length} aria-label="Annuler la dernière modification" title="Annuler"><Undo2 size={19}/></button><button onClick={redo} disabled={!redoHistory.current.length} aria-label="Rétablir la modification annulée" title="Rétablir"><Redo2 size={19}/></button><button className="finish-loop" onClick={finishLoop} disabled={allPoints.length < 2 || (allPoints[0].lat === allPoints[allPoints.length - 1].lat && allPoints[0].lng === allPoints[allPoints.length - 1].lng)} title="Revenir au départ"><RotateCcw size={16}/> Fermer la boucle</button></div>
        <MapContainer center={[45.899, 6.129]} zoom={13} zoomControl={false} doubleClickZoom={false} className="map"><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"/><MapActions points={points} add={add} fit={fit} locate={locate} onError={setError} initialPosition={initialPosition} streetView={streetView} onStreetView={openStreetView}/><ZoomButtons/>{route && route.legs.map((leg, legIndex) => <Polyline key={`leg-${legIndex}`} positions={leg} bubblingMouseEvents={false} pathOptions={{ color: '#207256', weight: 16, opacity: 0.01, className: 'route-hit-area' }} eventHandlers={{ click: e => addCheckpoint(legIndex, e.latlng.lat, e.latlng.lng) }} />)}{route && <Polyline positions={route.coordinates} interactive={false} pathOptions={{ color: '#207256', weight: 5, opacity: 0.9 }}/ >}{points.map((p, i) => <Marker key={p.id} position={[p.lat, p.lng]} draggable icon={L.divIcon({ className: 'waypoint', html: `<span>${i + 1}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] })} eventHandlers={{ dragend: e => { const position = e.target.getLatLng(); change(points.map(x => x.id === p.id ? { ...x, lat: position.lat, lng: position.lng } : x)); } }}><Popup><strong>{i === 0 ? 'Départ' : i === points.length - 1 ? 'Arrivée' : `Checkpoint ${i}`}</strong><p>Déplacez ce point pour forcer le parcours à passer par ici.</p><button onClick={e => { e.stopPropagation(); change(points.filter(x => x.id !== p.id)); }}>Supprimer ce point</button></Popup></Marker>)}</MapContainer>
        <button className={`street-button ${streetView ? "active" : ""}`} aria-label="Ouvrir Street View" aria-pressed={streetView} title="Voir une route dans Google Street View" onClick={() => setStreetView(value => !value)}><PersonStanding size={20}/></button><div className="map-tools"><button aria-label="Afficher tout le parcours" title="Afficher le parcours" disabled={!points.length} onClick={() => setFit(x => x + 1)}><Expand size={19}/></button><button aria-label="Me localiser" title="Me localiser" onClick={() => setLocate(x => x + 1)}><LocateFixed size={20}/></button></div>
        <div className="map-instruction"><span className="instruction-icon"><Plus size={18}/></span><span>{streetView ? 'Cliquez sur la route à voir dans Street View.' : points.length === 0 ? 'Tout commence par un premier point.' : insertAfter ? 'Choisissez la position de votre nouveau checkpoint.' : route ? 'Cliquez sur le tracé pour ajouter un checkpoint.' : 'Ajoutez un point ou déplacez vos étapes.'}<small>{streetView ? 'La vue s’ouvrira dans Google Maps' : points.length === 0 ? 'Cliquez où votre aventure commence' : route ? 'Déplacez-le pour imposer le chemin souhaité' : 'Le parcours s’adapte automatiquement'}</small></span>{points.length === 0 && !streetView && <ArrowDown size={17}/>}</div>
        <span className="map-layer"><span className="layer-preview"/> OpenStreetMap <ChevronDown size={12}/></span>
        {(busy || error) && <div className={`route-status ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{busy && !error ? <><LoaderCircle className="spin" size={17}/> Recherche du meilleur chemin…</> : <><Info size={18}/><span>{error}</span>{points.length >= 2 && <button onClick={() => setRetry(x => x + 1)}>Réessayer</button>}</>}</div>}
      </section>
    </main>
    {savedOpen && <div className="modal-backdrop" onClick={() => setSavedOpen(false)}><div className="help-modal saved-modal" role="dialog" aria-modal="true" aria-label="Mes parcours enregistrés" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setSavedOpen(false); }}><button autoFocus className="modal-close icon-button" aria-label="Fermer" onClick={() => setSavedOpen(false)}><X/></button><span className="eyebrow">SUR CET APPAREIL</span><h2>Mes parcours</h2><p>Votre brouillon est enregistré automatiquement. Retrouvez ici vos parcours enregistrés.</p>{savedRoutes.length === 0 ? <p>Aucun parcours enregistré pour le moment.</p> : <ul className="saved-list">{savedRoutes.map(entry => <li key={entry.id}><button className="saved-open" onClick={() => openSaved(entry)}><strong>{entry.snapshot.name || 'Sans nom'}</strong><small>{new Date(entry.updatedAt).toLocaleString('fr-FR')} · {entry.snapshot.boundaries.length + 1} étape{entry.snapshot.boundaries.length ? 's' : ''}</small></button><button className="icon-button" aria-label={`Supprimer ${entry.snapshot.name || 'ce parcours'}`} onClick={() => deleteSaved(entry)}><Trash2 size={17}/></button></li>)}</ul>}{allPoints.length > 0 && <button className="import-button" onClick={() => saveRoute(true)}><Save size={16}/> Enregistrer une copie du parcours actuel</button>}{savedMessage && <p className="storage-notice" role="status">{savedMessage}</p>}<div className="help-note">Les sauvegardes restent dans ce navigateur sur cet appareil. Un export GPX permet de les conserver ailleurs.</div></div></div>}
    {help && <div className="modal-backdrop" onClick={() => setHelp(false)}><div className="help-modal" role="dialog" aria-modal="true" aria-label="Comment ça marche" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setHelp(false); }}><button autoFocus className="modal-close icon-button" aria-label="Fermer l’aide" onClick={() => setHelp(false)}><X/></button><span className="eyebrow">DU PREMIER POINT AU GRAND AIR</span><h2>Votre aventure en 3 étapes.</h2><p><b>01 · Tracez.</b> Choisissez votre activité et cliquez sur la carte pour placer le départ, les étapes et l’arrivée.</p><p><b>02 · Ajustez.</b> Cliquez directement sur la ligne verte pour créer un checkpoint, puis faites-le glisser afin d’imposer la route ou le chemin souhaité. Le bouton + d’un point permet aussi d’en insérer un après celui-ci ; × le supprime.</p><p><b>03 · Partez.</b> Exportez le GPX pour l’ouvrir dans votre GPS ou votre application sportive.</p><div className="help-note">Le calcul repose sur les données OpenStreetMap. Vérifiez l’accès et les conditions sur le terrain. Un brouillon automatique et les parcours enregistrés sont conservés dans ce navigateur, sur cet appareil.</div></div></div>}
  </div>;
}
