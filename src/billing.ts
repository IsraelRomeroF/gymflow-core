import { addMoney, allocate, money, subMoney, sumMoney, type Money } from './money.js';

/**
 * Libro financiero (§16, ADR-011).
 *
 * Las dos reglas que lo gobiernan todo:
 *   · `Charge` es la OBLIGACIÓN; `Payment` es el MOVIMIENTO DE DINERO.
 *   · La relación es N:M vía `PaymentAllocation`. **No existe un booleano
 *     `paid`**: el estado se DERIVA del saldo.
 */

export type ChargeType =
  | 'MEMBERSHIP_PERIOD' | 'SIGNUP_FEE' | 'VISIT_PACK' | 'DAY_PASS'
  | 'CLASS_SINGLE' | 'NO_SHOW_PENALTY' | 'POS_SALE'
  | 'PRORATION_ADJUSTMENT' | 'OPENING_BALANCE' | 'MANUAL_ADJUSTMENT';

export type ChargeStatus =
  | 'DRAFT' | 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'VOID' | 'WRITTEN_OFF';

export type PaymentMethodType =
  | 'CASH' | 'CARD_TERMINAL' | 'CARD_ON_FILE' | 'SPEI_TRANSFER' | 'OXXO_REF' | 'CREDIT_NOTE';

export type AdjustmentType = 'DISCOUNT' | 'WAIVER' | 'LATE_FEE' | 'CORRECTION';

export type PaymentStatus =
  | 'INITIATED' | 'PROCESSING' | 'REQUIRES_ACTION' | 'SUCCEEDED'
  | 'FAILED' | 'UNKNOWN' | 'CANCELED' | 'REVERSED';

/** Metadatos por tipo de cargo (ADR-024). SOLO uno nace de un ciclo. */
export const CHARGE_TYPE_RULES: Readonly<Record<ChargeType, {
  generatesCycle: boolean;
  requiresMembership: boolean;
  description: string;
}>> = {
  MEMBERSHIP_PERIOD:    { generatesCycle: true,  requiresMembership: true,  description: 'Cuota del periodo' },
  SIGNUP_FEE:           { generatesCycle: false, requiresMembership: true,  description: 'Inscripción' },
  VISIT_PACK:           { generatesCycle: false, requiresMembership: false, description: 'Paquete de visitas (ingreso diferido)' },
  DAY_PASS:             { generatesCycle: false, requiresMembership: false, description: 'Pase del día (visita suelta)' },
  CLASS_SINGLE:         { generatesCycle: false, requiresMembership: false, description: 'Clase suelta' },
  NO_SHOW_PENALTY:      { generatesCycle: false, requiresMembership: false, description: 'Penalización por no presentarse' },
  POS_SALE:             { generatesCycle: false, requiresMembership: false, description: 'Venta de producto' },
  PRORATION_ADJUSTMENT: { generatesCycle: false, requiresMembership: true,  description: 'Ajuste por cambio de plan' },
  OPENING_BALANCE:      { generatesCycle: false, requiresMembership: false, description: 'Saldo inicial migrado' },
  MANUAL_ADJUSTMENT:    { generatesCycle: false, requiresMembership: false, description: 'Ajuste manual' },
};

/** Los que NO cuelgan de una membresía: por eso `membershipId` es OPCIONAL. */
export function requiresMembership(type: ChargeType): boolean {
  return CHARGE_TYPE_RULES[type].requiresMembership;
}

// ── Importes de un cargo ────────────────────────────────────────────────────

export type ChargeAmounts = {
  readonly subtotal: Money;
  readonly tax: Money;
  readonly discount: Money;
  readonly total: Money;
};

export class BillingError extends Error {}

/**
 * `total = subtotal + impuesto − descuento`.
 * La misma invariante vive como `CHECK` en la base: aquí se explica, allí se
 * garantiza.
 */
export function composeAmounts(subtotal: Money, tax: Money, discount: Money): ChargeAmounts {
  const total = subMoney(addMoney(subtotal, tax), discount);
  if (total.cents < 0n) {
    throw new BillingError('El descuento no puede superar al subtotal más impuesto');
  }
  return { subtotal, tax, discount, total };
}

export type ChargeSnapshot = {
  readonly amountTotal: Money;
  /** Suma de las asignaciones de pago recibidas. */
  readonly allocated: Money;
  /** Suma de ajustes que REDUCEN la deuda (descuentos, condonaciones). */
  readonly adjusted: Money;
};

/** Saldo pendiente. Nunca negativo: el excedente es saldo a favor del socio. */
export function chargeBalance(snapshot: ChargeSnapshot): Money {
  const covered = addMoney(snapshot.allocated, snapshot.adjusted);
  const balance = subMoney(snapshot.amountTotal, covered);
  return balance.cents < 0n ? money(0n, balance.currency) : balance;
}

/**
 * Estado DERIVADO del saldo. Nunca se edita a mano.
 *
 * `VOID` y `WRITTEN_OFF` son decisiones administrativas, no derivadas, y por
 * eso entran como bandera: una condonación no es "saldo cero", es una
 * renuncia explícita que alguien autorizó y quedó auditada.
 */
export function deriveChargeStatus(input: ChargeSnapshot & {
  readonly issued: boolean;
  readonly dueDate: Date;
  readonly today: Date;
  readonly voided?: boolean;
  readonly writtenOff?: boolean;
}): ChargeStatus {
  if (input.voided) return 'VOID';
  if (input.writtenOff) return 'WRITTEN_OFF';
  if (!input.issued) return 'DRAFT';

  const balance = chargeBalance(input);
  if (balance.cents === 0n) return 'PAID';

  const vencido = input.today.getTime() > input.dueDate.getTime();
  if (vencido) return 'OVERDUE';
  return input.allocated.cents > 0n || input.adjusted.cents > 0n ? 'PARTIALLY_PAID' : 'OPEN';
}

export function isSettled(status: ChargeStatus): boolean {
  return status === 'PAID' || status === 'VOID' || status === 'WRITTEN_OFF';
}

/** Cargos que cuentan como deuda viva para la cartera. */
export function countsAsDebt(status: ChargeStatus): boolean {
  return status === 'OPEN' || status === 'PARTIALLY_PAID' || status === 'OVERDUE';
}

/**
 * Variante en CENTAVOS para la capa de persistencia.
 *
 * Los repositorios trabajan con `bigint` porque es lo que devuelve el motor;
 * envolver y desenvolver `Money` en cada fila solo añadiría ruido. La regla de
 * que el dinero no toca `number` se mantiene intacta: sigue siendo `bigint`.
 */
export function statusOfCharge(input: {
  readonly amountTotalCents: bigint;
  readonly allocatedCents: bigint;
  readonly adjustedCents: bigint;
  readonly issued: boolean;
  readonly dueDate: Date;
  readonly today: Date;
  readonly voided?: boolean;
  readonly writtenOff?: boolean;
}): ChargeStatus {
  return deriveChargeStatus({
    amountTotal: money(input.amountTotalCents),
    allocated: money(input.allocatedCents),
    adjusted: money(input.adjustedCents),
    issued: input.issued,
    dueDate: input.dueDate,
    today: input.today,
    ...(input.voided === undefined ? {} : { voided: input.voided }),
    ...(input.writtenOff === undefined ? {} : { writtenOff: input.writtenOff }),
  });
}

/** Saldo pendiente en centavos. Nunca negativo. */
export function balanceCents(amountTotal: bigint, allocated: bigint, adjusted: bigint): bigint {
  const balance = amountTotal - allocated - adjusted;
  return balance < 0n ? 0n : balance;
}

// ── Aplicación de un pago a cargos ──────────────────────────────────────────

export type AllocatableCharge = {
  readonly chargeId: string;
  readonly dueDate: Date;
  readonly balance: Money;
};

export type AllocationPlan = {
  readonly allocations: ReadonlyArray<{ chargeId: string; amount: Money }>;
  /** Lo que sobra tras cubrir todo: queda como SALDO A FAVOR del socio. */
  readonly unapplied: Money;
};

/**
 * Reparte un pago entre los cargos pendientes, del MÁS ANTIGUO al más nuevo.
 *
 * El orden importa y es una decisión de negocio: aplicar primero a la deuda
 * más vieja reduce la antigüedad de la cartera y evita que un socio arrastre
 * un adeudo de hace meses mientras paga puntualmente los del mes en curso.
 *
 * El excedente NO crea un cargo negativo —eso no existe en contabilidad y
 * corrompería todos los reportes de cartera—: queda como pago sin asignar.
 */
export function planAllocation(amount: Money, charges: readonly AllocatableCharge[]): AllocationPlan {
  if (amount.cents <= 0n) {
    throw new BillingError('El monto a aplicar debe ser positivo');
  }

  const pendientes = [...charges]
    .filter((c) => c.balance.cents > 0n)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.chargeId.localeCompare(b.chargeId));

  const allocations: Array<{ chargeId: string; amount: Money }> = [];
  let restante = amount;

  for (const charge of pendientes) {
    if (restante.cents <= 0n) break;
    const aplicar = restante.cents >= charge.balance.cents ? charge.balance : restante;
    allocations.push({ chargeId: charge.chargeId, amount: aplicar });
    restante = subMoney(restante, aplicar);
  }

  return { allocations, unapplied: restante };
}

/**
 * Lo mínimo que hay que cobrar para que queden saldados ciertos cargos, si el
 * saldo a favor y el cobro se aplican como siempre: a lo más antiguo primero,
 * con el mismo orden que `planAllocation`.
 *
 * Es lo que permite decir ANTES de cobrar si con ese abono el socio ya entra
 * (auditoría 8, 4-09): con $300 de $650 sigue suspendido, y eso se dice en el
 * mostrador en vez de descubrirse en la puerta.
 */
export function minimumToSettle(charges: readonly AllocatableCharge[], targets: ReadonlySet<string>, credit: Money): Money {
  const orden = [...charges]
    .filter((c) => c.balance.cents > 0n)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.chargeId.localeCompare(b.chargeId));
  let ultimo = -1;
  orden.forEach((c, i) => { if (targets.has(c.chargeId)) ultimo = i; });
  if (ultimo < 0) return money(0n, credit.currency);
  const falta = subMoney(sumMoney(orden.slice(0, ultimo + 1).map((c) => c.balance), credit.currency), credit);
  return falta.cents > 0n ? falta : money(0n, credit.currency);
}

/** Comprobación de la invariante: lo repartido más lo sobrante es el pago. */
export function verifyAllocationPlan(amount: Money, plan: AllocationPlan): boolean {
  const repartido = sumMoney(plan.allocations.map((a) => a.amount), amount.currency);
  return addMoney(repartido, plan.unapplied).cents === amount.cents;
}

// ── Generación de cargos del ciclo ──────────────────────────────────────────

/**
 * Clave de idempotencia del cargo de un ciclo.
 *
 * Es DETERMINISTA y deriva del dominio, nunca del instante de ejecución: por
 * eso reejecutar el job el mismo día no duplica cargos, que es obligatorio
 * porque BullMQ es *at-least-once* (ADR-017).
 */
export function cycleChargeKey(membershipId: string, periodStart: Date): string {
  return `charge:${membershipId}:${periodStart.toISOString().slice(0, 10)}`;
}

export function signupFeeKey(membershipId: string): string {
  return `signup:${membershipId}`;
}

export function prorationKey(membershipId: string, changeDate: Date): string {
  return `proration:${membershipId}:${changeDate.toISOString().slice(0, 10)}`;
}

export function openingBalanceKey(memberId: string): string {
  return `opening:${memberId}`;
}

// ── Reparto de un importe entre conceptos ───────────────────────────────────

/**
 * Reparte un total entre líneas conservando el céntimo (ADR-005).
 * Se reexporta desde aquí porque es donde el libro lo necesita: prorrateos,
 * impuesto por línea y aplicación de un pago a varios cargos.
 */
export { allocate as allocateAmount };

// ── Reversión ───────────────────────────────────────────────────────────────

/**
 * Un pago NUNCA se edita ni se borra: se contra-asienta.
 *
 * El asiento de reversión enlaza al original y lleva motivo obligatorio, de
 * modo que el historial es aritméticamente reconstruible y el borrado
 * silencioso —el vector clásico del "robo hormiga"— es imposible.
 */
export function reversalAmount(original: Money): Money {
  return { cents: -original.cents, currency: original.currency };
}

export function canReverse(status: PaymentStatus, alreadyReversed: boolean): { ok: true } | { ok: false; reason: string } {
  if (alreadyReversed) return { ok: false, reason: 'El pago ya fue revertido' };
  if (status !== 'SUCCEEDED') return { ok: false, reason: `Solo se revierte un pago en SUCCEEDED, no en ${status}` };
  return { ok: true };
}

/** Un pago en efectivo o terminal SIEMPRE pertenece a un corte de caja. */
export function requiresCashSession(method: PaymentMethodType): boolean {
  return method === 'CASH' || method === 'CARD_TERMINAL';
}

/**
 * Un timeout NUNCA es un fallo: va a `UNKNOWN` y BLOQUEA reintentos.
 * Es lo que impide el doble cobro prohibido por §11.6.
 */
export function blocksNewAttempts(status: PaymentStatus): boolean {
  return status === 'UNKNOWN' || status === 'PROCESSING' || status === 'REQUIRES_ACTION';
}

// ── Hasta dónde está pagado ─────────────────────────────────────────────────

/** Lo que hace falta de una cuota de periodo para saber si ya está saldada. */
export type CuotaDePeriodo = {
  readonly periodStart: Date;
  /** Fin SEMIABIERTO: ese día ya no lo cubre. */
  readonly periodEnd: Date;
  readonly status: ChargeStatus;
  readonly amountCents: bigint;
  readonly allocatedCents: bigint;
  readonly adjustedCents: bigint;
};

const UN_DIA_MS = 86_400_000;

/**
 * «PAGADO HASTA» (auditoría 8, 3-01 y 4-03): el último día que cubren las
 * cuotas SALDADAS —por pago o por condonación—, contando desde la más antigua
 * y parando en la primera que se debe. Devuelve ese día (inclusivo) o `null`
 * si no hay ninguna saldada antes de la primera que se debe.
 *
 * No es `coveredThrough` (el fin del periodo en curso, pagado o no): con ese
 * dato la ficha le decía «pagado hasta el 10 de diciembre» a quien debía
 * justo ese mes. La puerta sigue con la vigencia del periodo; lo que se le
 * dice al socio sobre su dinero sale de aquí.
 *
 *   · Una cuota ANULADA no cuenta: nunca debió existir (DM-03).
 *   · Una CASTIGADA no está pagada: corta la cuenta igual que una abierta.
 *   · Un abono parcial no basta: la cuota sigue debiéndose.
 *   · Con un cambio de plan los periodos se enciman: lo pagado del plan
 *     anterior llega, como mucho, hasta el día en que empieza la cuota que se
 *     debe.
 *   · Con `periodoActual`: si la cuota del periodo en curso está saldada,
 *     cubre hasta el fin de ESE periodo, aunque se haya recorrido después
 *     (un congelamiento extiende el periodo y no la cuota). Sin esto, quien
 *     volvía de congelar aparecía «debiendo» los días que se le repusieron.
 */
export function paidThrough(cuotas: readonly CuotaDePeriodo[], periodoActual?: { start: Date; end: Date }): Date | null {
  const vigentes = cuotas
    .filter((c) => c.status !== 'VOID' && c.status !== 'DRAFT')
    .sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());
  const saldada = (c: CuotaDePeriodo) =>
    c.status !== 'WRITTEN_OFF' && balanceCents(c.amountCents, c.allocatedCents, c.adjustedCents) === 0n;

  const debida = vigentes.find((c) => !saldada(c));
  const finMasLejano = (xs: readonly CuotaDePeriodo[]) =>
    xs.reduce<number | null>((max, c) => (max === null || c.periodEnd.getTime() > max ? c.periodEnd.getTime() : max), null);

  // ¿La cuota del periodo en curso está saldada y nada anterior se debe?
  const actualPagada = !!periodoActual && vigentes.some((c) => saldada(c) && c.periodStart.getTime() === periodoActual.start.getTime())
    && (!debida || debida.periodStart.getTime() > periodoActual.start.getTime());
  const conActual = (fin: number) => (actualPagada ? Math.max(fin, periodoActual!.end.getTime()) : fin);

  if (!debida) {
    const fin = finMasLejano(vigentes);
    return fin === null ? null : new Date(conActual(fin) - UN_DIA_MS);
  }
  const fin = finMasLejano(vigentes.filter((c) => saldada(c) && c.periodStart.getTime() < debida.periodStart.getTime()));
  if (fin === null) return null;
  return new Date(Math.min(conActual(fin), debida.periodStart.getTime()) - UN_DIA_MS);
}
