import { money, sumMoney, type Money } from './money.js';

/**
 * Punto de venta (§19, ADR-024).
 *
 * Entra al MVP porque **bloquea el cutover**, no por su valor intrínseco: si
 * el mostrador sigue cobrando el refresco en BDKGYM, el corte de caja nunca
 * cuadra en GymFlow y no se puede apagar el sistema viejo.
 *
 * De ahí la decisión de alcance: catálogo plano, sin variantes, sin
 * proveedores, sin órdenes de compra. Lo mínimo para que el corte sea completo.
 */

export type PosSaleStatus = 'COMPLETED' | 'VOIDED';

export type InventoryMovementType =
  | 'PURCHASE' | 'SALE' | 'ADJUSTMENT' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'SHRINKAGE' | 'SALE_VOIDED';

export class PosError extends Error {}

/**
 * Efecto de cada movimiento sobre las existencias, y si exige motivo.
 *
 * `ADJUSTMENT` y `SHRINKAGE` lo exigen porque son las dos formas de hacer
 * desaparecer producto sin venderlo: es exactamente donde hay que poder
 * preguntar quién y por qué.
 */
export const INVENTORY_RULES: Readonly<Record<InventoryMovementType, {
  direction: 1 | -1 | 0;
  requiresReason: boolean;
  description: string;
}>> = {
  PURCHASE:      { direction: 1,  requiresReason: false, description: 'Entrada por compra' },
  SALE:          { direction: -1, requiresReason: false, description: 'Salida por venta' },
  SALE_VOIDED:   { direction: 1,  requiresReason: true,  description: 'Reingreso por anulación de venta' },
  TRANSFER_IN:   { direction: 1,  requiresReason: true,  description: 'Traspaso recibido' },
  TRANSFER_OUT:  { direction: -1, requiresReason: true,  description: 'Traspaso enviado' },
  ADJUSTMENT:    { direction: 0,  requiresReason: true,  description: 'Ajuste de inventario' },
  SHRINKAGE:     { direction: -1, requiresReason: true,  description: 'Merma' },
};

export function inventoryRequiresReason(type: InventoryMovementType): boolean {
  return INVENTORY_RULES[type].requiresReason;
}

/** Comprueba coherencia entre tipo y signo. Espejo del CHECK de la base. */
export function inventorySignIsValid(type: InventoryMovementType, delta: number): boolean {
  if (delta === 0) return false;
  const { direction } = INVENTORY_RULES[type];
  if (direction === 0) return true;
  return direction === 1 ? delta > 0 : delta < 0;
}

// ── Aritmética de la venta ──────────────────────────────────────────────────

export type SaleLineInput = {
  readonly productId: string;
  readonly quantity: number;
  readonly unitPrice: Money;
};

export type SaleLine = SaleLineInput & { readonly lineTotal: Money };

/**
 * Total de línea = precio unitario × cantidad, en enteros.
 *
 * Se calcula aquí y se guarda, en vez de derivarlo al leer: el precio de un
 * producto cambia, y una venta de hace tres meses tiene que seguir sumando lo
 * que sumó ese día.
 */
export function priceLine(line: SaleLineInput): SaleLine {
  if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
    throw new PosError('La cantidad debe ser un entero positivo');
  }
  if (line.unitPrice.cents < 0n) throw new PosError('El precio unitario no puede ser negativo');
  return {
    ...line,
    lineTotal: money(line.unitPrice.cents * BigInt(line.quantity), line.unitPrice.currency),
  };
}

export function priceSale(lines: readonly SaleLineInput[]): { lines: SaleLine[]; total: Money } {
  if (lines.length === 0) throw new PosError('Una venta necesita al menos una línea');
  const priced = lines.map(priceLine);
  return { lines: priced, total: sumMoney(priced.map((l) => l.lineTotal)) };
}

/**
 * Una venta NUNCA se edita ni se borra: se anula con motivo.
 *
 * Es la misma regla del libro financiero. Editar una venta cerrada permitiría
 * cobrar de más y corregir el registro después del corte.
 */
export function canVoidSale(status: PosSaleStatus, sameBusinessDate: boolean): { ok: true } | { ok: false; reason: string } {
  if (status === 'VOIDED') return { ok: false, reason: 'La venta ya está anulada' };
  if (!sameBusinessDate) {
    return {
      ok: false,
      reason: 'La venta es de otro día de operación: el corte ya cerró. Corrige con una devolución, no con una anulación',
    };
  }
  return { ok: true };
}

/** Stock resultante tras aplicar un delta. Nunca negativo. */
export function applyStock(onHand: number, delta: number): number {
  const resultado = onHand + delta;
  if (resultado < 0) {
    throw new PosError(`No hay existencias suficientes: hay ${onHand}, se intentan mover ${delta}`);
  }
  return resultado;
}
