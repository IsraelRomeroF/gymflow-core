import { describe, expect, it } from 'vitest';
import {
  descuadrePorRevisar, reglaDelCajon, retiroDisponibleDelPuesto, TOLERANCIA_DE_DESCUADRE_CENTS,
} from '../src/index.js';

/**
 * FASE 4 · BLOQUE 4.3 · D-17 (b). Las dos reglas puras de la caja: cuándo una
 * diferencia queda «por revisar» y cuánto le queda al puesto por retirar.
 */
describe('D-17 · el descuadre que queda por revisar', () => {
  it('la tolerancia es de $20', () => {
    expect(TOLERANCIA_DE_DESCUADRE_CENTS).toBe(2_000n);
  });

  it('un faltante de $20 justos no se revisa; $20.01 sí', () => {
    expect(descuadrePorRevisar(-2_000n)).toBe(false);
    expect(descuadrePorRevisar(-2_001n)).toBe(true);
  });

  it('un sobrante de $20 justos no se revisa; $20.01 sí (el sobrante se revisa igual que el faltante)', () => {
    expect(descuadrePorRevisar(2_000n)).toBe(false);
    expect(descuadrePorRevisar(2_001n)).toBe(true);
  });

  it('un corte que cuadró, o un turno sin cortar, no tiene nada que revisar', () => {
    expect(descuadrePorRevisar(0n)).toBe(false);
    expect(descuadrePorRevisar(null)).toBe(false);
    expect(descuadrePorRevisar(undefined)).toBe(false);
  });
});

describe('D-15 · lo que al puesto le queda por retirar en el turno', () => {
  const tope = 500_000n;

  it('la gerencia no tiene tope: nulo', () => {
    expect(retiroDisponibleDelPuesto({ puesto: 'SIN_TOPE', topeRetiroCents: tope, retiradoEnElTurnoCents: 900_000n })).toBeNull();
  });

  it('un puesto que no retira tiene cero', () => {
    expect(retiroDisponibleDelPuesto({ puesto: 'NO_PUEDE', topeRetiroCents: tope, retiradoEnElTurnoCents: 0n })).toBe(0n);
  });

  it('recepción: el tope menos lo que ya retiró, y nunca menos de cero', () => {
    expect(retiroDisponibleDelPuesto({ puesto: 'CON_TOPE', topeRetiroCents: tope, retiradoEnElTurnoCents: 0n })).toBe(500_000n);
    expect(retiroDisponibleDelPuesto({ puesto: 'CON_TOPE', topeRetiroCents: tope, retiradoEnElTurnoCents: 300_000n })).toBe(200_000n);
    // El gimnasio bajó el tope a media tarde: ya retiró más de lo que hoy se permite.
    expect(retiroDisponibleDelPuesto({ puesto: 'CON_TOPE', topeRetiroCents: 200_000n, retiradoEnElTurnoCents: 300_000n })).toBe(0n);
  });

  it('dice lo mismo que `reglaDelCajon`: lo que queda justo pasa con firma, un centavo más no', () => {
    for (const retirado of [0n, 1n, 300_000n, 499_999n, 500_000n]) {
      const queda = retiroDisponibleDelPuesto({ puesto: 'CON_TOPE', topeRetiroCents: tope, retiradoEnElTurnoCents: retirado })!;
      const regla = (montoCents: bigint) => reglaDelCajon({
        tipo: 'WITHDRAWAL', montoCents, sinFirmaEnElTurnoCents: 0n, retiradoEnElTurnoCents: retirado,
        topeChicoCents: 50_000n, topeRetiroCents: tope, puesto: 'CON_TOPE', firmado: true,
      }).outcome;
      if (queda > 0n) expect(regla(queda), `retirado ${retirado}`).toBe('ALLOW');
      expect(regla(queda + 1n), `retirado ${retirado}`).toBe('DENY');
    }
  });
});
