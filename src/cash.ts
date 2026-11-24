import { addMoney, money, subMoney, sumMoney, type Money } from './money.js';
import type { PaymentMethodType } from './billing.js';
import { daysBetween } from './membership.js';

/**
 * Caja y corte de turno (§17, ADR-013).
 *
 * El corte es el punto de MAYOR exposición a fuga del sistema, porque el
 * efectivo domina el cobro. Todo lo de aquí está diseñado para que la
 * diferencia de caja sea **atribuible a una persona concreta**: por eso la
 * sesión cuelga de una CAJA, no de una sucursal. Tres cajeros compartiendo
 * turno en una sede hacen que un faltante no sea de nadie.
 */

export type CashSessionStatus = 'OPEN' | 'CLOSED' | 'RECONCILED';

export type CashMovementType = 'FLOAT_IN' | 'WITHDRAWAL' | 'EXPENSE' | 'DEPOSIT' | 'CORRECTION';

export class CashError extends Error {}

/**
 * Efecto de cada movimiento sobre el dinero que hay EN EL CAJÓN.
 *
 * `direction` es el signo obligatorio del importe almacenado. Guardar el
 * importe ya firmado —en vez de una magnitud más un tipo— hace que el efectivo
 * esperado sea una suma directa y que un error de signo sea imposible de
 * introducir sin que la base lo rechace.
 */
export const MOVEMENT_RULES: Readonly<Record<CashMovementType, {
  direction: 1 | -1 | 0;
  requiresApproval: boolean;
  description: string;
}>> = {
  /// Fondo adicional metido al cajón a mitad del turno.
  FLOAT_IN:   { direction: 1,  requiresApproval: false, description: 'Entrada de fondo' },
  /// Retiro parcial a la caja fuerte. Es el movimiento que más se abusa.
  WITHDRAWAL: { direction: -1, requiresApproval: true,  description: 'Retiro a caja fuerte' },
  /// Gasto menor pagado del cajón. Desde D-15 (bloque 3.5) pasa sin firma hasta el tope
  /// chico del gimnasio; arriba la pide. Quién firma qué lo decide `reglaDelCajon`.
  EXPENSE:    { direction: -1, requiresApproval: false, description: 'Gasto de caja chica' },
  /// Envío al banco.
  DEPOSIT:    { direction: -1, requiresApproval: true,  description: 'Depósito bancario' },
  /// Corrección con motivo. Puede ir en cualquier dirección.
  CORRECTION: { direction: 0,  requiresApproval: true,  description: 'Corrección con motivo' },
} as const;

export function movementRequiresApproval(type: CashMovementType): boolean {
  return MOVEMENT_RULES[type].requiresApproval;
}

/** Convierte una magnitud positiva capturada por el cajero en importe firmado. */
export function signedMovementAmount(type: CashMovementType, magnitude: Money, sign?: 1 | -1): Money {
  if (magnitude.cents <= 0n) throw new CashError('El importe del movimiento debe ser positivo');
  const rule = MOVEMENT_RULES[type];
  if (rule.direction === 0) {
    if (sign === undefined) throw new CashError('Una corrección exige indicar si suma o resta');
    return { cents: magnitude.cents * BigInt(sign), currency: magnitude.currency };
  }
  return { cents: magnitude.cents * BigInt(rule.direction), currency: magnitude.currency };
}

/** ¿El importe firmado es coherente con su tipo? Espejo del CHECK de la base. */
export function movementSignIsValid(type: CashMovementType, amount: Money): boolean {
  if (amount.cents === 0n) return false;
  const { direction } = MOVEMENT_RULES[type];
  if (direction === 0) return true;
  return direction === 1 ? amount.cents > 0n : amount.cents < 0n;
}

// ── Efectivo esperado ───────────────────────────────────────────────────────

/**
 * SOLO el efectivo llega al cajón.
 *
 * Un cobro con terminal aparece en el documento del turno, pero NO en el
 * conteo: sumarlo produciría un faltante idéntico al monto de las tarjetas en
 * cada cierre, y el cajero aprendería a ignorar la diferencia. Que la
 * diferencia signifique algo depende de esto.
 */
export function affectsDrawer(method: PaymentMethodType): boolean {
  return method === 'CASH';
}

export type SessionCashInput = {
  readonly openingFloat: Money;
  /** Cobros en efectivo del turno, ya netos de sus contra-asientos. */
  readonly cashCollected: Money;
  /** Movimientos ya firmados. */
  readonly movements: readonly Money[];
};

export function expectedCash(input: SessionCashInput): Money {
  const movimientos = sumMoney(input.movements, input.openingFloat.currency);
  return addMoney(addMoney(input.openingFloat, input.cashCollected), movimientos);
}

export type VarianceKind = 'EXACT' | 'SHORT' | 'OVER';

export type VarianceReport = {
  readonly expected: Money;
  readonly counted: Money;
  /** contado − esperado. Negativo = FALTA dinero. */
  readonly variance: Money;
  readonly kind: VarianceKind;
  readonly requiresReason: boolean;
};

/**
 * La diferencia se calcula como **contado − esperado**, de modo que el signo
 * se lea sin traducción: negativo falta, positivo sobra.
 *
 * Un SOBRANTE exige motivo igual que un faltante. Es contraintuitivo y es
 * deliberado: el sobrante sistemático es la firma de un cobro no registrado
 * que todavía no se ha sacado del cajón.
 */
export function computeVariance(expected: Money, counted: Money): VarianceReport {
  const variance = subMoney(counted, expected);
  const kind: VarianceKind = variance.cents === 0n ? 'EXACT' : variance.cents < 0n ? 'SHORT' : 'OVER';
  return { expected, counted, variance, kind, requiresReason: variance.cents !== 0n };
}

/**
 * Cerrar exige haber CONTADO. No hay cierre "ciego".
 *
 * Si el sistema mostrara el esperado antes del conteo, el cajero teclearía esa
 * cifra y el corte dejaría de medir nada. La pantalla pide el conteo primero y
 * revela la diferencia después.
 */
export function canClose(input: {
  readonly status: CashSessionStatus;
  readonly counted: Money | null;
  readonly varianceReason: string | null;
  readonly expected: Money;
}): { ok: true } | { ok: false; reason: string } {
  if (input.status !== 'OPEN') return { ok: false, reason: `La sesión ya está en ${input.status}` };
  if (input.counted === null) return { ok: false, reason: 'No se puede cerrar sin contar el efectivo' };

  const report = computeVariance(input.expected, input.counted);
  if (report.requiresReason && !input.varianceReason?.trim()) {
    const etiqueta = report.kind === 'SHORT' ? 'faltante' : 'sobrante';
    return { ok: false, reason: `Hay un ${etiqueta}: exige motivo para cerrar` };
  }
  return { ok: true };
}

// ── El descuadre que cuenta ─────────────────────────────────────────────────

/** Lo que UN corte le hace al dinero del periodo. */
export type DescuadreQueCuenta = {
  /** El faltante, en NEGATIVO: resta como un gasto. Cero si sobró o cuadró. */
  readonly faltanteCents: bigint;
  /** El sobrante, en positivo. NO suma a la ganancia: se informa «por aclarar». */
  readonly sobranteCents: bigint;
};

/**
 * LA regla del descuadre (auditoría 8, 13-05 y 14-09; DM-10): de cada corte
 * cuenta su FALTANTE, que resta como un gasto; el SOBRANTE no suma, porque es
 * dinero sin explicar (una venta sin registrar, un cambio mal dado) y se
 * informa «por aclarar» hasta que alguien diga de dónde salió.
 *
 * Hay una sola, aquí, y la usan Tablero, Movimientos e Inicio. Antes eran
 * tres: el Tablero sumaba el descuadre con su signo, la tarjeta «Gastos» lo
 * neteaba y la ganancia restaba el faltante neto del día. En la misma
 * pantalla, Entró − Gastos no daba la Ganancia.
 *
 * `varianceCents` = contado − esperado, como lo guarda el corte (negativo,
 * faltó). Sin corte cerrado (nulo) no hay descuadre.
 */
export function descuadreQueCuenta(varianceCents: bigint | null | undefined): DescuadreQueCuenta {
  const v = varianceCents ?? 0n;
  return { faltanteCents: v < 0n ? v : 0n, sobranteCents: v > 0n ? v : 0n };
}

/**
 * La misma regla sobre varios cortes, CORTE POR CORTE: el sobrante de una caja
 * no tapa el faltante de otra, ni el de un turno el del siguiente. Sumar los
 * descuadres del día antes de mirar el signo escondía faltantes.
 */
export function descuadreDeCortes(cortes: Iterable<bigint | null | undefined>): DescuadreQueCuenta {
  let faltanteCents = 0n;
  let sobranteCents = 0n;
  for (const v of cortes) {
    const d = descuadreQueCuenta(v);
    faltanteCents += d.faltanteCents;
    sobranteCents += d.sobranteCents;
  }
  return { faltanteCents, sobranteCents };
}

// ── Folio ───────────────────────────────────────────────────────────────────

/**
 * Folio POR CAJA, legible en voz alta en el mostrador.
 *
 * No es fiscal —no se factura— sino operativo: sirve para que un socio que
 * llama por teléfono pueda citar su recibo. Puede tener huecos si una
 * transacción se revierte, y eso es correcto: un folio sin huecos obligaría a
 * reutilizar números, que es peor.
 */
export function formatFolio(branchCode: string, registerCode: string, seq: number): string {
  if (seq <= 0) throw new CashError('El folio arranca en 1');
  return `${branchCode}-${registerCode}-${String(seq).padStart(6, '0')}`;
}

// ── Descuentos con motivo de catálogo ───────────────────────────────────────

/**
 * Catálogo de motivos de descuento (§17).
 *
 * Un campo de texto libre produce "descuento", "desc", "autorizado" y nada
 * analizable. Con catálogo, la pregunta "¿cuánto nos cuesta la promoción de
 * estudiante?" tiene respuesta.
 */
export const DISCOUNT_REASONS = [
  'PROMOCION_VIGENTE',
  'CONVENIO_EMPRESA',
  'ESTUDIANTE',
  'INAPI_TERCERA_EDAD',
  'REFERIDO',
  'AJUSTE_POR_SERVICIO',
  'RETENCION',
  'ERROR_DE_CAPTURA',
] as const;

export type DiscountReason = (typeof DISCOUNT_REASONS)[number];

export function isDiscountReason(value: string): value is DiscountReason {
  return (DISCOUNT_REASONS as readonly string[]).includes(value);
}

/**
 * Porcentaje que representa un descuento sobre la base, para el límite por rol.
 *
 * Se calcula en enteros y se redondea HACIA ARRIBA: un descuento del 25.4% con
 * límite del 25% tiene que disparar la aprobación, no colarse por redondeo.
 */
export function discountPercentOf(discount: Money, base: Money): number {
  if (base.cents <= 0n) throw new CashError('La base del descuento debe ser positiva');
  if (discount.cents < 0n) throw new CashError('El descuento no puede ser negativo');
  const centesimas = (discount.cents * 10000n + base.cents - 1n) / base.cents;
  return Number(centesimas) / 100;
}

// ── Cartera consolidada ─────────────────────────────────────────────────────

/** Tramos de antigüedad de la deuda. El primero es "al corriente pero vencido". */
export const AGING_BUCKETS = [
  { key: '1-30', fromDays: 1, toDays: 30 },
  { key: '31-60', fromDays: 31, toDays: 60 },
  { key: '61-90', fromDays: 61, toDays: 90 },
  { key: '90+', fromDays: 91, toDays: null },
] as const;

export type AgingBucketKey = (typeof AGING_BUCKETS)[number]['key'];

/** Días de antigüedad de un cargo vencido a una fecha de negocio dada. */
export function daysOverdue(dueDate: Date, today: Date): number {
  return Math.max(0, daysBetween(dueDate, today));
}

export function agingBucketFor(daysOverdue: number): AgingBucketKey | null {
  if (daysOverdue < 1) return null;
  for (const b of AGING_BUCKETS) {
    if (b.toDays === null || daysOverdue <= b.toDays) return b.key;
  }
  return '90+';
}

/** Totales de un turno, por método. Solo el efectivo llega al cajón. */
export type ShiftTotals = {
  readonly byMethod: ReadonlyMap<PaymentMethodType, Money>;
  readonly cashCollected: Money;
  readonly total: Money;
};

export function summarizeShift(
  payments: ReadonlyArray<{ method: PaymentMethodType; amount: Money }>,
): ShiftTotals {
  const byMethod = new Map<PaymentMethodType, Money>();
  for (const p of payments) {
    const previo = byMethod.get(p.method) ?? money(0n, p.amount.currency);
    byMethod.set(p.method, addMoney(previo, p.amount));
  }
  const cashCollected = byMethod.get('CASH') ?? money(0n);
  const total = sumMoney([...byMethod.values()]);
  return { byMethod, cashCollected, total };
}
