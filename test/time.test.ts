import { describe, it, expect } from 'vitest';
import { businessDateIn, anchoredDate, nextAnchoredDate, daysInMonth, isoDate } from '../src/index.js';

describe('fecha de negocio', () => {
  it('23:50 y 00:10 caen en días de corte distintos', () => {
    // Medianoche en CDMX (UTC-6, sin horario de verano) = 06:00 UTC.
    const tuesdayLate = new Date('2026-09-23T05:50:00.000Z'); // 22-sep 23:50 CDMX
    const wedEarly = new Date('2026-09-23T06:10:00.000Z');    // 23-sep 00:10 CDMX
    expect(isoDate(businessDateIn('America/Mexico_City', tuesdayLate))).toBe('2026-09-22');
    expect(isoDate(businessDateIn('America/Mexico_City', wedEarly))).toBe('2026-09-23');
  });

  it('DOS SUCURSALES, DOS FECHAS DE NEGOCIO en el mismo instante', () => {
    // El caso que justifica guardar timezone POR SUCURSAL (ADR-006):
    // la franja fronteriza norte sí observa horario estacional.
    const at = new Date('2026-09-23T06:10:00.000Z');
    expect(isoDate(businessDateIn('America/Mexico_City', at))).toBe('2026-09-23');
    expect(isoDate(businessDateIn('America/Tijuana', at))).toBe('2026-09-22');
  });
});

describe('ancla de día con recorte NO destructivo', () => {
  it('recorta en febrero común', () => {
    expect(isoDate(anchoredDate(31, 2027, 2))).toBe('2027-02-28');
  });
  it('recorta en febrero bisiesto', () => {
    expect(isoDate(anchoredDate(31, 2028, 2))).toBe('2028-02-29');
  });
  it('VUELVE al 31 en marzo: el ancla no se degrada', () => {
    const feb = anchoredDate(31, 2027, 2);
    expect(isoDate(feb)).toBe('2027-02-28');
    expect(isoDate(nextAnchoredDate(31, feb, 1))).toBe('2027-03-31');
  });
  it('secuencia completa ene→may con ancla 31', () => {
    const seq = [1, 2, 3, 4, 5].map((m) => isoDate(anchoredDate(31, 2027, m)));
    expect(seq).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31']);
  });
  it('ancla 29 en año no bisiesto', () => {
    expect(isoDate(anchoredDate(29, 2027, 2))).toBe('2027-02-28');
    expect(isoDate(anchoredDate(29, 2028, 2))).toBe('2028-02-29');
  });
  it('ancla 15 nunca se mueve', () => {
    for (let m = 1; m <= 12; m++) expect(isoDate(anchoredDate(15, 2027, m)).slice(-2)).toBe('15');
  });
  it('cruza el año correctamente', () => {
    expect(isoDate(nextAnchoredDate(31, new Date(Date.UTC(2027, 11, 31)), 1))).toBe('2028-01-31');
  });
  it('rechaza anclas fuera de rango', () => {
    expect(() => anchoredDate(0, 2027, 1)).toThrow();
    expect(() => anchoredDate(32, 2027, 1)).toThrow();
  });
  it('días por mes incluye bisiesto', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2027, 2)).toBe(28);
  });
});
