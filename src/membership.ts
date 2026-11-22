import { anchoredDate } from './time.js';
import type { PlanBillingModel } from './plans.js';

/**
 * Motor de membresías (§15, ADR-011).
 *
 * Es el núcleo del sistema y vive aquí, sin I/O, por dos razones: se puede
 * probar exhaustivamente sin base de datos, y la misma función que decide si
 * un socio entra corre igual en la nube y en el gateway offline (ADR-015).
 */

export type MembershipStatus =
  | 'PENDING' | 'TRIALING' | 'ACTIVE' | 'PAST_DUE'
  | 'FROZEN' | 'SUSPENDED' | 'CANCELED' | 'EXPIRED';

export type MembershipTrigger =
  | 'ACTIVATE' | 'START_TRIAL' | 'TRIAL_CONVERTED' | 'TRIAL_FAILED'
  | 'CHARGE_OVERDUE' | 'PAYMENT_SETTLED' | 'GRACE_EXPIRED'
  | 'FREEZE' | 'UNFREEZE' | 'FREEZE_LIMIT_EXCEEDED'
  | 'RENEW' | 'PLAN_CHANGED' | 'PERIOD_ENDED' | 'RECOVERY_WINDOW_EXPIRED'
  | 'DEBT_RESUMED' | 'DEBT_FORGIVEN'
  | 'CANCEL';

export type Transition = {
  readonly from: MembershipStatus;
  readonly to: MembershipStatus;
  readonly trigger: MembershipTrigger;
  /** Exige motivo obligatorio y entra al AuditLog (§28). */
  readonly requiresReason: boolean;
  readonly description: string;
};

export const MEMBERSHIP_TRANSITIONS: readonly Transition[] = [
  { from: 'PENDING',   to: 'TRIALING',  trigger: 'START_TRIAL',      requiresReason: false, description: 'El plan incluye periodo de prueba' },
  { from: 'PENDING',   to: 'ACTIVE',    trigger: 'ACTIVATE',         requiresReason: false, description: 'Primer cargo liquidado' },
  { from: 'PENDING',   to: 'CANCELED',  trigger: 'CANCEL',           requiresReason: true,  description: 'Nunca pagó o se arrepintió' },

  { from: 'TRIALING',  to: 'ACTIVE',    trigger: 'TRIAL_CONVERTED',  requiresReason: false, description: 'Fin de prueba con cobro correcto' },
  { from: 'TRIALING',  to: 'PAST_DUE',  trigger: 'TRIAL_FAILED',     requiresReason: false, description: 'Fin de prueba sin cobro' },
  { from: 'TRIALING',  to: 'CANCELED',  trigger: 'CANCEL',           requiresReason: true,  description: 'Cancela durante la prueba' },

  { from: 'ACTIVE',    to: 'PAST_DUE',  trigger: 'CHARGE_OVERDUE',   requiresReason: false, description: 'Venció la fecha límite con saldo' },
  { from: 'ACTIVE',    to: 'FROZEN',    trigger: 'FREEZE',           requiresReason: true,  description: 'Congelamiento autorizado' },
  { from: 'ACTIVE',    to: 'ACTIVE',    trigger: 'RENEW',            requiresReason: false, description: 'Renovación del periodo' },
  { from: 'ACTIVE',    to: 'ACTIVE',    trigger: 'PLAN_CHANGED',     requiresReason: true,  description: 'Cambio de plan con prorrateo' },
  { from: 'ACTIVE',    to: 'EXPIRED',   trigger: 'PERIOD_ENDED',     requiresReason: false, description: 'Prepago sin autorrenovación' },
  { from: 'ACTIVE',    to: 'CANCELED',  trigger: 'CANCEL',           requiresReason: true,  description: 'Cancelación' },

  { from: 'PAST_DUE',  to: 'ACTIVE',    trigger: 'PAYMENT_SETTLED',  requiresReason: false, description: 'Liquidado por cualquier medio' },
  { from: 'PAST_DUE',  to: 'SUSPENDED', trigger: 'GRACE_EXPIRED',    requiresReason: false, description: 'Se agotó la gracia' },
  { from: 'PAST_DUE',  to: 'CANCELED',  trigger: 'CANCEL',           requiresReason: true,  description: 'Cancela estando en mora' },

  { from: 'FROZEN',    to: 'ACTIVE',    trigger: 'UNFREEZE',         requiresReason: false, description: 'Reactivación: EXTIENDE el periodo' },
  { from: 'FROZEN',    to: 'EXPIRED',   trigger: 'FREEZE_LIMIT_EXCEEDED', requiresReason: false, description: 'Excedió el máximo de congelamiento' },
  { from: 'FROZEN',    to: 'CANCELED',  trigger: 'CANCEL',           requiresReason: true,  description: 'Cancela durante la pausa' },

  { from: 'SUSPENDED', to: 'ACTIVE',    trigger: 'PAYMENT_SETTLED',  requiresReason: false, description: 'Pagó el adeudo: reactivación automática' },
  // Suspendida con el periodo ya vencido: el dueño decide qué pasa con los
  // meses que no vino. Ninguna de las dos da acceso: sigue suspendida hasta
  // que pague lo que quedó.
  { from: 'SUSPENDED', to: 'SUSPENDED', trigger: 'DEBT_RESUMED',    requiresReason: true,  description: 'Reanuda el adeudo: se cobran los periodos que no pagó' },
  { from: 'SUSPENDED', to: 'SUSPENDED', trigger: 'DEBT_FORGIVEN',   requiresReason: true,  description: 'Olvida el adeudo: se condona y arranca un periodo nuevo hoy' },
  { from: 'SUSPENDED', to: 'EXPIRED',   trigger: 'RECOVERY_WINDOW_EXPIRED', requiresReason: false, description: 'Se agotó la ventana de recuperación' },
  { from: 'SUSPENDED', to: 'CANCELED',  trigger: 'CANCEL',           requiresReason: true,  description: 'Baja definitiva' },
];

/** CANCELED y EXPIRED son TERMINALES: reactivar crea una membresía NUEVA. */
export const TERMINAL_STATUSES: readonly MembershipStatus[] = ['CANCELED', 'EXPIRED'];

/** Estados que se consideran vigentes: solo puede haber UNO por socio. */
export const LIVE_STATUSES: readonly MembershipStatus[] = ['PENDING', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'FROZEN'];

export function isTerminal(status: MembershipStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function findTransition(from: MembershipStatus, trigger: MembershipTrigger): Transition | null {
  return MEMBERSHIP_TRANSITIONS.find((t) => t.from === from && t.trigger === trigger) ?? null;
}

export function canTransition(from: MembershipStatus, trigger: MembershipTrigger): boolean {
  return findTransition(from, trigger) !== null;
}

export function allowedTriggers(from: MembershipStatus): MembershipTrigger[] {
  return MEMBERSHIP_TRANSITIONS.filter((t) => t.from === from).map((t) => t.trigger);
}

/**
 * ¿Otorga acceso físico?
 *
 * El acceso NO se almacena: se DERIVA del estado más las reglas del plan
 * (docs/05 §12). Almacenarlo en paralelo garantiza que algún día discrepe.
 *
 * `PAST_DUE` SÍ otorga acceso, y es intencional: negarle la entrada a un buen
 * socio al día siguiente de un rechazo bancario transitorio destruye más
 * valor del que protege (ADR-012).
 */
export function grantsAccess(status: MembershipStatus): boolean {
  return status === 'ACTIVE' || status === 'PAST_DUE' || status === 'TRIALING';
}

// ── Autorrenovación ─────────────────────────────────────────────────────────

/** ¿Este modelo de plan puede renovarse solo? La visita suelta y el paquete, nunca. */
export function canAutoRenew(model: PlanBillingModel): boolean {
  return model === 'RECURRING' || model === 'PREPAID_PERIOD';
}

/**
 * ¿La membresía se renueva sola? Lo decide el MODELO del plan, no solo el
 * interruptor (auditoría 8, 4-01 y 4-02):
 *
 *   · Recurrente: lo que se eligió en la venta o, si no se dijo, lo del plan.
 *   · Pago anticipado: vence y se vuelve a vender (D-14); se renueva solo
 *     únicamente si en la venta se eligió así. Antes nacía «se renueva sola»
 *     sin que nadie lo eligiera y al año emitía una anualidad que nadie pidió.
 *   · Visita suelta y paquete: nunca. Una visita que se renovaba sola
 *     fabricaba una cuota al día siguiente y, a los cinco días, un moroso.
 */
export function autoRenewFor(model: PlanBillingModel, requested: boolean | undefined, planDefault: boolean | null | undefined): boolean {
  switch (model) {
    case 'RECURRING': return requested ?? planDefault ?? true;
    case 'PREPAID_PERIOD': return requested ?? false;
    case 'DAY_PASS':
    case 'VISIT_PACK':
      return false;
  }
}

// ── Periodos ────────────────────────────────────────────────────────────────

/** Intervalo SEMIABIERTO `[start, end)`: el fin de uno es el inicio del siguiente. */
export type Period = { readonly start: Date; readonly end: Date };

export type PlanDuration = {
  readonly unit: 'DAY' | 'WEEK' | 'MONTH' | 'VISIT';
  readonly value: number;
};

const DAY_MS = 86_400_000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/**
 * Calcula el periodo siguiente.
 *
 * Para planes mensuales usa el ANCLA ORIGINAL, nunca la fecha efectiva
 * anterior: ese es el error que hace que un socio de día 31 acabe cobrado
 * el 28 para siempre (ADR-006).
 */
export function nextPeriod(current: Period, duration: PlanDuration, anchorDay: number): Period {
  const start = current.end;
  switch (duration.unit) {
    case 'DAY':
      return { start, end: addDays(start, duration.value) };
    case 'WEEK':
      return { start, end: addDays(start, duration.value * 7) };
    case 'MONTH': {
      const monthsAhead = duration.value;
      const year = start.getUTCFullYear();
      const monthIndex = start.getUTCMonth() + monthsAhead;
      const targetYear = year + Math.floor(monthIndex / 12);
      const targetMonth = (monthIndex % 12) + 1;
      return { start, end: anchoredDate(anchorDay, targetYear, targetMonth) };
    }
    case 'VISIT':
      // Un paquete de visitas no tiene ciclo temporal: se consume por evento.
      throw new Error('Un plan por visitas no genera periodos de facturación');
  }
}

/** Primer periodo a partir del alta. El ancla se fija aquí y ya no cambia. */
export function firstPeriod(startDate: Date, duration: PlanDuration, anchorDay?: number): Period {
  const anchor = anchorDay ?? startDate.getUTCDate();
  switch (duration.unit) {
    case 'DAY':
      return { start: startDate, end: addDays(startDate, duration.value) };
    case 'WEEK':
      return { start: startDate, end: addDays(startDate, duration.value * 7) };
    case 'MONTH': {
      const monthIndex = startDate.getUTCMonth() + duration.value;
      const targetYear = startDate.getUTCFullYear() + Math.floor(monthIndex / 12);
      const targetMonth = (monthIndex % 12) + 1;
      return { start: startDate, end: anchoredDate(anchor, targetYear, targetMonth) };
    }
    case 'VISIT':
      throw new Error('Un plan por visitas no genera periodos de facturación');
  }
}

/** Tope de periodos atrasados que se reconstruyen de una vez (tres años de mensualidades). */
export const MAX_MISSED_PERIODS = 36;

/**
 * Periodos que la membresía dejó de recorrer mientras estuvo suspendida:
 * del siguiente al actual hasta el que contiene `today`, con el ancla de
 * siempre. Vacío si el periodo actual sigue en curso.
 */
export function missedPeriods(current: Period, duration: PlanDuration, anchorDay: number, today: Date): Period[] {
  const out: Period[] = [];
  let p = current;
  while (p.end.getTime() <= today.getTime()) {
    if (out.length >= MAX_MISSED_PERIODS) {
      throw new Error(`Más de ${MAX_MISSED_PERIODS} periodos atrasados: revísalo con el dueño`);
    }
    p = nextPeriod(p, duration, anchorDay);
    out.push(p);
  }
  return out;
}

export function periodLengthDays(period: Period): number {
  return daysBetween(period.start, period.end);
}

/** ¿La fecha cae dentro del periodo? Semiabierto: el fin NO se incluye. */
export function isWithinPeriod(period: Period, date: Date): boolean {
  return date.getTime() >= period.start.getTime() && date.getTime() < period.end.getTime();
}

// ── Congelamiento ───────────────────────────────────────────────────────────

export type FreezeRules = {
  readonly allowFreeze: boolean;
  readonly minFreezeDays: number;
  readonly maxFreezeDaysPerYear: number;
};

export type FreezeEvaluation =
  | { readonly ok: true; readonly days: number }
  | { readonly ok: false; readonly reason: string };

export function evaluateFreeze(
  rules: FreezeRules,
  requestedDays: number,
  alreadyUsedThisYear: number,
): FreezeEvaluation {
  if (!rules.allowFreeze) return { ok: false, reason: 'El plan no permite congelamiento' };
  if (requestedDays < rules.minFreezeDays) {
    return { ok: false, reason: `El congelamiento mínimo es de ${rules.minFreezeDays} días` };
  }
  const remaining = rules.maxFreezeDaysPerYear - alreadyUsedThisYear;
  if (requestedDays > remaining) {
    return { ok: false, reason: `Solo quedan ${Math.max(0, remaining)} días de congelamiento este año` };
  }
  return { ok: true, days: requestedDays };
}

/**
 * El congelamiento EXTIENDE el periodo por los días efectivamente pausados.
 *
 * `SUSPENDED` (mora) NO extiende nada: el socio perdió esos días. La
 * diferencia vale dinero real y por eso vive en el modelo, no en la cabeza
 * del gerente (docs/05 §6.1).
 *
 * El ANCLA NO se mueve: si no, las pausas repetidas desplazarían la fecha de
 * corte por todo el calendario y el socio dejaría de reconocer su día.
 */
export function applyFreeze(period: Period, frozenDays: number): Period {
  if (frozenDays < 0) throw new Error('Los días congelados no pueden ser negativos');
  return { start: period.start, end: addDays(period.end, frozenDays) };
}

// ── Cambio de plan ──────────────────────────────────────────────────────────

export type ProrationBasis = {
  /** Días del ciclo REAL, no 30 fijos. */
  readonly cycleDays: number;
  readonly usedDays: number;
  readonly remainingDays: number;
};

/**
 * Base de prorrateo por DÍAS REALES del ciclo.
 *
 * Con intervalo semiabierto se cobra el día de alta y no el de baja, que es
 * lo que hace que dos periodos contiguos sumen exactamente los días del mes.
 */
export function prorationBasis(period: Period, changeDate: Date): ProrationBasis {
  const cycleDays = periodLengthDays(period);
  const used = Math.max(0, Math.min(cycleDays, daysBetween(period.start, changeDate)));
  return { cycleDays, usedDays: used, remainingDays: cycleDays - used };
}

// ── Paquetes de visitas ─────────────────────────────────────────────────────

export type VisitPackStatus = 'PENDING_PAYMENT' | 'ACTIVE' | 'EXHAUSTED' | 'EXPIRED' | 'FROZEN';

export type VisitLedgerEntry = {
  readonly delta: number;
  readonly entryType: 'PURCHASE' | 'CONSUME' | 'EXPIRE' | 'ADJUST' | 'REFUND';
};

/**
 * El saldo es la SUMA DEL LIBRO, nunca un contador mutable (ADR-024).
 *
 * Un contador que se decrementa no permite auditar por qué a un socio le
 * faltan visitas. Con libro, cada consumo tiene fecha, sucursal y check-in.
 */
export function visitBalance(entries: readonly VisitLedgerEntry[]): number {
  return entries.reduce((acc, e) => acc + e.delta, 0);
}

export function canConsumeVisit(
  status: VisitPackStatus,
  entries: readonly VisitLedgerEntry[],
  now: Date,
  expiresOn: Date | null,
): { ok: true } | { ok: false; reason: string } {
  if (status !== 'ACTIVE') return { ok: false, reason: `El paquete está en estado ${status}` };
  if (expiresOn && now.getTime() >= expiresOn.getTime()) return { ok: false, reason: 'El paquete caducó' };
  if (visitBalance(entries) <= 0) return { ok: false, reason: 'Sin visitas disponibles' };
  return { ok: true };
}

// ── Utilidades de calendario para el motor ──────────────────────────────────

// ── Precio y liquidación (fase 1, bloque 1.3) ───────────────────────────────

/**
 * LA CUOTA de una membresía, en centavos: una sola regla para la cuota del
 * periodo, el adeudo de una suspendida, el cambio de plan y lo que muestre
 * cualquier pantalla (auditoría 8, 16-04; D-19 no se adelanta).
 *
 *   1. El precio PACTADO al vender, importar o cambiar de plan.
 *   2. Si no hay pactado, el precio propio del plan en la sede de la venta.
 *   3. Si la sede no tiene precio propio, el de lista del plan.
 *
 * Que la sede haya dejado de VENDER el plan no cambia nada: dejar de venderlo
 * a socios nuevos no rompe la renovación de quien ya lo compró ahí. Por eso
 * la regla nunca responde «sin precio».
 */
export function precioDeCuota(input: {
  /** `memberships.agreedPriceCents`. */
  readonly agreedPriceCents: bigint | null | undefined;
  /** Precio de lista del plan. */
  readonly planPriceCents: bigint;
  /** Precio propio del plan en la sede de la venta, se venda hoy ahí o no. */
  readonly branchPriceCents?: bigint | null | undefined;
}): bigint {
  return input.agreedPriceCents ?? input.branchPriceCents ?? input.planPriceCents;
}

/** Con qué quedó saldado un cargo. */
export type Liquidacion = 'PAYMENT' | 'WAIVER' | 'REFUND_CORRECTION';

/**
 * ¿Con qué quedó SALDADO un cargo? `null` si no lo está (debe algo, está
 * anulado, castigado o en borrador).
 *
 *   · `PAYMENT`: entró dinero (o saldo a favor) para cubrirlo, aunque además
 *     llevara un descuento: el descuento bajó el precio, el pago lo saldó.
 *   · `WAIVER`: nadie pagó; se perdonó (condonación o descuento del total).
 *   · `REFUND_CORRECTION`: nadie pagó ni se perdonó; lo cubrió una corrección
 *     (el crédito por los días no usados al cambiar de plan).
 *
 * «Pagado hasta» cuenta las tres; los ingresos solo la primera.
 */
export function liquidadoPor(cargo: {
  readonly status: string;
  readonly amountCents: bigint;
  readonly allocatedCents: bigint;
  readonly adjustments: ReadonlyArray<{ readonly adjustmentType: string; readonly amountCents: bigint }>;
}): Liquidacion | null {
  if (cargo.status === 'VOID' || cargo.status === 'WRITTEN_OFF' || cargo.status === 'DRAFT') return null;
  const ajustado = cargo.adjustments.reduce((a, x) => a + x.amountCents, 0n);
  if (cargo.amountCents - cargo.allocatedCents - ajustado > 0n) return null;
  if (cargo.allocatedCents > 0n) return 'PAYMENT';
  const perdonado = cargo.adjustments
    .filter((x) => x.adjustmentType === 'WAIVER' || x.adjustmentType === 'DISCOUNT')
    .reduce((a, x) => a + x.amountCents, 0n);
  if (perdonado > 0n) return 'WAIVER';
  // Un cargo de $0 sin ajustes no lo saldó nadie: nació saldado.
  return ajustado > 0n ? 'REFUND_CORRECTION' : null;
}

/** Un cargo abierto del socio, como lo ve un cobro. */
export type CargoParaEntrar = {
  readonly chargeId: string;
  readonly dueDate: Date;
  /** Lo que falta por cubrir (importe − asignado − ajustado). */
  readonly balanceCents: bigint;
  /** ¿Es de los que dejan fuera a la membresía? (su inscripción o una cuota de un periodo ya empezado). */
  readonly blocksAccess: boolean;
};

/**
 * ¿ENTRA después de este cobro? La misma regla que la puerta, vista desde la
 * caja (4-09): el dinero se aplica primero al saldo a favor y luego al cobro,
 * siempre a lo MÁS ANTIGUO, así que para saldar lo que la deja fuera hay que
 * cubrir también todo lo que vence antes.
 *
 *   · Si su estado ya da acceso (y, en mora, el gimnasio deja pasar), entra.
 *   · Si está por activar, en mora o suspendida, entra cuando el dinero
 *     alcanza a lo último que la bloquea; si no, `toEnterCents` dice cuánto
 *     falta ADEMÁS de `paymentCents`.
 *   · Congelada, cancelada o vencida: un cobro no la abre (`toEnterCents`
 *     nulo: no hay importe que lo resuelva).
 *
 * Con `paymentCents` en 0 responde por el estado de HOY.
 */
export function canEnterAfterPayment(input: {
  readonly status: MembershipStatus;
  readonly allowAccessWhilePastDue: boolean;
  readonly charges: readonly CargoParaEntrar[];
  /** Saldo a favor disponible antes del cobro. */
  readonly creditCents: bigint;
  /** El cobro que se va a registrar (0 = ninguno). */
  readonly paymentCents: bigint;
}): { canEnter: boolean; toEnterCents: bigint | null } {
  const { status } = input;
  if (grantsAccess(status) && (status !== 'PAST_DUE' || input.allowAccessWhilePastDue)) {
    return { canEnter: true, toEnterCents: null };
  }
  if (status !== 'PENDING' && status !== 'PAST_DUE' && status !== 'SUSPENDED') {
    return { canEnter: false, toEnterCents: null };
  }
  const orden = input.charges
    .filter((c) => c.balanceCents > 0n)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.chargeId.localeCompare(b.chargeId));
  let ultimo = -1;
  orden.forEach((c, i) => { if (c.blocksAccess) ultimo = i; });
  // Nada abierto la bloquea: no hay importe que la abra desde la caja.
  if (ultimo < 0) return { canEnter: false, toEnterCents: null };
  const porCubrir = orden.slice(0, ultimo + 1).reduce((a, c) => a + c.balanceCents, 0n);
  const disponible = (input.creditCents > 0n ? input.creditCents : 0n) + (input.paymentCents > 0n ? input.paymentCents : 0n);
  const falta = porCubrir - disponible;
  return falta > 0n ? { canEnter: false, toEnterCents: falta } : { canEnter: true, toEnterCents: 0n };
}
