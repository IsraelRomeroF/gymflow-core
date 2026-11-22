import { describe, it, expect } from 'vitest';
import {
  money, fromMajorUnits, monthlyValueOf, splitPrepaid, accruedInWindow,
  recognitionOf, RECOGNITION, rankBranches, delinquencyRate,
  type BranchKpi, type ChargeType,
} from '../src/index.js';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('reconocimiento por tipo de cargo', () => {
  it('la cuota de periodo se gana A LO LARGO del periodo', () => {
    expect(recognitionOf('MEMBERSHIP_PERIOD')).toBe('OVER_PERIOD');
  });

  it('el paquete de visitas se gana AL CONSUMIRSE, no al cobrarse', () => {
    expect(recognitionOf('VISIT_PACK')).toBe('ON_CONSUMPTION');
  });

  it('lo que se entrega en el acto se gana en el acto', () => {
    for (const t of ['DAY_PASS', 'CLASS_SINGLE', 'POS_SALE', 'SIGNUP_FEE'] as ChargeType[]) {
      expect(recognitionOf(t), t).toBe('IMMEDIATE');
    }
  });

  it('el saldo MIGRADO no es ingreso: lo ganó el sistema anterior', () => {
    expect(recognitionOf('OPENING_BALANCE')).toBe('EXCLUDED');
  });

  it('todo tipo de cargo tiene regla: no hay ingreso sin clasificar', () => {
    expect(Object.values(RECOGNITION).every((r) => r !== undefined)).toBe(true);
    expect(Object.keys(RECOGNITION)).toHaveLength(10);
  });
});

describe('valor mensual equivalente', () => {
  it('un plan mensual vale su precio', () => {
    expect(monthlyValueOf(fromMajorUnits('650.00'), { unit: 'MONTH', value: 1 })!.cents).toBe(65000n);
  });

  it('un trimestral de $1,800 vale $600 al mes', () => {
    expect(monthlyValueOf(fromMajorUnits('1800.00'), { unit: 'MONTH', value: 3 })!.cents).toBe(60000n);
  });

  it('una anualidad de $6,500 vale $541.67 al mes', () => {
    expect(monthlyValueOf(fromMajorUnits('6500.00'), { unit: 'MONTH', value: 12 })!.cents).toBe(54167n);
  });

  it('normaliza semanas y días con la longitud MEDIA del mes', () => {
    // 30.4375 / 7 = 4.3482 semanas por mes
    const semanal = monthlyValueOf(fromMajorUnits('200.00'), { unit: 'WEEK', value: 1 })!;
    expect(semanal.cents).toBe(86964n);
    const diario = monthlyValueOf(fromMajorUnits('50.00'), { unit: 'DAY', value: 1 })!;
    expect(diario.cents).toBe(152188n);
  });

  it('un paquete de visitas NO tiene valor mensual: no se renueva solo', () => {
    expect(monthlyValueOf(fromMajorUnits('1200.00'), { unit: 'VISIT', value: 10 })).toBeNull();
  });

  it('rechaza una duración no positiva', () => {
    expect(() => monthlyValueOf(fromMajorUnits('100.00'), { unit: 'MONTH', value: 0 })).toThrow();
  });
});

describe('prepago: cobrado, devengado, caducado y diferido', () => {
  const paquete = { collected: fromMajorUnits('1200.00'), visitsIncluded: 10 };

  it('recién vendido, TODO es pasivo: cero ganado', () => {
    const s = splitPrepaid({ ...paquete, visitsConsumed: 0, visitsExpired: 0 });
    expect(s.earned.cents).toBe(0n);
    expect(s.deferred.cents).toBe(120000n);
  });

  it('con 3 visitas usadas se han ganado $360 y se deben $840', () => {
    const s = splitPrepaid({ ...paquete, visitsConsumed: 3, visitsExpired: 0 });
    expect(s.earned.cents).toBe(36000n);
    expect(s.deferred.cents).toBe(84000n);
    expect(s.earned.cents + s.expired.cents + s.deferred.cents).toBe(120000n);
  });

  it('agotado, lo ganado es EXACTAMENTE lo cobrado: ni un centavo colgando', () => {
    const s = splitPrepaid({ ...paquete, visitsConsumed: 10, visitsExpired: 0 });
    expect(s.earned.cents).toBe(120000n);
    expect(s.deferred.cents).toBe(0n);
  });

  it('las visitas CADUCADAS se ganan: el servicio ya no se prestará', () => {
    const s = splitPrepaid({ ...paquete, visitsConsumed: 4, visitsExpired: 6 });
    expect(s.earned.cents).toBe(48000n);
    expect(s.expired.cents).toBe(72000n);
    expect(s.deferred.cents).toBe(0n);
  });

  it('el residuo de la división NO queda como pasivo eterno', () => {
    // $100.00 entre 3 visitas = 33.333… El paquete cerrado reparte todo.
    const s = splitPrepaid({
      collected: fromMajorUnits('100.00'), visitsIncluded: 3,
      visitsConsumed: 3, visitsExpired: 0,
    });
    expect(s.earned.cents).toBe(10000n);
    expect(s.deferred.cents).toBe(0n);
  });

  it('las tres partes SIEMPRE suman lo cobrado, en cualquier combinación', () => {
    for (let incluidas = 1; incluidas <= 25; incluidas++) {
      for (let usadas = 0; usadas <= incluidas; usadas++) {
        for (const caducadas of [0, incluidas - usadas]) {
          const s = splitPrepaid({
            collected: money(BigInt(97 * incluidas + 13)),
            visitsIncluded: incluidas, visitsConsumed: usadas, visitsExpired: caducadas,
          });
          expect(s.earned.cents + s.expired.cents + s.deferred.cents).toBe(s.collected.cents);
        }
      }
    }
  });

  it('rechaza cifras imposibles', () => {
    expect(() => splitPrepaid({ ...paquete, visitsConsumed: 8, visitsExpired: 5 })).toThrow();
    expect(() => splitPrepaid({ ...paquete, visitsConsumed: -1, visitsExpired: 0 })).toThrow();
    expect(() => splitPrepaid({ collected: money(100n), visitsIncluded: 0, visitsConsumed: 0, visitsExpired: 0 })).toThrow();
  });
});

describe('devengo de una cuota dentro de una ventana', () => {
  const cuota = {
    amount: fromMajorUnits('620.00'),          // 31 días de septiembre
    periodStart: d('2026-09-01'),
    periodEnd: d('2026-10-01'),
  };

  it('ventana que cubre el periodo completo: se gana todo', () => {
    const r = accruedInWindow({ ...cuota, window: { from: d('2026-08-01'), to: d('2026-11-01') } });
    expect(r.cents).toBe(62000n);
  });

  it('ventana sin solape: no se gana nada', () => {
    expect(accruedInWindow({ ...cuota, window: { from: d('2026-11-01'), to: d('2026-12-01') } }).cents).toBe(0n);
    expect(accruedInWindow({ ...cuota, window: { from: d('2026-07-01'), to: d('2026-08-01') } }).cents).toBe(0n);
  });

  it('media mensualidad si la ventana cubre la mitad de los días', () => {
    // 15 de 30 días del periodo [1 sep, 1 oct) -> del 1 al 16.
    const r = accruedInWindow({ ...cuota, window: { from: d('2026-09-01'), to: d('2026-09-16') } });
    expect(r.cents).toBe(31000n);   // 62000 × 15 / 30
  });

  it('el periodo es SEMIABIERTO: el último día no se cuenta dos veces', () => {
    const primera = accruedInWindow({ ...cuota, window: { from: d('2026-09-01'), to: d('2026-09-16') } });
    const segunda = accruedInWindow({ ...cuota, window: { from: d('2026-09-16'), to: d('2026-10-01') } });
    expect(primera.cents + segunda.cents).toBe(62000n);
  });

  it('un periodo invertido no devenga nada', () => {
    expect(accruedInWindow({
      amount: fromMajorUnits('100.00'),
      periodStart: d('2026-10-01'), periodEnd: d('2026-09-01'),
      window: { from: d('2026-01-01'), to: d('2027-01-01') },
    }).cents).toBe(0n);
  });
});

describe('comparativo entre sucursales', () => {
  const fila = (id: string, cobrado: bigint, devengado: bigint): BranchKpi => ({
    branchId: id, collectedCents: cobrado, accruedCents: devengado,
    activeMembers: 0, outstandingCents: 0n,
  });

  it('ordena por DEVENGADO, no por cobrado', () => {
    // La sede B vendió tres anualidades: cobró mucho más, ganó menos.
    const r = rankBranches([
      fila('A', 100_000n, 900_000n),
      fila('B', 2_000_000n, 300_000n),
      fila('C', 500_000n, 500_000n),
    ]);
    expect(r.map((x) => x.branchId)).toEqual(['A', 'C', 'B']);
  });

  it('el desempate es DETERMINISTA', () => {
    const r = rankBranches([fila('z', 0n, 100n), fila('a', 0n, 100n)]);
    expect(r.map((x) => x.branchId)).toEqual(['a', 'z']);
  });
});

describe('morosidad', () => {
  it('es la proporción vencida de la cartera', () => {
    expect(delinquencyRate(25_000n, 100_000n)).toBe(0.25);
    expect(delinquencyRate(0n, 100_000n)).toBe(0);
    expect(delinquencyRate(100_000n, 100_000n)).toBe(1);
  });

  it('sin cartera no hay morosidad, y no se divide entre cero', () => {
    expect(delinquencyRate(0n, 0n)).toBe(0);
  });
});
