type Coordinate = [number, number];

/** Sample along the full route, including its endpoints, with at most 100 locations. */
export function sampleRoute(coordinates: Coordinate[], distance: number): Coordinate[] {
  const lengths = [0];
  for (let i = 1; i < coordinates.length; i++) {
    const [lat1, lon1] = coordinates[i - 1];
    const [lat2, lon2] = coordinates[i];
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    lengths.push(lengths[i - 1] + 12742000 * Math.asin(Math.min(1, Math.sqrt(a))));
  }
  const total = lengths[lengths.length - 1];
  if (!total) return [coordinates[0], coordinates[coordinates.length - 1]];
  const count = Math.min(100, Math.max(2, Math.ceil(distance / 50) + 1));
  let segment = 1;
  return Array.from({ length: count }, (_, i) => {
    const target = total * i / (count - 1);
    while (segment < lengths.length - 1 && lengths[segment] < target) segment++;
    const size = lengths[segment] - lengths[segment - 1];
    const fraction = size ? (target - lengths[segment - 1]) / size : 0;
    const start = coordinates[segment - 1];
    const end = coordinates[segment];
    return [start[0] + (end[0] - start[0]) * fraction, start[1] + (end[1] - start[1]) * fraction];
  });
}

export async function calculateAscent(coordinates: Coordinate[], distance: number, signal: AbortSignal): Promise<number> {
  const samples = sampleRoute(coordinates, distance);
  const params = new URLSearchParams({ latitude: samples.map(p => p[0].toFixed(5)).join(','), longitude: samples.map(p => p[1].toFixed(5)).join(',') });
  const response = await fetch(`https://api.open-meteo.com/v1/elevation?${params}`, { signal });
  if (!response.ok) throw new Error('Altitude indisponible');
  const data = await response.json();
  const values: unknown = data.elevation;
  if (!Array.isArray(values) || values.length !== samples.length || !values.every(v => typeof v === 'number' && Number.isFinite(v))) throw new Error('Altitudes invalides');
  return Math.round(values.slice(1).reduce((sum, value, i) => sum + Math.max(0, value - values[i]), 0));
}
