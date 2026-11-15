export type Point = { id: string; lat: number; lng: number };
export type Activity = 'foot' | 'bike';
export type Route = { coordinates: [number, number][]; legs: [number, number][][]; distance: number };
const endpoints: Record<Activity, string> = {
  foot: import.meta.env.VITE_ROUTING_FOOT_URL || 'https://routing.openstreetmap.de/routed-foot/route/v1/driving',
  bike: import.meta.env.VITE_ROUTING_BIKE_URL || 'https://routing.openstreetmap.de/routed-bike/route/v1/driving',
};
/** Adapt this function for another provider; coordinates returned are [latitude, longitude]. */
export async function calculateRoute(points: Point[], activity: Activity, signal: AbortSignal): Promise<Route> {
  const locations = points.map(p => `${p.lng},${p.lat}`).join(';');
  const response = await fetch(`${endpoints[activity].replace(/\/$/, '')}/${locations}?overview=full&geometries=geojson&steps=true`, { signal });
  if (!response.ok) throw new Error(`Le service de calcul est indisponible (${response.status}). Réessayez dans un instant.`);
  const data = await response.json();
  const route = data.routes?.[0];
  if (data.code !== 'Ok' || !route) throw new Error('Aucun chemin trouvé entre ces points. Rapprochez-les d’une route ou d’un sentier.');
  const coordinates: unknown = route.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2 || !coordinates.every(c => Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90) || !Number.isFinite(route.distance) || route.distance < 0) throw new Error('Le service a renvoyé un itinéraire invalide.');
  const legs: unknown = route.legs?.map((leg: { steps?: { geometry?: { coordinates?: unknown[] } }[] }) =>
    leg.steps?.flatMap((step, stepIndex) => {
      const stepCoordinates = step.geometry?.coordinates;
      return Array.isArray(stepCoordinates) ? stepCoordinates.slice(stepIndex === 0 ? 0 : 1) : [];
    }) ?? []
  );
  if (!Array.isArray(legs) || legs.length !== points.length - 1 || !legs.every(leg => Array.isArray(leg) && leg.length >= 2 && leg.every(c => Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90))) throw new Error('Le service a renvoyé des tronçons invalides.');
  const validatedLegs = legs as [number, number][][];
  return {
    coordinates: coordinates.map(c => [c[1], c[0]]),
    legs: validatedLegs.map(leg => leg.map(([lng, lat]) => [lat, lng])),
    distance: route.distance,
  };
}
const escapeXml = (value: string) => value.replace(/[<>&"']/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' }[c]!));
export function createGpx(route: Route, name: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="OpenWorld" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${escapeXml(name)}</name></metadata><trk><name>${escapeXml(name)}</name><trkseg>${route.coordinates.map(([lat, lon]) => `<trkpt lat="${lat}" lon="${lon}"></trkpt>`).join('')}</trkseg></trk></gpx>`;
}
