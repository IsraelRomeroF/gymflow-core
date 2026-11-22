import { describe, it, expect } from 'vitest';
import { armarCursor, cortarPagina, leerCursor, Pagina, RestoDeLista } from '../src/contracts/index.js';
import { z } from 'zod';

const ID = '01930001-7c1a-7000-8000-000000000001';

describe('una página de una lista (1.6)', () => {
  it('el cursor va y vuelve, con fecha de calendario o con instante', () => {
    expect(leerCursor(armarCursor('2026-11-19', ID))).toEqual({ orden: '2026-11-19', id: ID });
    expect(leerCursor(armarCursor('2026-11-19T18:20:00.123Z', ID))).toEqual({ orden: '2026-11-19T18:20:00.123Z', id: ID });
    // Va en la URL sin escapar.
    expect(armarCursor('2026-11-19T18:20:00.123Z', ID)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('un cursor inventado, cortado o con otra cosa dentro no se lee', () => {
    const bueno = armarCursor('2026-11-19', ID);
    expect(leerCursor('')).toBeNull();
    expect(leerCursor('no-es-un-cursor')).toBeNull();
    expect(leerCursor(bueno.slice(0, -6))).toBeNull();
    expect(leerCursor(btoa(JSON.stringify(['2026-11-19', "x' OR 1=1 --"])))).toBeNull();
    expect(leerCursor(btoa(JSON.stringify(['ayer', ID])))).toBeNull();
    expect(leerCursor(btoa(JSON.stringify(['2026-13-45', ID])))).toBeNull();
    expect(leerCursor(btoa(JSON.stringify({ orden: '2026-11-19', id: ID })))).toBeNull();
    expect(leerCursor('a'.repeat(401))).toBeNull();
  });

  it('con un renglón de más hay otra página y el cursor es el último que se entrega', () => {
    const filas = [1, 2, 3].map((n) => ({ n }));
    expect(cortarPagina(filas, 2, (u) => `c${u.n}`)).toEqual({ items: [{ n: 1 }, { n: 2 }], hasMore: true, nextCursor: 'c2' });
    expect(cortarPagina(filas, 3, (u) => `c${u.n}`)).toEqual({ items: filas, hasMore: false, nextCursor: null });
    expect(cortarPagina([], 3, () => 'x')).toEqual({ items: [], hasMore: false, nextCursor: null });
  });

  it('`Pagina` exige total, cursor y `hasMore`: una lista no esconde filas sin decirlo', () => {
    const P = Pagina(z.object({ n: z.number() }));
    expect(P.safeParse({ items: [{ n: 1 }], total: 9, nextCursor: 'c1', hasMore: true }).success).toBe(true);
    expect(P.safeParse({ items: [{ n: 1 }] }).success).toBe(false);
    expect(RestoDeLista.safeParse({ total: 0, nextCursor: null, hasMore: false }).success).toBe(true);
  });
});
