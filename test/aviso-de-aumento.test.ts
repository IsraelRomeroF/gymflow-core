import { describe, it, expect } from 'vitest';
import { DIAS_DE_AVISO_DE_AUMENTO, rigeDesde, cuotaConAumento, primerCobroConAumento, precioConAumentos, precioAlFinal } from '../src/index.js';

/** Bloque 4.20 (P-14): un aumento pide 15 días entre que se guarda y el primer cobro con el precio nuevo. */
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const mes = { unit: 'MONTH' as const, value: 1 };

describe('aviso de aumento (4.20, P-14)', () => {
  it('un aumento rige 15 días después; una bajada, el mismo día', () => {
    expect(DIAS_DE_AVISO_DE_AUMENTO).toBe(15);
    expect(rigeDesde(d('2026-11-25'), 60_000n, 65_000n)).toEqual(d('2026-12-10'));
    expect(rigeDesde(d('2026-11-25'), 65_000n, 60_000n)).toEqual(d('2026-11-25'));
    // Cruzando de año.
    expect(rigeDesde(d('2026-12-20'), 1n, 2n)).toEqual(d('2027-01-04'));
  });

  it('la cuota sale con el aumento solo si su periodo empieza y se emite desde ese día', () => {
    const rige = d('2026-12-10');
    expect(cuotaConAumento({ inicio: d('2026-12-10'), emitidaEl: d('2026-12-10'), rige })).toBe(true);
    expect(cuotaConAumento({ inicio: d('2026-12-09'), emitidaEl: d('2026-12-09'), rige })).toBe(false);
    // Renovar por adelantado antes de que rija: ese periodo, al precio de antes.
    expect(cuotaConAumento({ inicio: d('2026-12-20'), emitidaEl: d('2026-12-01'), rige })).toBe(false);
    // Ponerse al corriente de un periodo que empezó antes: también al de antes.
    expect(cuotaConAumento({ inicio: d('2026-12-01'), emitidaEl: d('2026-12-15'), rige })).toBe(false);
    expect(cuotaConAumento({ inicio: d('2026-12-20'), emitidaEl: d('2026-12-12'), rige })).toBe(true);
  });

  it('a quien su cuota le nace antes de los 15 días, el primero es el siguiente ciclo', () => {
    const rige = d('2026-12-10');
    // Le toca el 1 de diciembre (dentro de los 15 días): paga el de antes y el aumento llega el 1 de enero.
    expect(primerCobroConAumento({ siguienteInicio: d('2026-12-01'), duracion: mes, diaDeCorte: 1, rige })).toEqual(d('2027-01-01'));
    // Le toca el 10: justo a los 15 días, ya es ese.
    expect(primerCobroConAumento({ siguienteInicio: d('2026-12-10'), duracion: mes, diaDeCorte: 10, rige })).toEqual(d('2026-12-10'));
    // Le toca el 20: su siguiente pago, como siempre.
    expect(primerCobroConAumento({ siguienteInicio: d('2026-12-20'), duracion: mes, diaDeCorte: 20, rige })).toEqual(d('2026-12-20'));
    // Ancla de fin de mes (ADR-006): del 30 de noviembre al 30 de diciembre.
    expect(primerCobroConAumento({ siguienteInicio: d('2026-11-30'), duracion: mes, diaDeCorte: 31, rige })).toEqual(d('2026-12-31'));
  });

  it('con ciclos cortos salta los que hagan falta; un paquete de visitas no tiene fecha', () => {
    const rige = d('2026-12-10');
    expect(primerCobroConAumento({ siguienteInicio: d('2026-11-27'), duracion: { unit: 'WEEK', value: 1 }, diaDeCorte: 27, rige })).toEqual(d('2026-12-11'));
    expect(primerCobroConAumento({ siguienteInicio: d('2026-11-26'), duracion: { unit: 'DAY', value: 1 }, diaDeCorte: 26, rige })).toEqual(d('2026-12-10'));
    expect(primerCobroConAumento({ siguienteInicio: d('2026-11-26'), duracion: { unit: 'VISIT', value: 10 }, diaDeCorte: 26, rige })).toBeNull();
  });
});

describe('precio de la cuota con aumentos por llegar (4.20)', () => {
  const c = (id: string, from: number, to: number, rige: string | null, llego = false) =>
    ({ id, fromPriceCents: BigInt(from), toPriceCents: BigInt(to), appliesFrom: rige ? d(rige) : null, llego });
  const cuota = (dia: string) => ({ inicio: d(dia), emitidaEl: d(dia) });

  it('sin aumentos por llegar, la de siempre', () => {
    expect(precioConAumentos({ base: 60_000n, cambios: [c('a', 55_000, 60_000, null)], ...cuota('2026-12-01') })).toEqual({ precio: 60_000n, llegan: [] });
  });

  it('un aumento no llega antes de su día, y llega en la cuota que empieza y se emite desde él', () => {
    const cambios = [c('a', 60_000, 65_000, '2026-12-10')];
    expect(precioConAumentos({ base: 60_000n, cambios, ...cuota('2026-12-01') })).toEqual({ precio: 60_000n, llegan: [] });
    expect(precioConAumentos({ base: 60_000n, cambios, ...cuota('2026-12-10') })).toEqual({ precio: 65_000n, llegan: ['a'] });
    // Renovar por adelantado antes del día: sigue al de antes.
    expect(precioConAumentos({ base: 60_000n, cambios, inicio: d('2027-01-01'), emitidaEl: d('2026-12-05') })).toEqual({ precio: 60_000n, llegan: [] });
    expect(precioAlFinal(60_000n, cambios)).toBe(65_000n);
  });

  it('una bajada después de un aumento por llegar se aplica ya, pero no adelanta el aumento', () => {
    // Pagaba 650; aumento a 700 desde el 10; luego baja la lista a 640 (hoy).
    const baja = [c('a', 65_000, 70_000, '2026-12-10'), c('b', 70_000, 64_000, null)];
    expect(precioConAumentos({ base: 65_000n, cambios: baja, ...cuota('2026-12-01') }).precio).toBe(64_000n);
    expect(precioConAumentos({ base: 65_000n, cambios: baja, ...cuota('2026-12-15') })).toEqual({ precio: 64_000n, llegan: ['a'] });
    // Si la baja deja el precio arriba de lo que paga (700 → 680), espera al día del aumento.
    const pocoMenos = [c('a', 65_000, 70_000, '2026-12-10'), c('b', 70_000, 68_000, null)];
    expect(precioConAumentos({ base: 65_000n, cambios: pocoMenos, ...cuota('2026-12-01') }).precio).toBe(65_000n);
    expect(precioConAumentos({ base: 65_000n, cambios: pocoMenos, ...cuota('2026-12-10') }).precio).toBe(68_000n);
  });

  it('dos aumentos seguidos llegan cada uno en su día', () => {
    const dos = [c('a', 60_000, 65_000, '2026-12-10'), c('b', 65_000, 70_000, '2026-12-20')];
    expect(precioConAumentos({ base: 60_000n, cambios: dos, ...cuota('2026-12-12') })).toEqual({ precio: 65_000n, llegan: ['a'] });
    expect(precioConAumentos({ base: 60_000n, cambios: dos, ...cuota('2026-12-20') })).toEqual({ precio: 70_000n, llegan: ['a', 'b'] });
    // Ya llegado el primero, la cuota del 15 sale a 650 y solo espera el segundo.
    const unoLlego = [c('a', 60_000, 65_000, '2026-12-10', true), c('b', 65_000, 70_000, '2026-12-20')];
    expect(precioConAumentos({ base: 65_000n, cambios: unoLlego, ...cuota('2026-12-15') })).toEqual({ precio: 65_000n, llegan: [] });
  });
});
