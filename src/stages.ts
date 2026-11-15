import type { Point } from './routing';

/** A stage includes its shared start and end points. */
export function stageRange(points: Point[], boundaries: string[], stage: number | null): { start: number; end: number } {
  const indices = boundaries.map(id => points.findIndex(point => point.id === id));
  return {
    start: stage === null || stage === 0 ? 0 : indices[stage - 1],
    end: stage === null || stage === boundaries.length ? points.length - 1 : indices[stage],
  };
}

/** Replace a stage by ID; the shared endpoint remains one point for both stages. */
export function replaceStagePoints(points: Point[], boundaries: string[], stage: number | null, next: Point[]): Point[] | null {
  const { start, end } = stageRange(points, boundaries, stage);
  const updated = stage === null ? next : [...points.slice(0, start), ...next, ...points.slice(end + 1)];
  if (boundaries.some(id => !updated.some(point => point.id === id))) return null;
  return updated;
}

export function pointLabel(point: Point, index: number, count: number, boundaries: string[]): string {
  const shared = boundaries.indexOf(point.id);
  if (shared >= 0) return `Arrivée étape ${shared + 1} / Départ étape ${shared + 2}`;
  return index === 0 ? 'Départ' : index === count - 1 ? 'Arrivée' : `Checkpoint ${index}`;
}
