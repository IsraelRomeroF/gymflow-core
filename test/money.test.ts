import { describe, it, expect } from 'vitest';
import {
  money, fromMajorUnits, addMoney, subMoney, sumMoney, allocate, percentOf,
  multiplyByBps, prorate, breakdownTax, formatMoney, moneyToJSON, MoneyError, ZERO,
} from '../src/index.js';

describe('construcción', () => {
  it('rechaza centavos no enteros: no hay forma de colar un float', () => {
    expect(() => money(10.5)).toThrow(MoneyError);
  });
  it('convierte desde pesos', () => {
    expect(fromMajorUnits('650.00').cents).toBe(65000n);
    expect(fromMajorUnits('650').cents).toBe(65000n);
    expect(fromMajorUnits('650.5').cents).toBe(65050n);
    expect(fromMajorUnits('-1.23').cents).toBe(-123n);
  });
  it('rechaza importes con más de dos decimales', () => {
    expect(() => fromMajorUnits('1.234')).toThrow(MoneyError);
  });
});

describe('aritmética exacta', () => {
  it('0.1 + 0.2 === 0.3 (lo que el punto flotante no cumple)', () => {
    const suma = addMoney(fromMajorUnits('0.10'), fromMajorUnits('0.20'));
    expect(suma.cents).toBe(30n);
    expect(suma).toEqual(fromMajorUnits('0.30'));
    // Contraste con el comportamiento que este módulo existe para evitar:
    expect(0.1 + 0.2).not.toBe(0.3);
  });
  it('suma una lista larga sin deriva', () => {
    const items = Array.from({ length: 10_000 }, () => fromMajorUnits('0.01'));
    expect(sumMoney(items).cents).toBe(10_000n);
  });
  it('resta y negativos', () => {
    expect(subMoney(fromMajorUnits('100'), fromMajorUnits('150')).cents).toBe(-5000n);
  });
  it('no mezcla monedas', () => {
    const usd = { cents: 100n, currency: 'USD' } as never;
    expect(() => addMoney(fromMajorUnits('1'), usd)).toThrow(MoneyError);
  });
});

describe('reparto con mayor residuo', () => {
  it('$1,000.00 entre 3 suma EXACTAMENTE $1,000.00', () => {
    const partes = allocate(fromMajorUnits('1000.00'), [1, 1, 1]);
    expect(partes.map((p) => p.cents)).toEqual([33334n, 33333n, 33333n]);
    expect(sumMoney(partes).cents).toBe(100_000n);
  });

  it('redondear cada parte por separado FALLARÍA (contraste)', () => {
    // 33.33 × 3 = 99.99: falta un centavo. Ese es el defecto que se evita.
    const ingenuo = Math.round((1000 / 3) * 100) * 3;
    expect(ingenuo).not.toBe(100_000);
  });

  it('respeta pesos desiguales y sigue cuadrando', () => {
    const partes = allocate(fromMajorUnits('100.00'), [1, 2, 7]);
    expect(sumMoney(partes).cents).toBe(10_000n);
    expect(partes[2]!.cents).toBeGreaterThan(partes[1]!.cents);
  });

  it('cuadra para cualquier total entre 2 y 9 partes', () => {
    for (let total = 1; total <= 400; total++) {
      for (let n = 2; n <= 9; n++) {
        const partes = allocate(money(total), Array<number>(n).fill(1));
        expect(sumMoney(partes).cents, `total=${total} n=${n}`).toBe(BigInt(total));
      }
    }
  });

  it('cuadra también con importes negativos (notas de crédito)', () => {
    const partes = allocate(fromMajorUnits('-100.00'), [1, 1, 1]);
    expect(sumMoney(partes).cents).toBe(-10_000n);
  });

  it('rechaza pesos inválidos', () => {
    expect(() => allocate(money(100), [])).toThrow(MoneyError);
    expect(() => allocate(money(100), [0, 0])).toThrow(MoneyError);
    expect(() => allocate(money(100), [-1, 2])).toThrow(MoneyError);
  });
});

describe('porcentajes y prorrateo', () => {
  it('10% de $650.00', () => {
    expect(percentOf(fromMajorUnits('650.00'), 10).cents).toBe(6500n);
  });
  it('redondeo half-up al centavo', () => {
    // 3.333% de $1.00 = 0.03333 -> 3 centavos
    expect(multiplyByBps(fromMajorUnits('1.00'), 333).cents).toBe(3n);
    // 0.5 centavos redondea hacia arriba
    expect(multiplyByBps(money(1), 5000).cents).toBe(1n);
  });
  it('prorratea por DÍAS REALES del ciclo, no por 30 fijos', () => {
    // 12 días restantes de un ciclo de 31 (ADR-006)
    expect(prorate(fromMajorUnits('650.00'), 12, 31).cents).toBe(25161n);
    // El mismo cálculo sobre 30 daría otro resultado: por eso importa
    expect(prorate(fromMajorUnits('650.00'), 12, 30).cents).toBe(26000n);
  });
});

describe('desglose de impuesto', () => {
  it('sin impuesto, el subtotal es el total', () => {
    const b = breakdownTax(fromMajorUnits('650.00'), 0, true);
    expect(b.subtotal.cents).toBe(65000n);
    expect(b.tax.cents).toBe(0n);
  });

  it('precio CON impuesto incluido se desglosa hacia atrás', () => {
    // $650.00 con 16% incluido -> subtotal 560.34 + IVA 89.66
    const b = breakdownTax(fromMajorUnits('650.00'), 1600, true);
    expect(b.subtotal.cents).toBe(56034n);
    expect(b.tax.cents).toBe(8966n);
    // La invariante que debe cumplirse SIEMPRE:
    expect(addMoney(b.subtotal, b.tax).cents).toBe(b.total.cents);
  });

  it('precio MÁS impuesto lo suma encima', () => {
    const b = breakdownTax(fromMajorUnits('560.34'), 1600, false);
    expect(b.tax.cents).toBe(8965n);
    expect(addMoney(b.subtotal, b.tax).cents).toBe(b.total.cents);
  });

  it('subtotal + impuesto === total para cualquier importe', () => {
    for (let cents = 1; cents <= 2000; cents++) {
      for (const incl of [true, false]) {
        const b = breakdownTax(money(cents), 1600, incl);
        expect(addMoney(b.subtotal, b.tax).cents, `cents=${cents} incl=${incl}`).toBe(b.total.cents);
      }
    }
  });
});

describe('presentación y serialización', () => {
  it('formatea en pesos mexicanos', () => {
    expect(formatMoney(fromMajorUnits('1234.50'))).toBe('$1,234.50');
    expect(formatMoney(fromMajorUnits('0.05'))).toBe('$0.05');
    expect(formatMoney(fromMajorUnits('-99.90'))).toBe('-$99.90');
    expect(formatMoney(ZERO)).toBe('$0.00');
  });
  it('a JSON sale como STRING, nunca como number', () => {
    const json = moneyToJSON(fromMajorUnits('650.00'));
    expect(json.cents).toBe('65000');
    expect(typeof json.cents).toBe('string');
    expect(() => JSON.stringify(json)).not.toThrow();
  });
});
