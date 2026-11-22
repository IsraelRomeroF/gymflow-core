import { z } from 'zod';
import { Centavos, Fecha, Id, Instante } from './comun.js';

/**
 * CLASES (auditoría 8, bloque 2.5): lo que el panel lee de nuevo.
 *
 *  - La lista de la sesión sabe si la clase suelta está pagada (11-03).
 *  - Las clases de un socio, para su ficha (11-04).
 *  - Las reglas de reserva que fija cada gimnasio (11-08).
 *  - Sesión única, editar un horario y pausas por fechas (11-05, 11-06).
 */

export const CLASS_BOOKING_STATUSES = ['BOOKED', 'CANCELED', 'ATTENDED', 'NO_SHOW'] as const;
export const ClassBookingStatusSchema = z.enum(CLASS_BOOKING_STATUSES);

/**
 * Cómo va el dinero de un lugar en una clase: `INCLUDED` (va en su plan, no
 * hay cargo), `PAID` (clase suelta pagada), `PENDING` (clase suelta por
 * pagar) o `WAIVED` (el cargo se anuló o se condonó: no se le cobra).
 */
export const CLASS_BOOKING_PAYMENTS = ['INCLUDED', 'PAID', 'PENDING', 'WAIVED'] as const;
export const ClassBookingPaymentSchema = z.enum(CLASS_BOOKING_PAYMENTS);
export type ClassBookingPayment = z.infer<typeof ClassBookingPaymentSchema>;

/** Un lugar en la lista de la sesión. */
export const SessionBooking = z.object({
  id: Id,
  /** `null` cuando quien mira es un coach y el socio no es suyo ni la sesión es la que imparte. */
  memberId: Id.nullable(),
  fullName: z.string().nullable(),
  memberCode: z.string().nullable(),
  status: ClassBookingStatusSchema,
  checkedInAt: Instante.nullable(),
  lateCancel: z.boolean(),
  /** Quién la apartó: el socio desde su teléfono o el mostrador. */
  source: z.enum(['PORTAL', 'FRONT_DESK']),
  payment: ClassBookingPaymentSchema,
  /** El cargo de la clase suelta; `null` si va incluida o si quien mira no ve a esta persona. */
  chargeId: Id.nullable(),
  /** Lo que falta por pagar de ese cargo («0» si no debe nada). */
  pendingCents: Centavos,
  /** «$150.00» cuando falta por pagar; si no, `null`. */
  pendingLabel: z.string().nullable(),
  /** El lugar cuenta, la persona no se dice. */
  hidden: z.boolean().optional(),
});
export type SessionBooking = z.infer<typeof SessionBooking>;

/** `GET /classes/schedules/:id/bookings`. */
export const SessionBookings = z.object({
  bookings: z.array(SessionBooking),
  /** Cuántos lugares vivos (no cancelados) siguen por pagar. */
  pendingCount: z.number().int(),
});
export type SessionBookings = z.infer<typeof SessionBookings>;

/** Una clase del socio, pasada o por venir. */
export const MemberClassBooking = z.object({
  id: Id,
  classScheduleId: Id,
  className: z.string().nullable(),
  coachName: z.string().nullable(),
  branchId: Id,
  branchName: z.string().nullable(),
  room: z.string().nullable(),
  startsAt: Instante,
  endsAt: Instante,
  status: ClassBookingStatusSchema,
  lateCancel: z.boolean(),
  checkedInAt: Instante.nullable(),
  source: z.enum(['PORTAL', 'FRONT_DESK']),
  payment: ClassBookingPaymentSchema,
  chargeId: Id.nullable(),
  pendingCents: Centavos,
  pendingLabel: z.string().nullable(),
});
export type MemberClassBooking = z.infer<typeof MemberClassBooking>;

/**
 * `GET /members/:id/bookings`: lo que viene (reservas vivas de clases que no
 * han terminado) y lo de los últimos 30 días, lo más reciente primero.
 */
export const MemberClassBookings = z.object({
  upcoming: z.array(MemberClassBooking),
  recent: z.array(MemberClassBooking),
  /** Bloqueo vigente por faltas, o `null`. */
  block: z.object({ until: Instante, noShowCount: z.number().int() }).nullable(),
  /** Faltas (y cancelaciones fuera de plazo) dentro de la ventana que fija el gimnasio. */
  noShows: z.object({ count: z.number().int(), windowDays: z.number().int(), blockAt: z.number().int() }),
});
export type MemberClassBookings = z.infer<typeof MemberClassBookings>;

/** Las cinco reglas de reserva de un gimnasio. */
export const ClassRules = z.object({
  maxDaysAhead: z.number().int(),
  cancelCutoffMinutes: z.number().int(),
  noShowWindowDays: z.number().int(),
  noShowsBeforeBlock: z.number().int(),
  blockDays: z.number().int(),
});
export type ClassRules = z.infer<typeof ClassRules>;

/** `GET /classes/settings` y `PUT /classes/settings`. */
export const ClassSettings = z.object({
  rules: ClassRules,
  /** Las de fábrica, para decir «como venía» y poder volver a ellas. */
  defaults: ClassRules,
  /** `true` si el gimnasio nunca las ha cambiado. */
  isDefault: z.boolean(),
  updatedAt: Instante.nullable(),
  updatedByName: z.string().nullable(),
});
export type ClassSettings = z.infer<typeof ClassSettings>;

/** `POST /classes/schedules`: una sesión única, fuera del horario semanal. */
export const ClassSessionCreated = z.object({
  id: Id,
  branchId: Id,
  classTypeId: Id,
  startsAt: Instante,
  endsAt: Instante,
  capacity: z.number().int(),
  /** `SHIFTED` o `AMBIGUOUS` si el cambio de hora movió la hora pedida. */
  timeShifted: z.string().nullable(),
});
export type ClassSessionCreated = z.infer<typeof ClassSessionCreated>;

/** Una sesión que un cambio de horario dejó como estaba porque ya tiene lugares reservados. */
export const KeptSession = z.object({ scheduleId: Id, startsAt: Instante, bookedCount: z.number().int() });

/**
 * `PATCH /classes/templates/:id`: qué pasó con las sesiones ya generadas.
 * Las que no tenían reservas se rehacen; las que tienen se quedan como
 * estaban y se dicen una por una.
 */
export const ClassTemplateUpdated = z.object({
  ok: z.literal(true),
  /** Sesiones futuras que solo cambiaron de cupo, duración, salón o coach. */
  updated: z.number().int(),
  /** Sesiones futuras sin reservas que se quitaron porque su día u hora ya no está en el horario. */
  removed: z.number().int(),
  /** Sesiones nuevas generadas. */
  generated: z.number().int(),
  kept: z.array(KeptSession),
});
export type ClassTemplateUpdated = z.infer<typeof ClassTemplateUpdated>;

/** Una pausa del horario: del `fromDate` al `toDate`, los dos incluidos. */
export const ClassPause = z.object({
  id: Id,
  /** `null` = todas las sucursales del gimnasio. */
  branchId: Id.nullable(),
  branchName: z.string().nullable(),
  fromDate: Fecha,
  toDate: Fecha,
  reason: z.string(),
  createdAt: Instante,
  createdByName: z.string().nullable(),
});
export type ClassPause = z.infer<typeof ClassPause>;

/** `GET /classes/pauses`: las que no han terminado. */
export const ClassPauses = z.object({ pauses: z.array(ClassPause) });
export type ClassPauses = z.infer<typeof ClassPauses>;

/** `POST /classes/pauses`. */
export const ClassPauseCreated = z.object({
  pause: ClassPause,
  canceledClasses: z.number().int(),
  canceledBookings: z.number().int(),
});
export type ClassPauseCreated = z.infer<typeof ClassPauseCreated>;

/** `DELETE /classes/pauses/:id`. */
export const ClassPauseEnded = z.object({
  ok: z.literal(true),
  /** Sesiones que la pausa había cancelado, todavía no empezaban y vuelven (vacías). */
  restored: z.number().int(),
  generated: z.number().int(),
});
export type ClassPauseEnded = z.infer<typeof ClassPauseEnded>;
