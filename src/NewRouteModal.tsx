import { useState, type FormEvent } from 'react';
import { LocateFixed, MapPin, Mountain, Route, Trees, X } from 'lucide-react';
import type { Activity } from './routing';

type Place = { lat: number; lng: number; label: string };
const options = [
  { value: 'road', label: 'Route', Icon: Route },
  { value: 'gravel', label: 'Gravel', Icon: Trees },
  { value: 'mtb', label: 'VTT', Icon: Mountain },
] as const;
export function ActivityIcon({ activity, size = 18 }: { activity: Activity; size?: number }) {
  const Icon = options.find(option => option.value === activity)!.Icon;
  return <Icon size={size} aria-hidden="true"/>;
}
export default function NewRouteModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, activity: Activity, place: Place) => void }) {
  const [name, setName] = useState('');
  const [activity, setActivity] = useState<Activity>('road');
  const [address, setAddress] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [place, setPlace] = useState<Place | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const search = async () => {
    if (!address.trim()) { setError('Saisis une adresse à rechercher.'); return; }
    setLoading(true); setError(''); setPlace(null); setResults([]);
    try {
      const params = new URLSearchParams({ q: address.trim(), format: 'jsonv2', limit: '5', 'accept-language': 'fr' });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error();
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error();
      const found = data.flatMap(item => {
        const lat = Number(item.lat), lng = Number(item.lon);
        return Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180 && typeof item.display_name === 'string' ? [{ lat, lng, label: item.display_name }] : [];
      });
      setResults(found); if (!found.length) setError('Aucune adresse trouvée. Essaie une recherche plus précise.');
    } catch { setError('Recherche d’adresse indisponible. Réessaie dans un instant.'); }
    finally { setLoading(false); }
  };
  const locate = () => {
    if (!navigator.geolocation) { setError('La localisation n’est pas disponible sur cet appareil.'); return; }
    setLoading(true); setError(''); setResults([]); setPlace(null);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setPlace({ lat: coords.latitude, lng: coords.longitude, label: 'Ma position actuelle' }); setLoading(false);
    }, () => { setError('Impossible d’obtenir ta position. Vérifie les autorisations de localisation.'); setLoading(false); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) { setError('Donne un nom à ton tracé.'); return; }
    if (!place) { setError('Choisis une adresse dans les résultats ou utilise ta position actuelle.'); return; }
    onCreate(name.trim(), activity, place);
  };
  return <div className="modal-backdrop"><div className="help-modal new-route-modal" role="dialog" aria-modal="true" aria-labelledby="new-route-title" onKeyDown={e => { if (e.key === 'Escape' && !loading) onClose(); }}>
    <button className="modal-close icon-button" aria-label="Fermer" disabled={loading} onClick={onClose}><X/></button>
    <span className="eyebrow">UNE NOUVELLE AVENTURE</span><h2 id="new-route-title">Nouveau tracé</h2><p>Choisis ton départ et ton type de vélo pour commencer.</p>
    <form onSubmit={submit}>
      <label htmlFor="new-route-name">Nom du tracé</label><input autoFocus id="new-route-name" value={name} maxLength={100} onChange={e => setName(e.target.value)} placeholder="Mon prochain parcours" required/>
      <span className="new-route-label">Point de départ</span><div className="address-search"><input aria-label="Adresse de départ" value={address} onChange={e => { setAddress(e.target.value); setResults([]); setPlace(null); }} placeholder="Ville, rue, adresse…"/><button type="button" disabled={loading} onClick={() => void search()}>Rechercher</button></div>
      <button type="button" className="location-choice" disabled={loading} onClick={locate}><LocateFixed size={17}/> Utiliser ma position actuelle</button>
      {results.length > 0 && <ul className="address-results">{results.map((item, i) => <li key={`${item.lat}-${item.lng}-${i}`}><button type="button" onClick={() => { setPlace(item); setResults([]); setError(''); }}><MapPin size={15}/>{item.label}</button></li>)}</ul>}
      {place && <p className="selected-place"><MapPin size={15}/> Départ : {place.label}</p>}
      <fieldset><legend>Type de vélo</legend><div className="new-route-activities">{options.map(({ value, label, Icon }) => <button type="button" key={value} className={activity === value ? 'selected' : ''} aria-pressed={activity === value} onClick={() => setActivity(value)}><Icon size={20}/>{label}</button>)}</div><small>Ce choix restera fixe pour ce tracé.</small></fieldset>
      {error && <p className="new-route-error" role="alert">{error}</p>}
      <div className="new-route-actions"><button type="button" disabled={loading} onClick={onClose}>Annuler</button><button type="submit" disabled={loading}>{loading ? 'Recherche…' : 'Créer le tracé'}</button></div>
    </form>
  </div></div>;
}
