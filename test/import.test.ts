import { describe, it, expect } from 'vitest';
import { leerFecha, leerImporte, partirNombre, proponerColumnas, limpiarFila, mismoRegistroDeSaldo, fuenteDelArchivo, corregirDato } from '../src/import.js';

describe('importación de socios: limpieza', () => {
  it('lee las fechas como se escriben en México, día primero', () => {
    expect(leerFecha('05/03/2023')).toBe('2023-03-05');
    expect(leerFecha('5-3-23')).toBe('2023-03-05');
    expect(leerFecha('2023-03-05')).toBe('2023-03-05');
    expect(leerFecha('15 de marzo de 2023')).toBe('2023-03-15');
    expect(leerFecha('05/03/2023 10:30')).toBe('2023-03-05');
    expect(leerFecha(45000)).toBe('2023-03-15'); // serie de Excel
    expect(leerFecha('31/02/2023')).toBeNull();
    expect(leerFecha('13/13/2023')).toBeNull();
    expect(leerFecha('mañana')).toBeNull();
  });

  it('lee importes con signo, comas y paréntesis; nunca adivina', () => {
    expect(leerImporte('$1,234.50')).toBe(123450n);
    expect(leerImporte('650')).toBe(65000n);
    expect(leerImporte('-150')).toBe(-15000n);
    expect(leerImporte('(150.00)')).toBe(-15000n);
    expect(leerImporte('1.234,50')).toBe(123450n);
    expect(leerImporte(99.9)).toBe(9990n);
    expect(leerImporte('doce')).toBeNull();
  });

  it('parte un nombre completo: los dos últimos son apellidos y "de la" va con el suyo', () => {
    expect(partirNombre('Ana María López Hernández')).toEqual({ firstName: 'Ana María', lastName: 'López Hernández' });
    expect(partirNombre('Juan Pérez')).toEqual({ firstName: 'Juan', lastName: 'Pérez' });
    expect(partirNombre('Rosa de la Cruz Mora')).toEqual({ firstName: 'Rosa', lastName: 'de la Cruz Mora' });
  });

  it('reconoce las columnas por su encabezado', () => {
    expect(proponerColumnas(['No. Socio', 'Nombre', 'Apellidos', 'Teléfono', 'Correo electrónico', 'Vence', 'Saldo', 'Otra']))
      .toEqual(['legacyCode', 'firstName', 'lastName', 'phone', 'email', 'periodEnd', 'balance', null]);
    expect(proponerColumnas(['Nombre completo', 'Celular'])).toEqual(['fullName', 'phone']);
  });

  it('limpia una fila y dice qué no pudo leer', () => {
    const f = limpiarFila({ fullName: 'JOSÉ LUIS RAMÍREZ SOTO', phone: '55 1234 5678', email: 'sincorreo@x.com', balance: '$650', joinedAt: '01/02/2030' }, '2026-10-06');
    expect(f.firstName).toBe('José Luis');
    expect(f.lastName).toBe('Ramírez Soto');
    expect(f.phoneE164).toBe('+525512345678');
    expect(f.email).toBeNull();
    expect(f.balanceCents).toBe(65000n);
    expect(f.joinedAt).toBeNull();
    expect(f.problems.some((p) => p.includes('futuro'))).toBe(true);
    expect(f.invalid).toBe(false);
    expect(limpiarFila({ phone: '5512345678' }, '2026-10-06').invalid).toBe(true);
  });

  it('saldo, vigencia o fecha de alta que no se entienden quedan como dato dudoso (D18-02)', () => {
    const f = limpiarFila({ fullName: 'Ana Pérez', balance: 'mil pesos', periodEnd: '31/02/2027', joinedAt: 'ayer', phone: '55 1234', birthDate: 'nunca' }, '2026-10-06');
    expect(f.balanceCents).toBeNull();
    expect(f.periodEnd).toBeNull();
    expect(f.joinedAt).toBeNull();
    expect(f.doubtful.map((d) => d.field)).toEqual(['joinedAt', 'periodEnd', 'balance']);
    expect(f.doubtful.find((d) => d.field === 'balance')).toEqual({ field: 'balance', value: 'mil pesos', problem: 'Saldo no se entiende: mil pesos' });
    // Teléfono y nacimiento ilegibles no detienen la fila: solo se anotan.
    expect(f.problems.some((p) => p.startsWith('Teléfono no válido'))).toBe(true);
    expect(f.problems.some((p) => p.startsWith('Fecha de nacimiento'))).toBe(true);
    // Una fecha de alta en el futuro tampoco se toma sola.
    expect(limpiarFila({ fullName: 'Ana Pérez', joinedAt: '01/02/2030' }, '2026-10-06').doubtful.map((d) => d.field)).toEqual(['joinedAt']);
    // Lo que sí se lee no es dudoso; un saldo en cero es "sin saldo".
    const bien = limpiarFila({ fullName: 'Ana Pérez', balance: '$1,234.50 MXN ', periodEnd: '30/12/2030', joinedAt: '15/03/2021' }, '2026-10-06');
    expect(bien.doubtful).toEqual([]);
    expect(bien.balanceCents).toBe(123450n);
    expect(limpiarFila({ fullName: 'Ana Pérez', balance: '0' }, '2026-10-06')).toMatchObject({ balanceCents: null, doubtful: [] });
  });

  it('un saldo inicial por socio y por registro del sistema anterior (D18-01)', () => {
    const fila = (branchLabel: string | null, legacyCode: string | null) => ({ branchLabel, legacyCode });
    expect(fuenteDelArchivo('  Centro  ')).toBe('CENTRO');
    expect(fuenteDelArchivo('Atizapán')).toBe('ATIZAPAN');
    expect(fuenteDelArchivo(null)).toBe('GENERAL');
    // Reimportar el mismo registro: mismo código y sucursal, aunque cambie la escritura.
    expect(mismoRegistroDeSaldo(fila('Centro', 'C-331'), fila('CENTRO', 'C-331'))).toBe(true);
    // Sin código no se distingue: es el mismo saldo de esa sucursal.
    expect(mismoRegistroDeSaldo(fila('Centro', null), fila('Centro', null))).toBe(true);
    expect(mismoRegistroDeSaldo(fila('Centro', 'C-331'), fila('Centro', null))).toBe(true);
    // Un archivo sin sucursal vale para cualquiera: no se carga dos veces por mapear distinto.
    expect(mismoRegistroDeSaldo(fila(null, '331'), fila('Centro', '331'))).toBe(true);
    // La misma persona en dos sucursales, o con dos códigos, son dos saldos que se suman (§4.4).
    expect(mismoRegistroDeSaldo(fila('Centro', 'C-331'), fila('Norte', 'N-1120'))).toBe(false);
    expect(mismoRegistroDeSaldo(fila('Norte', null), fila('Centro', null))).toBe(false);
    expect(mismoRegistroDeSaldo(fila('Centro', 'C-331'), fila('Centro', 'C-77'))).toBe(false);
  });

  it('la corrección de un dato dudoso no adivina', () => {
    expect(corregirDato('balance', '65000', '2026-10-06')).toEqual({ ok: true, value: 65000n });
    expect(corregirDato('balance', '-5000', '2026-10-06')).toEqual({ ok: true, value: -5000n });
    expect(corregirDato('balance', '0', '2026-10-06')).toEqual({ ok: true, value: null });
    expect(corregirDato('balance', '650.00', '2026-10-06').ok).toBe(false);
    expect(corregirDato('periodEnd', '2027-02-28', '2026-10-06')).toEqual({ ok: true, value: '2027-02-28' });
    expect(corregirDato('periodEnd', '2027-02-31', '2026-10-06').ok).toBe(false);
    expect(corregirDato('periodEnd', '31/01/2027', '2026-10-06').ok).toBe(false);
    expect(corregirDato('joinedAt', '2030-01-01', '2026-10-06').ok).toBe(false);
    expect(corregirDato('joinedAt', null, '2026-10-06')).toEqual({ ok: true, value: null });
  });
});
