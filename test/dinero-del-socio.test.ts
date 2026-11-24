import { describe, expect, it } from 'vitest';
import {
  MINUTOS_DE_APARTADO, TOPE_FONDO_Y_GASTO_CHICO_CENTS, TOPE_RETIRO_POR_TURNO_CENTS, UNLIMITED_LIMITS,
  apartadoDeClaseSuelta, apartadoVencido, can, cuotaAlCerrar, mensualidadDe, perdonSinFirma, reglaDelCajon, topeDeRetiroDelPuesto,
  type Grant, type RoleLimits, type TenantContext,
} from '../src/index.js';

const ORG = '0193d6c0-0000-7000-8000-0000000000a1';
const YO = '0193d6c0-0000-7000-8000-0000000000b1';
const DUENA = '0193d6c0-0000-7000-8000-0000000000b2';
const ctx = (grants: Grant[], limits: Partial<RoleLimits> = {}): TenantContext => ({
  organizationId: ORG, actorType: 'USER', actorUserId: YO, grants, limits: { ...UNLIMITED_LIMITS, ...limits }, requestId: 'r',
});
const dia = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('D-12 · una mensualidad del socio', () => {
  it('un plan mensual vale su precio', () => {
    expect(mensualidadDe(60_000n, { unit: 'MONTH', value: 1 })).toBe(60_000n);
  });
  it('una anualidad se divide entre sus doce meses (redondeo al centavo)', () => {
    expect(mensualidadDe(650_000n, { unit: 'MONTH', value: 12 })).toBe(54_167n);
    expect(mensualidadDe(165_000n, { unit: 'MONTH', value: 3 })).toBe(55_000n);
  });
  it('una semana o una visita valen su precio; 90 días se llevan a 30', () => {
    expect(mensualidadDe(20_000n, { unit: 'WEEK', value: 1 })).toBe(20_000n);
    expect(mensualidadDe(8_000n, { unit: 'DAY', value: 1 })).toBe(8_000n);
    expect(mensualidadDe(90_000n, { unit: 'VISIT', value: 10 })).toBe(90_000n);
    expect(mensualidadDe(150_000n, { unit: 'DAY', value: 90 })).toBe(50_000n);
  });
  it('sin precio no hay mensualidad', () => {
    expect(mensualidadDe(0n, { unit: 'MONTH', value: 1 })).toBe(0n);
  });
});

describe('D-12 · cuánto se perdona sin firma', () => {
  const mensualidadCents = 60_000n;
  it('justo una mensualidad pasa sin firma; un peso más, no', () => {
    expect(perdonSinFirma({ mensualidadCents, perdonadoSinFirmaCents: 0n, montoCents: 60_000n })).toEqual({ disponibleCents: 60_000n, sinFirma: true });
    expect(perdonSinFirma({ mensualidadCents, perdonadoSinFirmaCents: 0n, montoCents: 60_100n }).sinFirma).toBe(false);
    expect(perdonSinFirma({ mensualidadCents, perdonadoSinFirmaCents: 0n, montoCents: 60_001n }).sinFirma).toBe(false);
  });
  it('lo ya perdonado sin firma en la ventana gasta el tope', () => {
    expect(perdonSinFirma({ mensualidadCents, perdonadoSinFirmaCents: 40_000n, montoCents: 20_000n })).toEqual({ disponibleCents: 20_000n, sinFirma: true });
    expect(perdonSinFirma({ mensualidadCents, perdonadoSinFirmaCents: 40_000n, montoCents: 20_100n }).sinFirma).toBe(false);
    expect(perdonSinFirma({ mensualidadCents, perdonadoSinFirmaCents: 60_000n, montoCents: 1n })).toEqual({ disponibleCents: 0n, sinFirma: false });
    expect(perdonSinFirma({ mensualidadCents, perdonadoSinFirmaCents: 90_000n, montoCents: 1n }).disponibleCents).toBe(0n);
  });
  it('sin mensualidad conocida, todo perdón lleva firma', () => {
    expect(perdonSinFirma({ mensualidadCents: null, perdonadoSinFirmaCents: 0n, montoCents: 100n })).toEqual({ disponibleCents: 0n, sinFirma: false });
  });
  it('un importe de cero no es un perdón', () => {
    expect(perdonSinFirma({ mensualidadCents, perdonadoSinFirmaCents: 0n, montoCents: 0n }).sinFirma).toBe(false);
  });
});

describe('D-12 · can() con el tope del socio', () => {
  const gerencia = ctx([{ permission: 'billing:waiver:apply', branchId: null }]);
  const base = { organizationId: ORG, reason: 'Incapacidad' };
  it('dentro de lo disponible del socio, la gerencia perdona sola', () => {
    expect(can(gerencia, 'billing:waiver:apply', { ...base, amountCents: 60_000n, waiverAllowanceCents: 60_000n }).outcome).toBe('ALLOW');
  });
  it('un peso arriba pide la firma de la dueña, y con ella pasa', () => {
    expect(can(gerencia, 'billing:waiver:apply', { ...base, amountCents: 60_100n, waiverAllowanceCents: 60_000n }).outcome).toBe('REQUIRE_APPROVAL');
    expect(can(gerencia, 'billing:waiver:apply', { ...base, amountCents: 60_100n, waiverAllowanceCents: 60_000n, approvedByUserId: DUENA }).outcome).toBe('ALLOW');
  });
  it('si la ruta no dice cuánto le queda al socio, pide firma siempre', () => {
    expect(can(gerencia, 'billing:waiver:apply', { ...base, amountCents: 100n }).outcome).toBe('REQUIRE_APPROVAL');
  });
  it('el tope del puesto sigue siendo un techo, y en cero el puesto no perdona ni con firma', () => {
    const conTecho = ctx([{ permission: 'billing:waiver:apply', branchId: null }], { maxWaiverAmountCents: 30_000n });
    expect(can(conTecho, 'billing:waiver:apply', { ...base, amountCents: 30_000n, waiverAllowanceCents: 60_000n }).outcome).toBe('ALLOW');
    expect(can(conTecho, 'billing:waiver:apply', { ...base, amountCents: 30_100n, waiverAllowanceCents: 60_000n }).outcome).toBe('REQUIRE_APPROVAL');
    const recepcion = ctx([{ permission: 'billing:waiver:apply', branchId: null }], { maxWaiverAmountCents: 0n });
    expect(can(recepcion, 'billing:waiver:apply', { ...base, amountCents: 100n, waiverAllowanceCents: 60_000n, approvedByUserId: DUENA }).outcome).toBe('DENY');
  });
  it('nadie se firma a sí mismo', () => {
    expect(can(gerencia, 'billing:waiver:apply', { ...base, amountCents: 90_000n, waiverAllowanceCents: 0n, approvedByUserId: YO }).outcome).toBe('DENY');
  });
});

describe('Choque 5 · recepción nunca descuenta más de 10 %', () => {
  const base = { organizationId: ORG, reason: 'Promoción' };
  const recepcion = ctx([{ permission: 'billing:discount:apply', branchId: null }], { maxDiscountPercent: 10, maxWaiverAmountCents: 0n });
  const gerencia = ctx([{ permission: 'billing:discount:apply', branchId: null }], { maxDiscountPercent: 30 });
  it('10 % pasa; 10.01 % se niega aunque traiga la firma de la dueña', () => {
    expect(can(recepcion, 'billing:discount:apply', { ...base, percent: 10 }).outcome).toBe('ALLOW');
    const arriba = can(recepcion, 'billing:discount:apply', { ...base, percent: 10.01 });
    expect(arriba.outcome).toBe('DENY');
    const firmado = can(recepcion, 'billing:discount:apply', { ...base, percent: 10.01, approvedByUserId: DUENA });
    expect(firmado.outcome).toBe('DENY');
    if (firmado.outcome === 'DENY') expect(firmado.code).toBe('LIMIT_FORBIDDEN');
  });
  it('la gerencia: 30 % sola; 30.01 % con firma', () => {
    expect(can(gerencia, 'billing:discount:apply', { ...base, percent: 30 }).outcome).toBe('ALLOW');
    expect(can(gerencia, 'billing:discount:apply', { ...base, percent: 30.01 }).outcome).toBe('REQUIRE_APPROVAL');
    expect(can(gerencia, 'billing:discount:apply', { ...base, percent: 30.01, approvedByUserId: DUENA }).outcome).toBe('ALLOW');
  });
});

describe('D-12 · qué pasa con una cuota sin pagos al cerrar la membresía', () => {
  const today = dia('2026-11-23');
  it('la del periodo que ya empezó se queda como deuda', () => {
    expect(cuotaAlCerrar({ nuncaActiva: false, periodStart: dia('2026-11-01'), today })).toBe('KEEP');
    expect(cuotaAlCerrar({ nuncaActiva: false, periodStart: today, today })).toBe('KEEP');
    expect(cuotaAlCerrar({ nuncaActiva: false, periodStart: null, today })).toBe('KEEP');
  });
  it('la de un periodo que no ha empezado se anula por regla', () => {
    expect(cuotaAlCerrar({ nuncaActiva: false, periodStart: dia('2026-11-24'), today })).toBe('VOID');
  });
  it('la de una venta que nunca se cobró ni dio acceso se anula por regla', () => {
    expect(cuotaAlCerrar({ nuncaActiva: true, periodStart: dia('2026-11-01'), today })).toBe('VOID');
  });
});

describe('D-15 · el efectivo del cajón', () => {
  const base = {
    sinFirmaEnElTurnoCents: 0n, retiradoEnElTurnoCents: 0n,
    topeChicoCents: TOPE_FONDO_Y_GASTO_CHICO_CENTS, topeRetiroCents: TOPE_RETIRO_POR_TURNO_CENTS, firmado: false,
  };
  const recepcion = { ...base, puesto: 'CON_TOPE' as const };
  const gerencia = { ...base, puesto: 'SIN_TOPE' as const };

  it('los topes de fábrica son $500 y $5,000', () => {
    expect(TOPE_FONDO_Y_GASTO_CHICO_CENTS).toBe(50_000n);
    expect(TOPE_RETIRO_POR_TURNO_CENTS).toBe(500_000n);
  });
  it('un gasto de $500 justos pasa sin firma; $501 pide firma y con ella pasa (recepción y gerencia)', () => {
    for (const quien of [recepcion, gerencia]) {
      expect(reglaDelCajon({ ...quien, tipo: 'EXPENSE', montoCents: 50_000n }).outcome).toBe('ALLOW');
      expect(reglaDelCajon({ ...quien, tipo: 'EXPENSE', montoCents: 50_100n }).outcome).toBe('REQUIRE_APPROVAL');
      expect(reglaDelCajon({ ...quien, tipo: 'EXPENSE', montoCents: 50_100n, firmado: true }).outcome).toBe('ALLOW');
    }
  });
  it('el tope del gasto chico es por turno: $400 más $100 pasa, $400 más $101 pide firma', () => {
    expect(reglaDelCajon({ ...recepcion, tipo: 'EXPENSE', montoCents: 10_000n, sinFirmaEnElTurnoCents: 40_000n }).outcome).toBe('ALLOW');
    expect(reglaDelCajon({ ...recepcion, tipo: 'EXPENSE', montoCents: 10_100n, sinFirmaEnElTurnoCents: 40_000n }).outcome).toBe('REQUIRE_APPROVAL');
  });
  it('la entrada de fondo sigue la misma regla que el gasto', () => {
    expect(reglaDelCajon({ ...recepcion, tipo: 'FLOAT_IN', montoCents: 50_000n }).outcome).toBe('ALLOW');
    expect(reglaDelCajon({ ...recepcion, tipo: 'FLOAT_IN', montoCents: 50_100n }).outcome).toBe('REQUIRE_APPROVAL');
  });
  it('retirar o depositar siempre pide firma, del importe que sea', () => {
    for (const tipo of ['WITHDRAWAL', 'DEPOSIT'] as const) {
      expect(reglaDelCajon({ ...recepcion, tipo, montoCents: 100n }).outcome).toBe('REQUIRE_APPROVAL');
      expect(reglaDelCajon({ ...gerencia, tipo, montoCents: 100n }).outcome).toBe('REQUIRE_APPROVAL');
      expect(reglaDelCajon({ ...recepcion, tipo, montoCents: 100n, firmado: true }).outcome).toBe('ALLOW');
    }
  });
  it('recepción: $5,000 justos por turno con firma; un peso más, ni con firma', () => {
    expect(reglaDelCajon({ ...recepcion, tipo: 'WITHDRAWAL', montoCents: 500_000n, firmado: true }).outcome).toBe('ALLOW');
    expect(reglaDelCajon({ ...recepcion, tipo: 'WITHDRAWAL', montoCents: 500_100n, firmado: true }).outcome).toBe('DENY');
    // Acumulado en el turno: ya retiró $3,000; $2,000 más pasa, $2,001 no.
    expect(reglaDelCajon({ ...recepcion, tipo: 'DEPOSIT', montoCents: 200_000n, retiradoEnElTurnoCents: 300_000n, firmado: true }).outcome).toBe('ALLOW');
    expect(reglaDelCajon({ ...recepcion, tipo: 'DEPOSIT', montoCents: 200_100n, retiradoEnElTurnoCents: 300_000n, firmado: true }).outcome).toBe('DENY');
    // Y sin firma, arriba del tope se niega antes de pedirla.
    expect(reglaDelCajon({ ...recepcion, tipo: 'WITHDRAWAL', montoCents: 500_100n }).outcome).toBe('DENY');
  });
  it('la gerencia no tiene tope por turno, pero siempre firma la dueña', () => {
    expect(reglaDelCajon({ ...gerencia, tipo: 'WITHDRAWAL', montoCents: 5_000_000n }).outcome).toBe('REQUIRE_APPROVAL');
    expect(reglaDelCajon({ ...gerencia, tipo: 'WITHDRAWAL', montoCents: 5_000_000n, firmado: true }).outcome).toBe('ALLOW');
  });
  it('quien no retira no retira; y la corrección es solo de la gerencia, con firma', () => {
    expect(reglaDelCajon({ ...base, puesto: 'NO_PUEDE', tipo: 'WITHDRAWAL', montoCents: 100n, firmado: true }).outcome).toBe('DENY');
    expect(reglaDelCajon({ ...recepcion, tipo: 'CORRECTION', montoCents: 100n, firmado: true }).outcome).toBe('DENY');
    expect(reglaDelCajon({ ...gerencia, tipo: 'CORRECTION', montoCents: 100n }).outcome).toBe('REQUIRE_APPROVAL');
    expect(reglaDelCajon({ ...gerencia, tipo: 'CORRECTION', montoCents: 100n, firmado: true }).outcome).toBe('ALLOW');
  });
  it('el tope del gimnasio manda: con $800 de tope chico, $800 pasa y $801 no', () => {
    expect(reglaDelCajon({ ...recepcion, topeChicoCents: 80_000n, tipo: 'EXPENSE', montoCents: 80_000n }).outcome).toBe('ALLOW');
    expect(reglaDelCajon({ ...recepcion, topeChicoCents: 80_000n, tipo: 'EXPENSE', montoCents: 80_100n }).outcome).toBe('REQUIRE_APPROVAL');
  });
  it('el puesto se lee de su tope de retiro', () => {
    expect(topeDeRetiroDelPuesto(null)).toBe('SIN_TOPE');
    expect(topeDeRetiroDelPuesto(0n)).toBe('NO_PUEDE');
    expect(topeDeRetiroDelPuesto(500_000n)).toBe('CON_TOPE');
  });
  it('can(): el retiro ya no se decide por importe; solo se niega al puesto que no retira', () => {
    const quien = (max: bigint | null) => ctx([{ permission: 'cash:withdraw', branchId: null }], { maxCashWithdrawalCents: max });
    expect(can(quien(500_000n), 'cash:withdraw', { organizationId: ORG, reason: 'Corte parcial', amountCents: 900_000n }).outcome).toBe('ALLOW');
    expect(can(quien(null), 'cash:withdraw', { organizationId: ORG, reason: 'Corte parcial' }).outcome).toBe('ALLOW');
    expect(can(quien(0n), 'cash:withdraw', { organizationId: ORG, reason: 'Corte parcial', amountCents: 100n }).outcome).toBe('DENY');
  });
});

describe('D-16 · la clase suelta apartada sin pagar', () => {
  const startsAt = new Date('2026-11-24T19:00:00.000Z');
  it('se guarda hasta una hora antes', () => {
    const r = apartadoDeClaseSuelta({ startsAt, now: new Date('2026-11-24T10:00:00.000Z'), debeSuMensualidad: false });
    expect(r).toEqual({ outcome: 'HOLD', holdUntil: new Date('2026-11-24T18:00:00.000Z') });
  });
  it('un minuto antes de la hora todavía se aparta; a la hora justa ya solo pagando', () => {
    expect(apartadoDeClaseSuelta({ startsAt, now: new Date('2026-11-24T17:59:00.000Z'), debeSuMensualidad: false }).outcome).toBe('HOLD');
    expect(apartadoDeClaseSuelta({ startsAt, now: new Date('2026-11-24T18:00:00.000Z'), debeSuMensualidad: false })).toEqual({ outcome: 'PAY_NOW', porQue: 'HOLD_CLOSED' });
    expect(apartadoDeClaseSuelta({ startsAt, now: new Date('2026-11-24T18:30:00.000Z'), debeSuMensualidad: false })).toEqual({ outcome: 'PAY_NOW', porQue: 'HOLD_CLOSED' });
  });
  it('quien debe su mensualidad solo la aparta pagando en el momento, falte lo que falte', () => {
    expect(apartadoDeClaseSuelta({ startsAt, now: new Date('2026-11-20T10:00:00.000Z'), debeSuMensualidad: true })).toEqual({ outcome: 'PAY_NOW', porQue: 'OWES_MEMBERSHIP' });
  });
  it('el apartado vence justo a su hora, no antes', () => {
    const hold = new Date('2026-11-24T18:00:00.000Z');
    expect(apartadoVencido(hold, new Date('2026-11-24T17:59:59.999Z'))).toBe(false);
    expect(apartadoVencido(hold, hold)).toBe(true);
    expect(apartadoVencido(null, hold)).toBe(false);
    expect(MINUTOS_DE_APARTADO).toBe(60);
  });
});
