import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

type PanoramaPosition = { lat: number; lng: number; heading: number };
type GooglePanorama = {
  addListener: (event: string, listener: () => void) => { remove: () => void };
  getPosition: () => { lat: () => number; lng: () => number } | null;
  getPov: () => { heading: number };
  getStatus: () => string;
  setVisible: (visible: boolean) => void;
};
type GoogleMaps = { maps: { StreetViewPanorama: new (element: HTMLElement, options: object) => GooglePanorama } };
declare global { interface Window { google?: GoogleMaps; } }
let loading: Promise<GoogleMaps> | undefined;
function loadGoogle(key: string): Promise<GoogleMaps> {
  if (window.google?.maps?.StreetViewPanorama) return Promise.resolve(window.google);
  if (!loading) {
    loading = new Promise<GoogleMaps>((resolve, reject) => {
      const script = document.createElement('script');
      const params = new URLSearchParams({ key, v: 'weekly', loading: 'async' });
      script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
      script.async = true;
      script.onload = () => window.google?.maps?.StreetViewPanorama ? resolve(window.google) : reject(new Error('Google Maps indisponible'));
      script.onerror = () => { script.remove(); reject(new Error('Google Maps indisponible')); };
      document.head.appendChild(script);
    }).catch(error => { loading = undefined; throw error; });
  }
  return loading;
}

export default function StreetView({ location, onMove, onClose }: { location: { lat: number; lng: number }; onMove: (position: PanoramaPosition | null) => void; onClose: () => void }) {
  const element = useRef<HTMLDivElement>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const [error, setError] = useState('');
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  useEffect(() => {
    if (!key || !element.current) return;
    let active = true;
    let panorama: GooglePanorama | undefined;
    let listeners: { remove: () => void }[] = [];
    setError('');
    loadGoogle(key).then(google => {
      if (!active || !element.current) return;
      panorama = new google.maps.StreetViewPanorama(element.current, { position: location, pov: { heading: 0, pitch: 0 }, addressControl: false, fullscreenControl: false, linksControl: true, enableCloseButton: false });
      const update = () => {
        const position = panorama?.getPosition();
        if (position && panorama?.getStatus() === 'OK') { setError(''); onMoveRef.current({ lat: position.lat(), lng: position.lng(), heading: panorama.getPov().heading }); }
      };
      listeners = [panorama.addListener('position_changed', update), panorama.addListener('pov_changed', update), panorama.addListener('status_changed', () => {
        if (panorama?.getStatus() !== 'OK') { setError('Aucune vue Street View disponible à cet endroit.'); onMoveRef.current(null); } else update();
      })];
      update();
    }).catch(() => { if (active) setError('Impossible de charger Google Maps. Vérifiez la clé et les autorisations.'); });
    return () => { active = false; listeners.forEach(listener => listener.remove()); panorama?.setVisible(false); };
  }, [key, location.lat, location.lng]);
  return <div className="street-panel"><div className="street-panel-header"><strong>Google Street View</strong><button className="icon-button" aria-label="Fermer Street View" onClick={onClose}><X size={18}/></button></div>{!key ? <p className="street-message">Pour afficher Street View ici, configurez une clé Google Maps JavaScript API dans les paramètres du site.</p> : <><div ref={element} className="street-panorama"/>{error && <p className="street-message" role="alert">{error}</p>}</>}</div>;
}
