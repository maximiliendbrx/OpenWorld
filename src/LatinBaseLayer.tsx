import { useEffect } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
/**
 * Fond de carte vectoriel (OpenFreeMap, gratuit, sans clé) dont les noms de lieux s'affichent en alphabet latin,
 * le nom local apparaissant en dessous (ex. « Tokyo » puis « 東京 »). Chargé à la demande ; `onFail` permet de revenir au fond classique.
 */
export default function LatinBaseLayer({ onFail }: { onFail: () => void }) {
  const map = useMap();
  useEffect(() => {
    let cancelled = false;
    let layer: L.Layer | null = null;
    (async () => {
      try {
        const style = await fetch(STYLE_URL);
        if (!style.ok) throw new Error('style');
        const [, adapter] = await Promise.all([import('maplibre-gl/dist/maplibre-gl.css'), import('@maplibre/maplibre-gl-leaflet')]);
        if (cancelled) return;
        layer = adapter.maplibreGL({ style: STYLE_URL }).addTo(map);
      } catch { if (!cancelled) onFail(); }
    })();
    return () => { cancelled = true; if (layer) map.removeLayer(layer); };
  }, [map]);
  return null;
}
