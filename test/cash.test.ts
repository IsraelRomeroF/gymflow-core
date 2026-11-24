import { describe, it, expect } from 'vitest';
import {
  money, fromMajorUnits, MOVEMENT_RULES, movementRequiresApproval, signedMovementAmount,
  movementSignIsValid, affectsDrawer, expectedCash, computeVariance, canClose,
  formatFolio, DISCOUNT_REASONS, isDiscountReason, discountPercentOf,
  agingBucketFor, daysOverdue, summarizeShift, CashError,
  type CashMovementType,
} from '../src/index.js';

const ZERO = money(0n);
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('movimientos de caja', () => {
  it('el retiro, el gasto y el depósito SACAN dinero del cajón', () => {
    for (const t of ['WITHDRAWAL', 'EXPENSE', 'DEPOSIT'] as CashMovementType[]) {
      expect(MOVEMENT_RULES[t].direction).toBe(-1);
    }
    expect(MOVEMENT_RULES.FLOAT_IN.direction).toBe(1);
  });

  it('todo lo que saca dinero exige aprobación; meter fondo no', () => {
    expect(movementRequiresApproval('WITHDRAWAL')).toBe(true);
    // D-15: el gasto chico ya no pide firma siempre (la pide arriba del tope: `reglaDelCajon`).
    expect(movementRequiresApproval('EXPENSE')).toBe(false);
    expect(movementRequiresApproval('DEPOSIT')).toBe(true);
    expect(movementRequiresApproval('CORRECTION')).toBe(true);
    expect(movementRequiresApproval('FLOAT_IN')).toBe(false);
  });

  it('el cajero teclea una magnitud positiva y el sistema pone el signo', () => {
    expect(signedMovementAmount('WITHDRAWAL', fromMajorUnits('2000.00')).cents).toBe(-200000n);
    expect(signedMovementAmount('FLOAT_IN', fromMajorUnits('500.00')).cents).toBe(50000n);
  });

  it('una corrección EXIGE decir si suma o resta', () => {
    expect(() => signedMovementAmount('CORRECTION', fromMajorUnits('100.00'))).toThrow(CashError);
    expect(signedMovementAmount('CORRECTION', fromMajorUnits('100.00'), -1).cents).toBe(-10000n);
    expect(signedMovementAmount('CORRECTION', fromMajorUnits('100.00'), 1).cents).toBe(10000n);
  });

  it('rechaza un importe no positivo', () => {
    expect(() => signedMovementAmount('FLOAT_IN', ZERO)).toThrow(CashError);
    expect(() => signedMovementAmount('FLOAT_IN', money(-1n))).toThrow(CashError);
  });

  it('valida la coherencia entre tipo y signo', () => {
    expect(movementSignIsValid('WITHDRAWAL', money(-100n))).toBe(true);
    expect(movementSignIsValid('WITHDRAWAL', money(100n))).toBe(false);
    expect(movementSignIsValid('FLOAT_IN', money(-100n))).toBe(false);
    expect(movementSignIsValid('CORRECTION', money(-100n))).toBe(true);
    expect(movementSignIsValid('CORRECTION', money(100n))).toBe(true);
    expect(movementSignIsValid('CORRECTION', ZERO)).toBe(false);
  });
});

describe('qué llega al cajón', () => {
  it('SOLO el efectivo', () => {
    expect(affectsDrawer('CASH')).toBe(true);
    expect(affectsDrawer('CARD_TERMINAL')).toBe(false);
    expect(affectsDrawer('SPEI_TRANSFER')).toBe(false);
    expect(affectsDrawer('CARD_ON_FILE')).toBe(false);
    expect(affectsDrawer('OXXO_REF')).toBe(false);
    expect(affectsDrawer('CREDIT_NOTE')).toBe(false);
  });

  it('el esperado suma fondo, efectivo cobrado y movimientos firmados', () => {
    const esperado = expectedCash({
      openingFloat: fromMajorUnits('1500.00'),
      cashCollected: fromMajorUnits('8650.00'),
      movements: [fromMajorUnits('-2000.00'), fromMajorUnits('-350.00'), fromMajorUnits('500.00')],
    });
    // 1500 + 8650 − 2000 − 350 + 500
    expect(esperado.cents).toBe(830000n);
  });

  it('sin movimientos, el esperado es fondo más efectivo', () => {
    expect(expectedCash({
      openingFloat: fromMajorUnits('1000.00'),
      cashCollected: fromMajorUnits('650.00'),
      movements: [],
    }).cents).toBe(165000n);
  });
});

describe('diferencia de caja', () => {
  it('negativo es FALTANTE y positivo es SOBRANTE: el signo se lee sin traducir', () => {
    expect(computeVariance(fromMajorUnits('8300.00'), fromMajorUnits('8250.00')).kind).toBe('SHORT');
    expect(computeVariance(fromMajorUnits('8300.00'), fromMajorUnits('8350.00')).kind).toBe('OVER');
    expect(computeVariance(fromMajorUnits('8300.00'), fromMajorUnits('8300.00')).kind).toBe('EXACT');
  });

  it('un faltante de $50 se reporta como −5000 centavos', () => {
    const r = computeVariance(fromMajorUnits('8300.00'), fromMajorUnits('8250.00'));
    expect(r.variance.cents).toBe(-5000n);
  });

  it('el SOBRANTE exige motivo igual que el faltante', () => {
    expect(computeVariance(fromMajorUnits('100.00'), fromMajorUnits('150.00')).requiresReason).toBe(true);
    expect(computeVariance(fromMajorUnits('100.00'), fromMajorUnits('50.00')).requiresReason).toBe(true);
    expect(computeVariance(fromMajorUnits('100.00'), fromMajorUnits('100.00')).requiresReason).toBe(false);
  });
});

describe('cierre de turno', () => {
  const base = {
    status: 'OPEN' as const,
    expected: fromMajorUnits('8300.00'),
    varianceReason: null,
  };

  it('NO se puede cerrar sin contar', () => {
    const r = canClose({ ...base, counted: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/sin contar/);
  });

  it('cuadrado y contado: cierra sin motivo', () => {
    expect(canClose({ ...base, counted: fromMajorUnits('8300.00') })).toEqual({ ok: true });
  });

  it('con faltante y sin motivo: NO cierra', () => {
    const r = canClose({ ...base, counted: fromMajorUnits('8250.00') });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/faltante/);
  });

  it('con sobrante y sin motivo: tampoco cierra', () => {
    const r = canClose({ ...base, counted: fromMajorUnits('8350.00') });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/sobrante/);
  });

  it('con diferencia y motivo: cierra', () => {
    expect(canClose({
      ...base, counted: fromMajorUnits('8250.00'), varianceReason: 'Cambio dado de más en el turno',
    })).toEqual({ ok: true });
  });

  it('un motivo en blanco NO cuenta como motivo', () => {
    expect(canClose({ ...base, counted: fromMajorUnits('8250.00'), varianceReason: '   ' }).ok).toBe(false);
  });

  it('una sesión ya cerrada no se vuelve a cerrar', () => {
    const r = canClose({ ...base, status: 'CLOSED', counted: fromMajorUnits('8300.00') });
    expect(r.ok).toBe(false);
  });
});

describe('folio', () => {
  it('es legible en voz alta y ordenable', () => {
    expect(formatFolio('CEN', 'C1', 1)).toBe('CEN-C1-000001');
    expect(formatFolio('NOR', 'C2', 123456)).toBe('NOR-C2-123456');
  });

  it('arranca en 1', () => {
    expect(() => formatFolio('CEN', 'C1', 0)).toThrow(CashError);
  });
});

describe('descuentos con motivo de catálogo', () => {
  it('el motivo sale de un catálogo cerrado, no de texto libre', () => {
    expect(isDiscountReason('ESTUDIANTE')).toBe(true);
    expect(isDiscountReason('porque si')).toBe(false);
    expect(DISCOUNT_REASONS.length).toBeGreaterThan(5);
  });

  it('calcula el porcentaje que representa el descuento', () => {
    expect(discountPercentOf(fromMajorUnits('65.00'), fromMajorUnits('650.00'))).toBe(10);
    expect(discountPercentOf(fromMajorUnits('162.50'), fromMajorUnits('650.00'))).toBe(25);
  });

  it('REDONDEA HACIA ARRIBA: 25.4% no se cuela por un límite del 25%', () => {
    // 165.10 sobre 650.00 = 25.4%
    expect(discountPercentOf(fromMajorUnits('165.10'), fromMajorUnits('650.00'))).toBeGreaterThan(25);
    // Un centavo por encima del 25% exacto ya supera el límite.
    expect(discountPercentOf(money(16251n), fromMajorUnits('650.00'))).toBeGreaterThan(25);
  });

  it('un descuento exactamente en el límite NO lo supera', () => {
    expect(discountPercentOf(money(16250n), fromMajorUnits('650.00'))).toBe(25);
  });

  it('rechaza una base no positiva y un descuento negativo', () => {
    expect(() => discountPercentOf(fromMajorUnits('10.00'), ZERO)).toThrow(CashError);
    expect(() => discountPercentOf(money(-1n), fromMajorUnits('100.00'))).toThrow(CashError);
  });
});

describe('antigüedad de la cartera', () => {
  it('un cargo no vencido no entra en ningún tramo', () => {
    expect(agingBucketFor(0)).toBeNull();
    expect(agingBucketFor(-5)).toBeNull();
  });

  it('clasifica por tramos', () => {
    expect(agingBucketFor(1)).toBe('1-30');
    expect(agingBucketFor(30)).toBe('1-30');
    expect(agingBucketFor(31)).toBe('31-60');
    expect(agingBucketFor(60)).toBe('31-60');
    expect(agingBucketFor(61)).toBe('61-90');
    expect(agingBucketFor(90)).toBe('61-90');
    expect(agingBucketFor(91)).toBe('90+');
    expect(agingBucketFor(3650)).toBe('90+');
  });

  it('los días vencidos nunca son negativos', () => {
    expect(daysOverdue(d('2026-09-01'), d('2026-09-15'))).toBe(14);
    expect(daysOverdue(d('2026-09-30'), d('2026-09-15'))).toBe(0);
  });
});

describe('resumen del turno', () => {
  it('separa por método y aísla el efectivo', () => {
    const r = summarizeShift([
      { method: 'CASH', amount: fromMajorUnits('650.00') },
      { method: 'CASH', amount: fromMajorUnits('350.00') },
      { method: 'CARD_TERMINAL', amount: fromMajorUnits('1800.00') },
      { method: 'SPEI_TRANSFER', amount: fromMajorUnits('6500.00') },
    ]);
    expect(r.cashCollected.cents).toBe(100000n);
    expect(r.byMethod.get('CARD_TERMINAL')!.cents).toBe(180000n);
    expect(r.total.cents).toBe(930000n);
    // Lo que importa: la terminal NO cuenta como efectivo.
    expect(r.cashCollected.cents).not.toBe(r.total.cents);
  });

  it('un turno sin cobros no rompe', () => {
    const r = summarizeShift([]);
    expect(r.cashCollected.cents).toBe(0n);
    expect(r.total.cents).toBe(0n);
  });

  it('un contra-asiento resta del método donde se cobró', () => {
    const r = summarizeShift([
      { method: 'CASH', amount: fromMajorUnits('650.00') },
      { method: 'CASH', amount: fromMajorUnits('-650.00') },
    ]);
    expect(r.cashCollected.cents).toBe(0n);
  });
});
