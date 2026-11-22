import { describe, it, expect } from 'vitest';
import { precioDeCuota, liquidadoPor, canEnterAfterPayment, minimumToSettle, money, type CargoParaEntrar } from '../src/index.js';

/** Fase 1, bloque 1.3 («Dinero»): las reglas puras de precio y liquidación. */
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('precioDeCuota: una sola regla para la cuota, el adeudo y el cambio de plan (16-04)', () => {
  it('manda el precio pactado aunque el de lista haya subido o la sede tenga otro', () => {
    expect(precioDeCuota({ agreedPriceCents: 71_500n, planPriceCents: 89_000n, branchPriceCents: 80_000n })).toBe(71_500n);
  });
  it('un pactado de $0 (cortesía) es un precio, no «sin precio»', () => {
    expect(precioDeCuota({ agreedPriceCents: 0n, planPriceCents: 89_000n })).toBe(0n);
  });
  it('sin pactado, el precio propio de la sede', () => {
    expect(precioDeCuota({ agreedPriceCents: null, planPriceCents: 89_000n, branchPriceCents: 80_000n })).toBe(80_000n);
  });
  it('sin pactado ni precio propio, el de lista: la sede que dejó de venderlo no rompe la renovación', () => {
    expect(precioDeCuota({ agreedPriceCents: null, planPriceCents: 89_000n, branchPriceCents: null })).toBe(89_000n);
    expect(precioDeCuota({ agreedPriceCents: undefined, planPriceCents: 89_000n })).toBe(89_000n);
  });
});

describe('liquidadoPor: con qué quedó saldado un cargo', () => {
  const cargo = (status: string, allocated: bigint, adjustments: Array<[string, bigint]> = [], amount = 65_000n) => ({
    status, amountCents: amount, allocatedCents: allocated,
    adjustments: adjustments.map(([adjustmentType, amountCents]) => ({ adjustmentType, amountCents })),
  });
  it('pagado completo', () => expect(liquidadoPor(cargo('PAID', 65_000n))).toBe('PAYMENT'));
  it('pagado con descuento: lo saldó el pago', () => expect(liquidadoPor(cargo('PAID', 55_000n, [['DISCOUNT', 10_000n]]))).toBe('PAYMENT'));
  it('condonado entero: nadie pagó', () => expect(liquidadoPor(cargo('PAID', 0n, [['WAIVER', 65_000n]]))).toBe('WAIVER'));
  it('descuento del 100 %', () => expect(liquidadoPor(cargo('PAID', 0n, [['DISCOUNT', 65_000n]]))).toBe('WAIVER'));
  it('cubierto por el crédito del plan anterior', () => expect(liquidadoPor(cargo('PAID', 0n, [['CORRECTION', 65_000n]]))).toBe('REFUND_CORRECTION'));
  it('abono parcial: no está saldado', () => expect(liquidadoPor(cargo('PARTIALLY_PAID', 30_000n))).toBeNull());
  it('una reversa de ajuste (negativa) lo deja debiendo', () => {
    expect(liquidadoPor(cargo('OPEN', 0n, [['WAIVER', 65_000n], ['WAIVER', -65_000n]]))).toBeNull();
  });
  it('anulado o castigado no está saldado aunque su saldo dé cero', () => {
    expect(liquidadoPor(cargo('VOID', 0n))).toBeNull();
    expect(liquidadoPor(cargo('WRITTEN_OFF', 65_000n))).toBeNull();
  });
  it('un cargo de $0 nació saldado: no lo liquidó nadie', () => expect(liquidadoPor(cargo('PAID', 0n, [], 0n))).toBeNull());
});

describe('canEnterAfterPayment: lo que la caja le dice al socio (4-09)', () => {
  const c = (id: string, due: string, balance: bigint, blocks = true): CargoParaEntrar => ({ chargeId: id, dueDate: d(due), balanceCents: balance, blocksAccess: blocks });
  const base = { allowAccessWhilePastDue: false, creditCents: 0n, paymentCents: 0n };

  it('activa: entra, sin importe', () => {
    expect(canEnterAfterPayment({ ...base, status: 'ACTIVE', charges: [c('a', '2026-11-19', 65_000n)] })).toEqual({ canEnter: true, toEnterCents: null });
  });
  it('en mora: depende de la política del gimnasio', () => {
    const cargos = [c('a', '2026-11-15', 65_000n)];
    expect(canEnterAfterPayment({ ...base, status: 'PAST_DUE', allowAccessWhilePastDue: true, charges: cargos }).canEnter).toBe(true);
    expect(canEnterAfterPayment({ ...base, status: 'PAST_DUE', charges: cargos })).toEqual({ canEnter: false, toEnterCents: 65_000n });
  });
  it('suspendida: el abono que no alcanza dice cuánto falta además del abono', () => {
    const cargos = [c('a', '2026-11-15', 65_000n)];
    expect(canEnterAfterPayment({ ...base, status: 'SUSPENDED', charges: cargos, paymentCents: 30_000n })).toEqual({ canEnter: false, toEnterCents: 35_000n });
    expect(canEnterAfterPayment({ ...base, status: 'SUSPENDED', charges: cargos, paymentCents: 65_000n })).toEqual({ canEnter: true, toEnterCents: 0n });
  });
  it('el saldo a favor se aplica primero', () => {
    expect(canEnterAfterPayment({ ...base, status: 'SUSPENDED', charges: [c('a', '2026-11-15', 65_000n)], creditCents: 20_000n, paymentCents: 45_000n }))
      .toEqual({ canEnter: true, toEnterCents: 0n });
  });
  it('lo más antiguo se cubre antes, aunque no bloquee: una botella de octubre va primero que la cuota', () => {
    const cargos = [c('tienda', '2026-10-01', 5_000n, false), c('cuota', '2026-11-15', 65_000n), c('futura', '2026-12-15', 65_000n, false)];
    expect(canEnterAfterPayment({ ...base, status: 'SUSPENDED', charges: cargos, paymentCents: 65_000n })).toEqual({ canEnter: false, toEnterCents: 5_000n });
    expect(canEnterAfterPayment({ ...base, status: 'SUSPENDED', charges: cargos, paymentCents: 70_000n })).toEqual({ canEnter: true, toEnterCents: 0n });
  });
  it('sin pago coincide con `minimumToSettle` (la regla que ya usaba el estado de cuenta)', () => {
    const cargos = [c('tienda', '2026-10-01', 5_000n, false), c('cuota', '2026-11-15', 65_000n)];
    const r = canEnterAfterPayment({ ...base, status: 'PENDING', charges: cargos, creditCents: 10_000n });
    const viejo = minimumToSettle(cargos.map((x) => ({ chargeId: x.chargeId, dueDate: x.dueDate, balance: money(x.balanceCents) })), new Set(['cuota']), money(10_000n));
    expect(r.toEnterCents).toBe(viejo.cents);
  });
  it('por activar sin nada abierto que la bloquee: un cobro no la abre', () => {
    expect(canEnterAfterPayment({ ...base, status: 'PENDING', charges: [c('tienda', '2026-10-01', 5_000n, false)], paymentCents: 5_000n })).toEqual({ canEnter: false, toEnterCents: null });
  });
  it('congelada, cancelada o vencida: un cobro no la abre', () => {
    for (const status of ['FROZEN', 'CANCELED', 'EXPIRED'] as const) {
      expect(canEnterAfterPayment({ ...base, status, charges: [c('a', '2026-11-15', 65_000n)], paymentCents: 65_000n })).toEqual({ canEnter: false, toEnterCents: null });
    }
  });
});
