import { expect, it } from 'vitest';
import { pointLabel, replaceStagePoints, stageRange } from './stages';
import type { Point } from './routing';

const points: Point[] = [{ id: 'a', lat: 45, lng: 6 }, { id: 'shared', lat: 45.1, lng: 6.1 }, { id: 'c', lat: 45.2, lng: 6.2 }];
const boundaries = ['shared'];

it.each([0, 1])('déplacer la jonction depuis l’étape %s conserve un point commun aux deux étapes', stage => {
  const { start, end } = stageRange(points, boundaries, stage);
  const stagePoints = points.slice(start, end + 1).map(p => p.id === 'shared' ? { ...p, lat: 45.15, lng: 6.15 } : p);
  const updated = replaceStagePoints(points, boundaries, stage, stagePoints)!;
  const first = stageRange(updated, boundaries, 0), second = stageRange(updated, boundaries, 1);
  expect(updated[first.end]).toEqual({ id: 'shared', lat: 45.15, lng: 6.15 });
  expect(updated[second.start]).toEqual(updated[first.end]);
  expect(updated.filter(p => p.id === 'shared')).toHaveLength(1);
  expect(pointLabel(updated[first.end], first.end, updated.length, boundaries)).toBe('Arrivée étape 1 / Départ étape 2');
});

it('empêche la suppression du point qui relie les étapes', () => {
  expect(replaceStagePoints(points, boundaries, 1, [points[2]])).toBeNull();
});
