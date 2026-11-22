import { describe, it, expect } from 'vitest';
import {
  money, fromMajorUnits, priceLine, priceSale, canVoidSale, applyStock,
  INVENTORY_RULES, inventoryRequiresReason, inventorySignIsValid, PosError,
  type InventoryMovementType,
} from '../src/index.js';

describe('aritmética de la venta', () => {
  it('total de línea = precio × cantidad, en enteros', () => {
    const l = priceLine({ productId: 'p1', quantity: 3, unitPrice: fromMajorUnits('25.50') });
    expect(l.lineTotal.cents).toBe(7650n);
  });

  it('el total de la venta es la suma de sus líneas', () => {
    const { total, lines } = priceSale([
      { productId: 'p1', quantity: 2, unitPrice: fromMajorUnits('25.00') },
      { productId: 'p2', quantity: 1, unitPrice: fromMajorUnits('45.50') },
      { productId: 'p3', quantity: 5, unitPrice: fromMajorUnits('12.00') },
    ]);
    expect(lines).toHaveLength(3);
    expect(total.cents).toBe(5000n + 4550n + 6000n);
  });

  it('rechaza cantidades no enteras o no positivas', () => {
    const base = { productId: 'p1', unitPrice: fromMajorUnits('10.00') };
    expect(() => priceLine({ ...base, quantity: 0 })).toThrow(PosError);
    expect(() => priceLine({ ...base, quantity: -1 })).toThrow(PosError);
    expect(() => priceLine({ ...base, quantity: 1.5 })).toThrow(PosError);
  });

  it('una venta sin líneas no existe', () => {
    expect(() => priceSale([])).toThrow(PosError);
  });

  it('un producto gratuito es válido; uno de precio negativo no', () => {
    expect(priceLine({ productId: 'p', quantity: 1, unitPrice: money(0n) }).lineTotal.cents).toBe(0n);
    expect(() => priceLine({ productId: 'p', quantity: 1, unitPrice: money(-1n) })).toThrow(PosError);
  });

  it('no pierde precisión con cantidades grandes', () => {
    const l = priceLine({ productId: 'p', quantity: 9999, unitPrice: fromMajorUnits('19.99') });
    expect(l.lineTotal.cents).toBe(1999n * 9999n);
  });
});

describe('anulación de venta', () => {
  it('se anula el MISMO día de operación', () => {
    expect(canVoidSale('COMPLETED', true)).toEqual({ ok: true });
  });

  it('NO se anula una venta de otro día: el corte ya cerró', () => {
    const r = canVoidSale('COMPLETED', false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/devolución/);
  });

  it('no se anula dos veces', () => {
    expect(canVoidSale('VOIDED', true).ok).toBe(false);
  });
});

describe('movimientos de inventario', () => {
  it('compra y traspaso recibido SUMAN; venta, merma y traspaso enviado RESTAN', () => {
    expect(INVENTORY_RULES.PURCHASE.direction).toBe(1);
    expect(INVENTORY_RULES.TRANSFER_IN.direction).toBe(1);
    expect(INVENTORY_RULES.SALE.direction).toBe(-1);
    expect(INVENTORY_RULES.SHRINKAGE.direction).toBe(-1);
    expect(INVENTORY_RULES.TRANSFER_OUT.direction).toBe(-1);
  });

  it('las dos formas de hacer desaparecer producto sin venderlo EXIGEN motivo', () => {
    expect(inventoryRequiresReason('ADJUSTMENT')).toBe(true);
    expect(inventoryRequiresReason('SHRINKAGE')).toBe(true);
    // Vender y comprar son rutina: pedir motivo produciría ruido.
    expect(inventoryRequiresReason('SALE')).toBe(false);
    expect(inventoryRequiresReason('PURCHASE')).toBe(false);
  });

  it('valida la coherencia entre tipo y signo', () => {
    expect(inventorySignIsValid('SALE', -2)).toBe(true);
    expect(inventorySignIsValid('SALE', 2)).toBe(false);
    expect(inventorySignIsValid('PURCHASE', 10)).toBe(true);
    expect(inventorySignIsValid('PURCHASE', -10)).toBe(false);
    // El ajuste puede ir en cualquier dirección; cero nunca.
    expect(inventorySignIsValid('ADJUSTMENT', -3)).toBe(true);
    expect(inventorySignIsValid('ADJUSTMENT', 3)).toBe(true);
    for (const t of Object.keys(INVENTORY_RULES) as InventoryMovementType[]) {
      expect(inventorySignIsValid(t, 0), t).toBe(false);
    }
  });
});

describe('existencias', () => {
  it('aplica el delta', () => {
    expect(applyStock(10, -3)).toBe(7);
    expect(applyStock(10, 5)).toBe(15);
  });

  it('NUNCA deja el stock negativo', () => {
    expect(() => applyStock(2, -3)).toThrow(PosError);
  });

  it('llegar a cero exacto es válido', () => {
    expect(applyStock(3, -3)).toBe(0);
  });
});
