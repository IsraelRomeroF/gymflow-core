import { describe, it, expect } from 'vitest';
import {
  paidThrough, autoRenewFor, canAutoRenew, descuadreQueCuenta, descuadreDeCortes, minimumToSettle, money,
  type CuotaDePeriodo, type ChargeStatus, type AllocatableCharge,
} from '../src/index.js';

/**
 * Auditoría 8, bloque 0.6 («dinero falso»): las reglas puras que deciden lo
 * que se le dice al socio y a la dueña sobre su dinero.
 */
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const dia = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null);

function cuota(inicio: string, fin: string, estado: ChargeStatus, importe = 65_000n, pagado = 0n, ajustado = 0n): CuotaDePeriodo {
  return { periodStart: d(inicio), periodEnd: d(fin), status: estado, amountCents: importe, allocatedCents: pagado, adjustedCents: ajustado };
}
const pagada = (inicio: string, fin: string) => cuota(inicio, fin, 'PAID', 65_000n, 65_000n);

describe('pagado hasta (3-01, 4-03)', () => {
  it('suspendida con la cuota del mes vencida: pagó hasta el día antes de esa cuota, no hasta el fin del periodo', () => {
    // CEN-00027: la última pagada terminó el 10 nov; debe 11 nov – 10 dic.
    const r = paidThrough([pagada('2026-10-11', '2026-11-11'), cuota('2026-11-11', '2026-12-11', 'OVERDUE')]);
    expect(dia(r)).toBe('2026-11-10');
  });

  it('al corriente: el último día del periodo más lejano que está saldado', () => {
    expect(dia(paidThrough([pagada('2026-10-11', '2026-11-11'), pagada('2026-11-11', '2026-12-11')]))).toBe('2026-12-10');
  });

  it('un abono parcial no basta: la cuota sigue debiéndose', () => {
    const r = paidThrough([pagada('2026-10-11', '2026-11-11'), cuota('2026-11-11', '2026-12-11', 'PARTIALLY_PAID', 65_000n, 30_000n)]);
    expect(dia(r)).toBe('2026-11-10');
  });

  it('una cuota condonada está saldada; una anulada no cuenta; una castigada no está pagada', () => {
    const condonada = cuota('2026-11-11', '2026-12-11', 'PAID', 65_000n, 0n, 65_000n);
    expect(dia(paidThrough([pagada('2026-10-11', '2026-11-11'), condonada]))).toBe('2026-12-10');
    const anulada = cuota('2026-11-11', '2026-12-11', 'VOID');
    expect(dia(paidThrough([pagada('2026-10-11', '2026-11-11'), anulada]))).toBe('2026-11-10');
    const castigada = cuota('2026-11-11', '2026-12-11', 'WRITTEN_OFF');
    expect(dia(paidThrough([pagada('2026-10-11', '2026-11-11'), castigada]))).toBe('2026-11-10');
  });

  it('sin ninguna cuota pagada antes de la que debe, no hay «pagado hasta»', () => {
    expect(paidThrough([cuota('2026-11-11', '2026-12-11', 'OPEN')])).toBeNull();
    expect(paidThrough([])).toBeNull();
  });

  it('el estado guardado no basta: manda el saldo (una cuota con saldo cero está saldada)', () => {
    const conSaldoCero = cuota('2026-11-11', '2026-12-11', 'OPEN', 65_000n, 65_000n);
    expect(dia(paidThrough([pagada('2026-10-11', '2026-11-11'), conSaldoCero]))).toBe('2026-12-10');
  });

  it('cambio de plan: lo pagado del plan anterior llega hasta el día en que empieza la cuota nueva que se debe', () => {
    const r = paidThrough([pagada('2026-11-11', '2026-12-11'), cuota('2026-11-20', '2026-12-11', 'OPEN')]);
    expect(dia(r)).toBe('2026-11-19');
  });

  it('al volver de congelar, la cuota pagada del periodo en curso cubre hasta su fin recorrido', () => {
    // Pagó 11 nov – 10 dic; congeló 15 días: el periodo ahora termina el 26 dic.
    const actual = { start: d('2026-11-11'), end: d('2026-12-26') };
    expect(dia(paidThrough([pagada('2026-11-11', '2026-12-11')], actual))).toBe('2026-12-25');
    // Si esa cuota no está pagada, no hay nada que extender.
    expect(dia(paidThrough([pagada('2026-10-11', '2026-11-11'), cuota('2026-11-11', '2026-12-11', 'OPEN')], actual))).toBe('2026-11-10');
  });

  it('un hueco (meses olvidados) no se cuenta como pagado', () => {
    const r = paidThrough([cuota('2026-01-01', '2026-02-01', 'PAID', 65_000n, 0n, 65_000n), cuota('2026-03-15', '2026-04-15', 'OPEN')]);
    expect(dia(r)).toBe('2026-01-31');
  });
});

describe('lo mínimo para quedar al corriente (4-09)', () => {
  const c = (id: string, vence: string, saldo: bigint): AllocatableCharge => ({ chargeId: id, dueDate: d(vence), balance: money(saldo) });

  it('un abono de $300 no salda una cuota de $650: hacen falta $650', () => {
    expect(minimumToSettle([c('a', '2026-11-11', 65_000n)], new Set(['a']), money(0n)).cents).toBe(65_000n);
  });

  it('el saldo a favor se aplica primero: con $200 a favor bastan $450', () => {
    expect(minimumToSettle([c('a', '2026-11-11', 65_000n)], new Set(['a']), money(20_000n)).cents).toBe(45_000n);
  });

  it('lo más antiguo se cubre antes: una clase vieja sin pagar también hay que cobrarla', () => {
    const cargos = [c('clase', '2026-10-01', 10_000n), c('cuota', '2026-11-11', 65_000n), c('nueva', '2026-12-11', 65_000n)];
    expect(minimumToSettle(cargos, new Set(['cuota']), money(0n)).cents).toBe(75_000n);
  });

  it('si el saldo a favor alcanza, no hay nada que cobrar', () => {
    expect(minimumToSettle([c('a', '2026-11-11', 65_000n)], new Set(['a']), money(90_000n)).cents).toBe(0n);
    expect(minimumToSettle([c('a', '2026-11-11', 0n)], new Set(['a']), money(0n)).cents).toBe(0n);
  });
});

describe('autorrenovación por modelo de plan (4-01, 4-02, D-14)', () => {
  it('la visita suelta y el paquete nunca se renuevan solos, aunque se pida', () => {
    expect(autoRenewFor('DAY_PASS', true, true)).toBe(false);
    expect(autoRenewFor('VISIT_PACK', undefined, true)).toBe(false);
    expect(canAutoRenew('DAY_PASS')).toBe(false);
  });

  it('el pago anticipado nace sin renovarse; solo se renueva si se eligió en la venta', () => {
    expect(autoRenewFor('PREPAID_PERIOD', undefined, true)).toBe(false);
    expect(autoRenewFor('PREPAID_PERIOD', true, false)).toBe(true);
    expect(canAutoRenew('PREPAID_PERIOD')).toBe(true);
  });

  it('el recurrente hace lo que se eligió y, si nada, lo del plan', () => {
    expect(autoRenewFor('RECURRING', undefined, true)).toBe(true);
    expect(autoRenewFor('RECURRING', undefined, false)).toBe(false);
    expect(autoRenewFor('RECURRING', false, true)).toBe(false);
    expect(autoRenewFor('RECURRING', undefined, null)).toBe(true);
  });
});

describe('el descuadre que cuenta (13-05, 14-09)', () => {
  it('de un corte cuenta su faltante; el sobrante se informa y no suma', () => {
    expect(descuadreQueCuenta(-13_000n)).toEqual({ faltanteCents: -13_000n, sobranteCents: 0n });
    expect(descuadreQueCuenta(5_000n)).toEqual({ faltanteCents: 0n, sobranteCents: 5_000n });
    expect(descuadreQueCuenta(0n)).toEqual({ faltanteCents: 0n, sobranteCents: 0n });
    expect(descuadreQueCuenta(null)).toEqual({ faltanteCents: 0n, sobranteCents: 0n });
  });

  it('corte por corte: el sobrante de una caja no tapa el faltante de otra el mismo día', () => {
    // C1 faltó $150, C2 sobró $200: el día NO es «+$50».
    expect(descuadreDeCortes([-15_000n, 20_000n])).toEqual({ faltanteCents: -15_000n, sobranteCents: 20_000n });
  });

  it('el caso de la auditoría: 1–17 nov, $270 de faltantes y $90 de sobrantes', () => {
    const r = descuadreDeCortes([4_000n, -11_000n, -3_000n, -13_000n, 5_000n]);
    expect(r.faltanteCents).toBe(-27_000n);
    expect(r.sobranteCents).toBe(9_000n);
  });
});
