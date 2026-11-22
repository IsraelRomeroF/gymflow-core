import { describe, it, expect } from 'vitest';
import { uuidv7, isUuid, uuidv7Timestamp } from '../src/index.js';

describe('uuid v7', () => {
  it('genera un UUID con formato válido y versión 7', () => {
    const id = uuidv7();
    expect(isUuid(id)).toBe(true);
    expect(id[14]).toBe('7');
  });

  it('es ordenable por tiempo (localidad de índice B-tree)', () => {
    const early = uuidv7(1_700_000_000_000);
    const late = uuidv7(1_800_000_000_000);
    expect(early < late).toBe(true);
  });

  it('conserva el instante embebido', () => {
    const now = 1_758_000_000_000;
    expect(uuidv7Timestamp(uuidv7(now))).toBe(now);
  });

  it('no colisiona en lotes grandes del mismo milisegundo', () => {
    const now = Date.now();
    const ids = new Set(Array.from({ length: 20_000 }, () => uuidv7(now)));
    expect(ids.size).toBe(20_000);
  });
});
