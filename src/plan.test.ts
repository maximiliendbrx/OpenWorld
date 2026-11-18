import { describe, expect, it } from 'vitest';
import { FREE_SAVED_LIMIT, canSaveMore } from './plan';

describe('limites du plan gratuit', () => {
  it('autorise jusqu’à la limite puis bloque les nouveaux parcours', () => {
    expect(canSaveMore('free', FREE_SAVED_LIMIT - 1, true)).toBe(true);
    expect(canSaveMore('free', FREE_SAVED_LIMIT, true)).toBe(false);
  });
  it('autorise toujours la mise à jour d’un parcours existant', () => {
    expect(canSaveMore('free', FREE_SAVED_LIMIT, false)).toBe(true);
  });
  it('ne limite pas le plan Pro', () => {
    expect(canSaveMore('pro', 500, true)).toBe(true);
  });
});
