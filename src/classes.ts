import { isoDate, resolveWallTime, type WallTimeResolution } from './time.js';
import { grantsAccess, type MembershipStatus } from './membership.js';

/**
 * Dominio de CLASES (§5.5, ADR-025).
 *
 * Dos reglas gobiernan todo lo demás:
 *
 * 1. **El cupo no se decide aquí.** Estas funciones dicen si una reserva es
 *    admisible; la última plaza se adjudica con un `UPDATE ... WHERE
 *    booked_count < capacity RETURNING`. Leer el cupo y luego escribirlo
 *    vende la misma plaza dos veces, y con dos socios pulsando a la vez no
 *    hace falta mala suerte: hace falta un martes a las siete.
 * 2. **Reservar no es entrar.** La reserva mira el futuro (¿tendrá membresía
 *    cuando sea la clase?) y la puerta mira el presente (¿está al corriente
 *    ahora?). Son dos preguntas distintas y confundirlas produce el peor de
 *    los dos mundos: o se le niega la reserva a quien iba a pagar mañana, o
 *    se le promete una plaza que el torniquete le va a negar.
 */

export type ClassOccurrenceStatus = 'SCHEDULED' | 'CANCELED' | 'CLOSED';

export type ClassBookingStatus = 'BOOKED' | 'CANCELED' | 'ATTENDED' | 'NO_SHOW';

/** Una franja de la plantilla semanal. `weekday` 0 = domingo. */
export type WeeklySlot = {
  readonly weekday: number;
  /** Minutos desde medianoche, en hora LOCAL de la sucursal. */
  readonly startMinute: number;
  readonly durationMin: number;
  readonly capacity: number;
};

export type RecurrenceTemplate = {
  readonly id: string;
  readonly slots: readonly WeeklySlot[];
  /** Intervalo semiabierto `[effectiveFrom, effectiveTo)` (ADR-006). */
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
};

export type PlannedOccurrence = {
  readonly templateId: string;
  readonly businessDate: Date;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly capacity: number;
  /** `SHIFTED` o `AMBIGUOUS` = el cambio de hora movió la clase. Se avisa. */
  readonly resolution: WallTimeResolution;
  /** Clave determinista: reexpandir el mismo horizonte no duplica clases. */
  readonly occurrenceKey: string;
};

export const MAX_SLOT_MINUTE = 24 * 60;

export function isValidSlot(slot: WeeklySlot): boolean {
  return Number.isInteger(slot.weekday) && slot.weekday >= 0 && slot.weekday <= 6
    && Number.isInteger(slot.startMinute) && slot.startMinute >= 0 && slot.startMinute < MAX_SLOT_MINUTE
    && Number.isInteger(slot.durationMin) && slot.durationMin > 0 && slot.durationMin <= 8 * 60
    && Number.isInteger(slot.capacity) && slot.capacity > 0;
}

/**
 * Clave de la ocurrencia. Es DERIVADA, no aleatoria, por la misma razón que
 * `cycleChargeKey`: el generador se ejecuta a diario sobre un horizonte que se
 * solapa con el del día anterior, y sin una clave estable cada ejecución
 * crearía otra vez las mismas clases.
 */
export function occurrenceKeyOf(templateId: string, weekday: number, startMinute: number, businessDate: Date): string {
  return `${templateId}:${isoDate(businessDate)}:${weekday}:${startMinute}`;
}

/**
 * Expande una plantilla semanal a ocurrencias concretas dentro de
 * `[fromDate, toDate)`, resolviendo la hora de pared EN CADA FECHA.
 *
 * Resolverla una sola vez y sumar siete días sería más rápido y estaría mal:
 * en la sucursal de la frontera norte, que sí cambia de hora, la clase de las
 * 07:00 se convertiría en la de las 06:00 durante medio año.
 */
export function expandWeekly(
  template: RecurrenceTemplate,
  timezone: string,
  fromDate: Date,
  toDate: Date,
): PlannedOccurrence[] {
  const out: PlannedOccurrence[] = [];
  const start = new Date(Math.max(fromDate.getTime(), template.effectiveFrom.getTime()));
  const end = template.effectiveTo
    ? new Date(Math.min(toDate.getTime(), template.effectiveTo.getTime()))
    : toDate;

  for (let d = new Date(start); d < end; d = new Date(d.getTime() + 86_400_000)) {
    const weekday = d.getUTCDay();
    for (const slot of template.slots) {
      if (slot.weekday !== weekday || !isValidSlot(slot)) continue;

      const { at, resolution } = resolveWallTime(
        timezone,
        d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(),
        Math.floor(slot.startMinute / 60), slot.startMinute % 60,
      );

      out.push({
        templateId: template.id,
        businessDate: new Date(d),
        startsAt: at,
        endsAt: new Date(at.getTime() + slot.durationMin * 60_000),
        capacity: slot.capacity,
        resolution,
        occurrenceKey: occurrenceKeyOf(template.id, weekday, slot.startMinute, d),
      });
    }
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

// ── Política de reserva ─────────────────────────────────────────────────────

export type BookingDenialReason =
  | 'CLASS_CANCELED'
  | 'CLASS_CLOSED'
  | 'CLASS_ALREADY_STARTED'
  | 'CLASS_FULL'
  | 'ALREADY_BOOKED'
  | 'BOOKING_WINDOW_NOT_OPEN'
  | 'MEMBER_ARCHIVED'
  | 'NO_MEMBERSHIP'
  | 'MEMBERSHIP_NOT_VALID_AT_CLASS_TIME'
  | 'MEMBERSHIP_FROZEN'
  | 'BRANCH_NOT_ALLOWED'
  | 'BLOCKED_BY_NO_SHOWS';

/**
 * Avisos. NO impiden reservar; se muestran.
 *
 * `WILL_BE_DENIED_AT_DOOR` es el que importa: el socio en mora puede reservar
 * —puede pagar antes de la clase, y avisarle es una vía de cobranza— pero
 * tiene que saber que hoy por hoy el torniquete no lo dejaría pasar
 * (ADR-028). Callarlo produce una plaza ocupada y un socio en la puerta.
 */
/** `DROP_IN_ONLY`: sin plan que la cubra; es clase suelta y entra solo a esa clase. */
export type BookingWarning = 'WILL_BE_DENIED_AT_DOOR' | 'LAST_SPOTS' | 'REQUIRES_PAYMENT' | 'DROP_IN_ONLY';

export type BookingSettings = {
  /** Con cuánta antelación máxima se puede reservar. */
  readonly maxDaysAhead: number;
  /** Minutos antes del inicio en que la cancelación deja de ser gratuita. */
  readonly cancelCutoffMinutes: number;
  /** Ventana en la que se cuentan las faltas para la sanción. */
  readonly noShowWindowDays: number;
  /** Faltas que activan el bloqueo. */
  readonly noShowsBeforeBlock: number;
  /** Duración del bloqueo. */
  readonly blockDays: number;
  /** Avisar "quedan pocos lugares" a partir de este restante. */
  readonly lastSpotsThreshold: number;
};

/**
 * Valores por defecto. Todos `SUPUESTO`: el gimnasio no tiene política escrita
 * de reservas, así que se eligen conservadores y se agrupan aquí para poder
 * calibrarlos sin tocar la lógica.
 */
export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  maxDaysAhead: 7,
  cancelCutoffMinutes: 120,
  noShowWindowDays: 30,
  noShowsBeforeBlock: 3,
  blockDays: 7,
  lastSpotsThreshold: 3,
};

/**
 * LAS REGLAS QUE CADA GIMNASIO FIJA (11-08): con cuánta antelación se reserva,
 * hasta cuándo se cancela sin falta, y cuántas faltas bloquean por cuántos
 * días. Sin nada guardado valen las de fábrica (`DEFAULT_BOOKING_SETTINGS`),
 * que son las que el producto traía escritas en código.
 */
export type GymBookingRules = Pick<BookingSettings,
  'maxDaysAhead' | 'cancelCutoffMinutes' | 'noShowWindowDays' | 'noShowsBeforeBlock' | 'blockDays'>;

/**
 * Entre qué valores se mueve cada regla. `maxDaysAhead` no pasa de 21 porque
 * las sesiones se generan con tres semanas de horizonte: prometer más es
 * prometer clases que todavía no existen.
 */
export const BOOKING_RULE_LIMITS: Readonly<Record<keyof GymBookingRules, { readonly min: number; readonly max: number }>> = {
  maxDaysAhead: { min: 1, max: 21 },
  cancelCutoffMinutes: { min: 0, max: 48 * 60 },
  noShowWindowDays: { min: 7, max: 90 },
  noShowsBeforeBlock: { min: 1, max: 10 },
  blockDays: { min: 1, max: 60 },
};

export const GYM_BOOKING_RULE_KEYS = Object.keys(BOOKING_RULE_LIMITS) as ReadonlyArray<keyof GymBookingRules>;

/** Las reglas del gimnasio sobre las de fábrica. Un valor fuera de rango o ausente no pisa nada. */
export function bookingSettingsFrom(rules: Partial<Record<keyof GymBookingRules, number | null | undefined>> | null | undefined): BookingSettings {
  const out: { -readonly [K in keyof BookingSettings]: BookingSettings[K] } = { ...DEFAULT_BOOKING_SETTINGS };
  if (!rules) return out;
  for (const k of GYM_BOOKING_RULE_KEYS) {
    const v = rules[k];
    const { min, max } = BOOKING_RULE_LIMITS[k];
    if (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max) out[k] = v;
  }
  return out;
}

/**
 * LA VENTANA DEL PASE DE LISTA: se abre una hora antes de la clase y se cierra
 * media hora después de que termina. La usan la API (para aceptar el «Llegó»),
 * el cierre de la sesión y las pantallas (para ofrecer «Pasar lista»).
 */
export const ATTENDANCE_WINDOW = { beforeMin: 60, afterMin: 30 } as const;

export function attendanceWindowState(
  session: { readonly startsAt: Date; readonly endsAt: Date }, now: Date,
): 'BEFORE' | 'OPEN' | 'CLOSED' {
  if (now.getTime() < session.startsAt.getTime() - ATTENDANCE_WINDOW.beforeMin * 60_000) return 'BEFORE';
  if (now.getTime() > session.endsAt.getTime() + ATTENDANCE_WINDOW.afterMin * 60_000) return 'CLOSED';
  return 'OPEN';
}

export type BookingSubject = {
  readonly memberId: string;
  readonly archived: boolean;
  readonly membership: {
    readonly status: MembershipStatus;
    readonly homeBranchId: string | null;
    readonly allowedBranchIds: readonly string[];
    readonly allBranches: boolean;
    /** Fin del periodo cubierto. La reserva mira ESTA fecha, no hoy. */
    readonly coveredUntil: Date | null;
    /** ¿Su plan incluye ESTA clase? (el plan puede incluir todas o solo algunas). */
    readonly includesClasses: boolean;
  } | null;
  /** Bloqueo vigente por faltas, si lo hay. */
  readonly blockedUntil: Date | null;
  readonly alreadyBooked: boolean;
};

export type BookingOccasion = {
  readonly branchId: string;
  readonly startsAt: Date;
  readonly status: ClassOccurrenceStatus;
  readonly capacity: number;
  readonly bookedCount: number;
  readonly dropInPriceCents: bigint;
};

export type BookingDecision =
  | {
      readonly outcome: 'ALLOW';
      readonly requiresPayment: boolean;
      readonly priceCents: bigint;
      readonly warnings: readonly BookingWarning[];
    }
  | { readonly outcome: 'DENY'; readonly reason: BookingDenialReason };

const deny = (reason: BookingDenialReason): BookingDecision => ({ outcome: 'DENY', reason });

/**
 * ¿Puede este socio reservar esta clase?
 *
 * El orden importa y es el mismo criterio que en `evaluateAccess`: primero lo
 * que no depende del socio (la clase), después el socio. Así el motivo que se
 * le enseña es el más accionable de los que aplican.
 */
export function evaluateBooking(
  subject: BookingSubject,
  occasion: BookingOccasion,
  now: Date,
  settings: BookingSettings = DEFAULT_BOOKING_SETTINGS,
): BookingDecision {
  if (occasion.status === 'CANCELED') return deny('CLASS_CANCELED');
  if (occasion.status === 'CLOSED') return deny('CLASS_CLOSED');
  if (occasion.startsAt.getTime() <= now.getTime()) return deny('CLASS_ALREADY_STARTED');

  const daysAhead = (occasion.startsAt.getTime() - now.getTime()) / 86_400_000;
  if (daysAhead > settings.maxDaysAhead) return deny('BOOKING_WINDOW_NOT_OPEN');

  if (subject.alreadyBooked) return deny('ALREADY_BOOKED');
  if (occasion.bookedCount >= occasion.capacity) return deny('CLASS_FULL');

  if (subject.archived) return deny('MEMBER_ARCHIVED');
  if (subject.blockedUntil && subject.blockedUntil.getTime() > now.getTime()) {
    return deny('BLOCKED_BY_NO_SHOWS');
  }

  /**
   * CLASE SUELTA (2026-10-09): quien no tiene plan vigente el día de la clase
   * —o lo tiene pero no le cubre esa fecha— la toma pagando esa sola clase.
   * Pagada, la puerta lo deja pasar a esa clase. Una clase sin precio sigue
   * pidiendo plan: no se regala la plaza.
   */
  const suelta = (motivo: BookingDenialReason): BookingDecision => (occasion.dropInPriceCents > 0n
    ? { outcome: 'ALLOW', requiresPayment: true, priceCents: occasion.dropInPriceCents, warnings: ['REQUIRES_PAYMENT', 'DROP_IN_ONLY'] }
    : deny(motivo));

  const m = subject.membership;
  if (!m) return suelta('NO_MEMBERSHIP');
  if (m.status === 'FROZEN') return deny('MEMBERSHIP_FROZEN');
  // `grantsAccess` ya admite PAST_DUE (ADR-012): en mora se puede reservar.
  // Quien lo frena es la PUERTA (ADR-028), y por eso se avisa más abajo.
  if (!grantsAccess(m.status)) return suelta('NO_MEMBERSHIP');

  // La pregunta de la reserva NO es "¿entra hoy?" sino "¿tendrá derecho a
  // entrar el día de la clase?". Reservar una clase posterior al fin del
  // periodo cubierto es ocupar una plaza sin derecho a usarla.
  if (m.coveredUntil && occasion.startsAt.getTime() >= m.coveredUntil.getTime()) {
    return suelta('MEMBERSHIP_NOT_VALID_AT_CLASS_TIME');
  }

  const branchOk = m.allBranches
    || m.homeBranchId === occasion.branchId
    || m.allowedBranchIds.includes(occasion.branchId);
  if (!branchOk) return deny('BRANCH_NOT_ALLOWED');

  const requiresPayment = !m.includesClasses && occasion.dropInPriceCents > 0n;

  const warnings: BookingWarning[] = [];
  if (m.status === 'PAST_DUE') warnings.push('WILL_BE_DENIED_AT_DOOR');
  if (requiresPayment) warnings.push('REQUIRES_PAYMENT');
  if (occasion.capacity - occasion.bookedCount <= settings.lastSpotsThreshold) {
    warnings.push('LAST_SPOTS');
  }

  return {
    outcome: 'ALLOW',
    requiresPayment,
    priceCents: requiresPayment ? occasion.dropInPriceCents : 0n,
    warnings,
  };
}

// ── Cancelación ─────────────────────────────────────────────────────────────

export type CancellationDecision =
  | {
      readonly outcome: 'ALLOW';
      /** Fuera de plazo: libera la plaza igual, pero cuenta como falta. */
      readonly late: boolean;
      readonly voidsCharge: boolean;
      readonly countsAsNoShow: boolean;
    }
  | { readonly outcome: 'DENY'; readonly reason: 'NOT_BOOKED' | 'CLASS_ALREADY_STARTED' };

/**
 * Cancelar tarde **libera la plaza igualmente**.
 *
 * Es deliberado y va contra la intuición: castigar la cancelación tardía
 * dejando la plaza bloqueada castiga al gimnasio, no al socio. Se libera para
 * que otro la ocupe, y la falta se apunta en el historial del que canceló
 * —que es donde duele y donde ADR-025 permite que duela.
 */
export function evaluateCancellation(
  booking: { readonly status: ClassBookingStatus; readonly hasCharge: boolean },
  occasion: { readonly startsAt: Date },
  now: Date,
  settings: BookingSettings = DEFAULT_BOOKING_SETTINGS,
): CancellationDecision {
  if (booking.status !== 'BOOKED') return { outcome: 'DENY', reason: 'NOT_BOOKED' };
  if (occasion.startsAt.getTime() <= now.getTime()) {
    return { outcome: 'DENY', reason: 'CLASS_ALREADY_STARTED' };
  }

  const minutesLeft = (occasion.startsAt.getTime() - now.getTime()) / 60_000;
  const late = minutesLeft < settings.cancelCutoffMinutes;

  return {
    outcome: 'ALLOW',
    late,
    // En plazo se anula el cargo de clase suelta; fuera de plazo, no: el
    // gimnasio ya no puede revender esa plaza con antelación.
    voidsCharge: booking.hasCharge && !late,
    countsAsNoShow: late,
  };
}

// ── Sanción por faltas (ADR-025) ────────────────────────────────────────────

/**
 * La sanción NUNCA es dinero.
 *
 * ADR-025 lo decidió por una razón concreta: cobrar una penalización a una
 * tarjeta tokenizada no está cubierto por el mandato de domiciliación —importe
 * y momento son imprevisibles— y el contracargo resultante casi siempre se
 * pierde. El bloqueo de reservas disuade igual y no toca el procesador.
 */
export type NoShowPenalty =
  | { readonly kind: 'NONE' }
  | { readonly kind: 'WARNING'; readonly count: number }
  | { readonly kind: 'BOOKING_BLOCK'; readonly count: number; readonly untilDate: Date; readonly days: number };

export function evaluateNoShowPenalty(
  noShowsInWindow: number,
  from: Date,
  settings: BookingSettings = DEFAULT_BOOKING_SETTINGS,
): NoShowPenalty {
  if (noShowsInWindow >= settings.noShowsBeforeBlock) {
    return {
      kind: 'BOOKING_BLOCK',
      count: noShowsInWindow,
      untilDate: new Date(from.getTime() + settings.blockDays * 86_400_000),
      days: settings.blockDays,
    };
  }
  if (noShowsInWindow === settings.noShowsBeforeBlock - 1) {
    return { kind: 'WARNING', count: noShowsInWindow };
  }
  return { kind: 'NONE' };
}

/**
 * Qué hacer con una reserva cuando la clase termina.
 *
 * Se resuelve en un job posterior al fin de la clase, no al vuelo: una reserva
 * que sigue en `BOOKED` media hora después de terminar la clase es una falta,
 * y nadie va a marcarla a mano.
 */
export function closeBookingStatus(
  booking: { readonly status: ClassBookingStatus; readonly checkedIn: boolean },
): ClassBookingStatus {
  if (booking.status !== 'BOOKED') return booking.status;
  return booking.checkedIn ? 'ATTENDED' : 'NO_SHOW';
}

/**
 * Bajar el cupo por debajo de lo ya reservado NO se permite.
 *
 * La alternativa —recortar y expulsar a los últimos— convierte un error de
 * dedo del gerente en una cancelación silenciosa para un socio que ya había
 * reservado. Que falle y obligue a cancelar a mano es lo correcto.
 */
export function canSetCapacity(newCapacity: number, bookedCount: number): boolean {
  return Number.isInteger(newCapacity) && newCapacity > 0 && newCapacity >= bookedCount;
}
