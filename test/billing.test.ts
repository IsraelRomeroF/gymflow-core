import { describe, it, expect } from 'vitest';
import {
  money, fromMajorUnits, sumMoney, addMoney, allocateAmount,
  composeAmounts, chargeBalance, deriveChargeStatus, isSettled, countsAsDebt,
  planAllocation, verifyAllocationPlan, cycleChargeKey, signupFeeKey, prorationKey,
  openingBalanceKey, reversalAmount, canReverse, requiresCashSession,
  blocksNewAttempts, requiresMembership, CHARGE_TYPE_RULES, BillingError,
  type AllocatableCharge,
} from '../src/index.js';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const ZERO = money(0n);

describe('importes de un cargo', () => {
  it('total = subtotal + impuesto − descuento', () => {
    const a = composeAmounts(fromMajorUnits('650.00'), fromMajorUnits('104.00'), fromMajorUnits('50.00'));
    expect(a.total.cents).toBe(70400n);
  });

  it('rechaza un descuento que deja el total en negativo', () => {
    expect(() => composeAmounts(fromMajorUnits('100.00'), ZERO, fromMajorUnits('150.00')))
      .toThrow(BillingError);
  });

  it('un descuento exactamente igual al total deja cero, no error', () => {
    const a = composeAmounts(fromMajorUnits('100.00'), ZERO, fromMajorUnits('100.00'));
    expect(a.total.cents).toBe(0n);
  });
});

describe('saldo y estado derivado', () => {
  const base = {
    amountTotal: fromMajorUnits('650.00'),
    allocated: ZERO,
    adjusted: ZERO,
    issued: true,
    dueDate: d('2026-10-05'),
    today: d('2026-10-01'),
  };

  it('el saldo NUNCA es negativo: un excedente no vuelve deudor al gimnasio', () => {
    const balance = chargeBalance({
      amountTotal: fromMajorUnits('650.00'),
      allocated: fromMajorUnits('800.00'),
      adjusted: ZERO,
    });
    expect(balance.cents).toBe(0n);
  });

  it('sin abonos y dentro de plazo: OPEN', () => {
    expect(deriveChargeStatus(base)).toBe('OPEN');
  });

  it('con abono parcial dentro de plazo: PARTIALLY_PAID', () => {
    expect(deriveChargeStatus({ ...base, allocated: fromMajorUnits('200.00') })).toBe('PARTIALLY_PAID');
  });

  it('saldo cero: PAID, aunque haya vencido', () => {
    expect(deriveChargeStatus({
      ...base, allocated: fromMajorUnits('650.00'), today: d('2026-12-01'),
    })).toBe('PAID');
  });

  it('pasada la fecha límite con saldo: OVERDUE', () => {
    expect(deriveChargeStatus({ ...base, today: d('2026-10-06') })).toBe('OVERDUE');
  });

  it('el mismo día del vencimiento todavía NO está vencido', () => {
    expect(deriveChargeStatus({ ...base, today: d('2026-10-05') })).toBe('OPEN');
  });

  it('sin emitir: DRAFT, aunque tuviera abonos', () => {
    expect(deriveChargeStatus({ ...base, issued: false, allocated: fromMajorUnits('100.00') })).toBe('DRAFT');
  });

  it('VOID y WRITTEN_OFF ganan sobre cualquier derivación', () => {
    expect(deriveChargeStatus({ ...base, voided: true })).toBe('VOID');
    expect(deriveChargeStatus({ ...base, writtenOff: true })).toBe('WRITTEN_OFF');
  });

  it('un ajuste (condonación) también salda el cargo', () => {
    expect(deriveChargeStatus({ ...base, adjusted: fromMajorUnits('650.00') })).toBe('PAID');
  });

  it('clasifica deuda viva y cargos cerrados', () => {
    expect(countsAsDebt('OVERDUE')).toBe(true);
    expect(countsAsDebt('PARTIALLY_PAID')).toBe(true);
    expect(countsAsDebt('PAID')).toBe(false);
    expect(countsAsDebt('DRAFT')).toBe(false);
    expect(isSettled('WRITTEN_OFF')).toBe(true);
    expect(isSettled('OVERDUE')).toBe(false);
  });
});

describe('criterio de aceptación: $650 en tres abonos', () => {
  it('queda PAID con saldo exacto y ni un centavo perdido', () => {
    const total = fromMajorUnits('650.00');
    const abonos = [fromMajorUnits('200.00'), fromMajorUnits('300.00'), fromMajorUnits('150.00')];

    let allocated = ZERO;
    const estados: string[] = [];

    for (const abono of abonos) {
      const charge: AllocatableCharge = {
        chargeId: 'c1',
        dueDate: d('2026-10-05'),
        balance: chargeBalance({ amountTotal: total, allocated, adjusted: ZERO }),
      };
      const plan = planAllocation(abono, [charge]);
      expect(verifyAllocationPlan(abono, plan)).toBe(true);
      expect(plan.unapplied.cents).toBe(0n);
      allocated = addMoney(allocated, plan.allocations[0]!.amount);
      estados.push(deriveChargeStatus({
        amountTotal: total, allocated, adjusted: ZERO,
        issued: true, dueDate: d('2026-10-05'), today: d('2026-10-01'),
      }));
    }

    expect(estados).toEqual(['PARTIALLY_PAID', 'PARTIALLY_PAID', 'PAID']);
    expect(allocated.cents).toBe(65000n);
    expect(chargeBalance({ amountTotal: total, allocated, adjusted: ZERO }).cents).toBe(0n);
  });
});

describe('criterio de aceptación: el excedente es saldo a favor', () => {
  it('nunca produce un cargo negativo', () => {
    const cargo: AllocatableCharge = { chargeId: 'c1', dueDate: d('2026-10-05'), balance: fromMajorUnits('650.00') };
    const plan = planAllocation(fromMajorUnits('1000.00'), [cargo]);

    expect(plan.allocations).toHaveLength(1);
    expect(plan.allocations[0]!.amount.cents).toBe(65000n);
    expect(plan.unapplied.cents).toBe(35000n);
    expect(plan.allocations.every((a) => a.amount.cents > 0n)).toBe(true);
    expect(verifyAllocationPlan(fromMajorUnits('1000.00'), plan)).toBe(true);
  });

  it('un pago sin cargos pendientes queda ÍNTEGRO como saldo a favor', () => {
    const plan = planAllocation(fromMajorUnits('500.00'), []);
    expect(plan.allocations).toHaveLength(0);
    expect(plan.unapplied.cents).toBe(50000n);
  });
});

describe('criterio de aceptación: repartir $1,000 entre 3', () => {
  it('suma exactamente $1,000 — el centavo sobrante no se evapora', () => {
    const partes = allocateAmount(fromMajorUnits('1000.00'), [1, 1, 1]);
    expect(partes.map((p) => p.cents)).toEqual([33334n, 33333n, 33333n]);
    expect(sumMoney(partes).cents).toBe(100000n);
  });

  it('se cumple para cualquier total entre 3 partes iguales', () => {
    for (let cents = 1n; cents <= 2000n; cents++) {
      const partes = allocateAmount(money(cents), [1, 1, 1]);
      expect(sumMoney(partes).cents).toBe(cents);
    }
  });
});

describe('orden de aplicación', () => {
  const cargos: AllocatableCharge[] = [
    { chargeId: 'nuevo',  dueDate: d('2026-10-05'), balance: fromMajorUnits('650.00') },
    { chargeId: 'viejo',  dueDate: d('2026-08-05'), balance: fromMajorUnits('650.00') },
    { chargeId: 'medio',  dueDate: d('2026-09-05'), balance: fromMajorUnits('650.00') },
  ];

  it('aplica primero a la deuda MÁS ANTIGUA', () => {
    const plan = planAllocation(fromMajorUnits('1300.00'), cargos);
    expect(plan.allocations.map((a) => a.chargeId)).toEqual(['viejo', 'medio']);
    expect(plan.unapplied.cents).toBe(0n);
  });

  it('un abono parcial deja el resto en el siguiente cargo, no repartido a prorrata', () => {
    const plan = planAllocation(fromMajorUnits('800.00'), cargos);
    expect(plan.allocations).toEqual([
      { chargeId: 'viejo', amount: money(65000n) },
      { chargeId: 'medio', amount: money(15000n) },
    ]);
  });

  it('ignora cargos ya saldados', () => {
    const plan = planAllocation(fromMajorUnits('100.00'), [
      { chargeId: 'saldado', dueDate: d('2026-01-01'), balance: ZERO },
      { chargeId: 'vivo',    dueDate: d('2026-09-05'), balance: fromMajorUnits('650.00') },
    ]);
    expect(plan.allocations.map((a) => a.chargeId)).toEqual(['vivo']);
  });

  it('desempata por id para que el reparto sea DETERMINISTA', () => {
    const mismaFecha: AllocatableCharge[] = [
      { chargeId: 'b', dueDate: d('2026-09-05'), balance: fromMajorUnits('100.00') },
      { chargeId: 'a', dueDate: d('2026-09-05'), balance: fromMajorUnits('100.00') },
    ];
    expect(planAllocation(fromMajorUnits('150.00'), mismaFecha).allocations.map((x) => x.chargeId))
      .toEqual(['a', 'b']);
  });

  it('rechaza aplicar un importe no positivo', () => {
    expect(() => planAllocation(ZERO, cargos)).toThrow(BillingError);
    expect(() => planAllocation(money(-100n), cargos)).toThrow(BillingError);
  });

  it('lo repartido más lo sobrante SIEMPRE es el pago, para cualquier importe', () => {
    for (let pesos = 1; pesos <= 300; pesos++) {
      const pago = money(BigInt(pesos) * 731n);
      const plan = planAllocation(pago, cargos);
      expect(verifyAllocationPlan(pago, plan)).toBe(true);
    }
  });
});

describe('idempotencia de la generación', () => {
  it('la clave del ciclo depende SOLO del dominio, no del instante de ejecución', () => {
    const a = cycleChargeKey('m1', d('2026-10-01'));
    const b = cycleChargeKey('m1', new Date('2026-10-01T23:59:59.999Z'));
    expect(a).toBe(b);
    expect(a).toBe('charge:m1:2026-10-01');
  });

  it('periodos distintos producen claves distintas', () => {
    expect(cycleChargeKey('m1', d('2026-10-01'))).not.toBe(cycleChargeKey('m1', d('2026-11-01')));
  });

  it('cada concepto tiene su propio espacio de claves', () => {
    const claves = [
      cycleChargeKey('m1', d('2026-10-01')),
      signupFeeKey('m1'),
      prorationKey('m1', d('2026-10-01')),
      openingBalanceKey('m1'),
    ];
    expect(new Set(claves).size).toBe(4);
  });
});

describe('tipos de cargo', () => {
  it('SOLO la cuota de periodo nace de un ciclo', () => {
    const delCiclo = Object.entries(CHARGE_TYPE_RULES).filter(([, r]) => r.generatesCycle);
    expect(delCiclo.map(([t]) => t)).toEqual(['MEMBERSHIP_PERIOD']);
  });

  it('un day pass o una venta de mostrador NO exigen membresía', () => {
    expect(requiresMembership('DAY_PASS')).toBe(false);
    expect(requiresMembership('POS_SALE')).toBe(false);
    expect(requiresMembership('MEMBERSHIP_PERIOD')).toBe(true);
  });
});

describe('reversión y estados de pago', () => {
  it('el contra-asiento es el negativo exacto', () => {
    expect(reversalAmount(fromMajorUnits('650.00')).cents).toBe(-65000n);
  });

  it('solo se revierte un pago exitoso, y una sola vez', () => {
    expect(canReverse('SUCCEEDED', false)).toEqual({ ok: true });
    expect(canReverse('SUCCEEDED', true).ok).toBe(false);
    expect(canReverse('FAILED', false).ok).toBe(false);
    expect(canReverse('UNKNOWN', false).ok).toBe(false);
  });

  it('un timeout BLOQUEA reintentos: es lo que impide el doble cobro', () => {
    expect(blocksNewAttempts('UNKNOWN')).toBe(true);
    expect(blocksNewAttempts('PROCESSING')).toBe(true);
    expect(blocksNewAttempts('REQUIRES_ACTION')).toBe(true);
    expect(blocksNewAttempts('FAILED')).toBe(false);
    expect(blocksNewAttempts('SUCCEEDED')).toBe(false);
  });

  it('efectivo y terminal exigen corte de caja; transferencia no', () => {
    expect(requiresCashSession('CASH')).toBe(true);
    expect(requiresCashSession('CARD_TERMINAL')).toBe(true);
    expect(requiresCashSession('SPEI_TRANSFER')).toBe(false);
    expect(requiresCashSession('CARD_ON_FILE')).toBe(false);
  });
});
