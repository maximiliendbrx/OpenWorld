import type { Point } from './routing';

/** A boundary may have a separate next-stage start immediately after it. */
export function stageRange(points: Point[], boundaries: string[], stage: number | null): { start: number; end: number } {
  const indices = boundaries.map(id => points.findIndex(point => point.id === id));
  const previous = stage !== null && stage > 0 ? indices[stage - 1] : -1;
  return {
    start: previous < 0 ? 0 : previous + (points[previous + 1]?.startsNewStage ? 1 : 0),
    end: stage === null || stage === boundaries.length ? points.length - 1 : indices[stage],
  };
}

/** Split a formerly shared endpoint when one stage moves it. */
export function replaceStagePoints(points: Point[], boundaries: string[], stage: number | null, next: Point[]): Point[] | null {
  const { start, end } = stageRange(points, boundaries, stage);
  const updated = stage === null ? [...next] : [...points.slice(0, start), ...next, ...points.slice(end + 1)];
  if (boundaries.some(id => !updated.some(point => point.id === id))) return null;
  if (points.some(point => point.startsNewStage && !updated.some(item => item.id === point.id))) return null;
  for (let boundary = 0; boundary < boundaries.length; boundary++) {
    const oldIndex = points.findIndex(p => p.id === boundaries[boundary]);
    const old = points[oldIndex];
    if (points[oldIndex + 1]?.startsNewStage) continue;
    const index = updated.findIndex(p => p.id === old.id);
    const moved = updated[index];
    if (moved.lat === old.lat && moved.lng === old.lng) continue;
    if (updated.length >= 50) throw new Error('Pour déplacer ce départ, libérez un point : la limite est de 50 points.');
    if (stage === boundary + 1) {
      updated[index] = old;
      updated.splice(index + 1, 0, { ...moved, id: crypto.randomUUID(), startsNewStage: true, stageSourceId: old.id });
    } else {
      updated.splice(index + 1, 0, { ...old, id: crypto.randomUUID(), startsNewStage: true, stageSourceId: old.id });
    }
  }
  return updated;
}

export function pointLabel(point: Point, index: number, count: number, boundaries: string[], allPoints: Point[]): string {
  const shared = boundaries.indexOf(point.id);
  if (shared >= 0) {
    const position = allPoints.findIndex(p => p.id === point.id);
    return allPoints[position + 1]?.startsNewStage ? `Arrivée étape ${shared + 1}` : `Arrivée étape ${shared + 1} / Départ étape ${shared + 2}`;
  }
  if (point.startsNewStage) {
    const position = allPoints.findIndex(p => p.id === point.id);
    return `Départ étape ${boundaries.indexOf(allPoints[position - 1]?.id) + 2}`;
  }
  return index === 0 ? 'Départ' : index === count - 1 ? 'Arrivée' : `Checkpoint ${index}`;
}
