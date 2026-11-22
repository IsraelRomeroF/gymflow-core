import { z } from 'zod';
import { Centavos, Fecha, Id, Instante } from './comun.js';
import {
  BiometricModalitySchema, ChargeStatusSchema, DenialReasonSchema, MembershipStatusSchema, PaymentMethodSchema, VisitPackStatusSchema,
} from './enums.js';
import { Pagina, RestoDeLista } from './lista.js';
import { SettledBySchema } from './billing.js';

/**
 * PORTAL DEL SOCIO (`portal/portal.routes.ts`). Lo que el socio ve de su
 * propio dinero. Antes `Cargo` y `Pago` estaban escritos a mano en
 * `gymflow-portal/components/movimientos.tsx` y otra vez en Inicio y Pagos.
 */

/** `GET /portal/me`: el socio, su membresía y cómo entra. */
export const PortalMe = z.object({
  memberId: Id,
  memberCode: z.string(),
  fullName: z.string(),
  /** Desde cuándo viene (día de calendario). */
  joinedAt: Fecha,
  tenureDays: z.number().int(),
  /** La viva, o la suspendida si debe una cuota; `null` sin plan. */
  membershipStatus: MembershipStatusSchema.nullable(),
  planName: z.string().nullable(),
  /** Fin SEMIABIERTO del periodo en curso. */
  currentPeriodEnd: Fecha.nullable(),
  /** Último día que cubren sus cuotas PAGADAS (3-01). No es el fin del periodo. */
  paidThrough: Fecha.nullable(),
  graceUntil: Fecha.nullable(),
  /** Cuánto y cuándo se le cobra si su membresía se renueva sola; `null` si no renueva. */
  nextPayment: z.object({ amountCents: Centavos, date: Fecha }).nullable(),
  gymName: z.string(),
  homeBranchName: z.string().nullable(),
  /**
   * La zona horaria con que el portal pinta fechas y horas (1.5): la de su
   * sede de casa, o la del gimnasio. Sin ella, el teléfono usaba la suya.
   */
  timezone: z.string(),
  /** Con qué entra y dónde (ADR-032). Vacío = entra por recepción. */
  accessMethods: z.array(z.object({ modality: BiometricModalitySchema, branchName: z.string(), enrolledAt: Instante })),
  /** Los módulos encendidos. EN RETIRO (2.8): el portal ya lee `features`; se quita cuando nadie lo lea. */
  modules: z.array(z.string()),
  /** Sin procesador conectado no se ofrece domiciliar ni pagar aquí. EN RETIRO: igual a `features.onlinePayments`. */
  onlinePayments: z.boolean(),
  /** Ya domicilió: Inicio deja de invitarlo a hacerlo. */
  hasCardOnFile: z.boolean(),

  // ── «¿Puedo entrar hoy?» (bloque 2.8 · 27-04, 25-04) ──────────────────────
  /**
   * Lo que diría LA PUERTA ahora mismo: `evaluateAccess` del núcleo con lo
   * mismo que arma el mostrador, en `accessBranchName`. El portal no decide
   * nada: lo pinta.
   */
  canEnter: z.boolean(),
  /** Por qué no entra (el mismo catálogo que la puerta); `null` si entra. */
  accessReason: DenialReasonSchema.nullable(),
  /** La sede donde vale esa respuesta: la suya de casa, o la de su pase de hoy si es con eso con lo que entra. */
  accessBranchName: z.string().nullable(),
  /** Esa entrada gastaría una visita de su paquete. */
  accessUsesVisit: z.boolean(),
  /** Su paquete de visitas (el activo o, si no hay, el más reciente); `null` si nunca compró uno. */
  visitPack: z.object({
    status: VisitPackStatusSchema,
    visitsLeft: z.number().int(),
    visitsPurchased: z.number().int(),
    expiresOn: Fecha.nullable(),
  }).nullable(),
  /** Su pase del día PAGADO de hoy (1.8): solo hoy y solo en esa sede. */
  dayPass: z.object({ branchName: z.string(), validOn: Fecha }).nullable(),
  /**
   * Sin membresía viva ni suspendida, la última que tuvo: «Tu mensualidad
   * terminó», no «Todavía no tienes membresía» (25-04). `paidThrough` es el
   * último día que pagó; `periodEnd`, el último día de su último periodo.
   */
  planEnded: z.object({
    planName: z.string().nullable(),
    how: z.enum(['EXPIRED', 'CANCELED']),
    paidThrough: Fecha.nullable(),
    periodEnd: Fecha,
  }).nullable(),
  /** Lo que este gimnasio le ofrece al socio en el portal (sustituye a `modules` y `onlinePayments`). */
  features: z.object({ classes: z.boolean(), routines: z.boolean(), onlinePayments: z.boolean() }),
});
export type PortalMe = z.infer<typeof PortalMe>;

/** Un cargo del socio. Aquí el saldo SÍ es 0 en un cargo anulado o condonado. */
export const PortalCharge = z.object({
  id: Id,
  concept: z.string(),
  status: ChargeStatusSchema,
  amountCents: Centavos,
  amountLabel: z.string(),
  balanceCents: Centavos,
  dueDate: Fecha,
  /** Cómo quedó saldado (3-06): la misma palabra que ve recepción. `null` si debe algo o se anuló. */
  settledBy: SettledBySchema.nullable(),
});
export type PortalCharge = z.infer<typeof PortalCharge>;

/** Un pago del socio (negativo = te devolvimos). No trae su estado. */
export const PortalPayment = z.object({
  id: Id,
  method: PaymentMethodSchema,
  amountCents: Centavos,
  amountLabel: z.string(),
  folio: z.string().nullable(),
  businessDate: Fecha,
  /** Tiene comprobante que el socio puede abrir y descargar (2.8 · 25-14): un pago aplicado o su contra-asiento. */
  hasReceipt: z.boolean(),
});
export type PortalPayment = z.infer<typeof PortalPayment>;

/** `GET /portal/statement/charges?cursor=&limit=`: la siguiente página de cargos. */
export const PortalChargesPage = Pagina(PortalCharge);
export type PortalChargesPage = z.infer<typeof PortalChargesPage>;
/** `GET /portal/statement/payments?cursor=&limit=`: la siguiente página de pagos. */
export const PortalPaymentsPage = Pagina(PortalPayment);
export type PortalPaymentsPage = z.infer<typeof PortalPaymentsPage>;

/**
 * `GET /portal/statement?limit=`: el saldo y lo más reciente (24 por omisión)
 * de cargos y de pagos. Como en el panel, `charges` y `payments` son listas
 * con la primera página (más todo cargo que deba, aunque sea viejo) y `pages`
 * dice cuántos hay y cómo pedir los demás («Ver más»).
 */
export const PortalStatement = z.object({
  computedAt: Instante,
  outstandingCents: Centavos,
  creditCents: Centavos,
  /** NEGATIVO = tiene saldo a favor. */
  netBalanceCents: Centavos,
  netBalanceLabel: z.string(),
  charges: z.array(PortalCharge),
  payments: z.array(PortalPayment),
  pages: z.object({ charges: RestoDeLista, payments: RestoDeLista }),
});
export type PortalStatement = z.infer<typeof PortalStatement>;

// ── Bloque 2.8 · portal útil sin procesador ─────────────────────────────────

/**
 * `GET /portal/attendance/summary`: sus visitas contadas por DÍAS, en el día
 * de operación del gimnasio (27-05, 25-16). Dos entradas el mismo día son una
 * visita; Inicio y Asistencia leen lo mismo.
 */
export const PortalAttendanceSummary = z.object({
  /** Hoy en su sede. */
  today: Fecha,
  /** Días distintos que vino en el mes en curso. */
  daysThisMonth: z.number().int(),
  /** Días distintos que vino en los últimos 28 días (hoy incluido): entre 4 da su «por semana». */
  daysLast28: z.number().int(),
});
export type PortalAttendanceSummary = z.infer<typeof PortalAttendanceSummary>;

/** `GET /portal/attendance`: sus días de visita (los más recientes primero) y las últimas entradas. */
export const PortalAttendance = z.object({
  /** Días distintos con visita, de unos cuatro meses para acá. */
  days: z.array(Fecha),
  visits: z.array(z.object({
    at: Instante,
    /** El día de operación en que cuenta esa entrada. */
    day: Fecha,
    branchId: Id,
    branchName: z.string().nullable(),
  })),
});
export type PortalAttendance = z.infer<typeof PortalAttendance>;

/**
 * Qué tan arriba va un aviso (25-11): `RESOLVE` = dinero o acceso que HOY
 * sigue pendiente; `CLASS` = su clase; `INFO` = lo demás, y también el aviso
 * de dinero que ya se resolvió.
 */
export const NOTICE_PRIORITIES = ['RESOLVE', 'CLASS', 'INFO'] as const;
export const NoticePrioritySchema = z.enum(NOTICE_PRIORITIES);
export type NoticePriority = z.infer<typeof NoticePrioritySchema>;

/** `GET /portal/notices`: ordenados por prioridad y, dentro, del más nuevo al más viejo. */
export const PortalNotices = z.object({
  unread: z.number().int(),
  notices: z.array(z.object({
    id: Id,
    kind: z.string(),
    title: z.string(),
    body: z.string(),
    createdAt: Instante,
    readAt: Instante.nullable(),
    priority: NoticePrioritySchema,
  })),
});
export type PortalNotices = z.infer<typeof PortalNotices>;

/** `GET /portal/sessions`: en cuántos teléfonos está abierto y hasta cuándo queda abierto ESTE. */
export const PortalSessions = z.object({
  active: z.number().int(),
  lastSeenAt: Instante.nullable(),
  /** La sesión de este teléfono: su hora tope y a los cuántos días sin abrirlo se cierra antes. */
  current: z.object({ expiresAt: Instante, idleDays: z.number().int() }),
});
export type PortalSessions = z.infer<typeof PortalSessions>;

/**
 * `GET /portal/payments/:id/receipt`: el comprobante de UN pago suyo, con lo
 * mínimo (25-14). No es un CFDI.
 */
export const PortalReceipt = z.object({
  gymName: z.string(),
  branchName: z.string().nullable(),
  memberName: z.string(),
  memberCode: z.string(),
  folio: z.string().nullable(),
  method: PaymentMethodSchema,
  /** Negativo = devolución. */
  amountCents: Centavos,
  /** Lo que quedó a su favor de ese pago. */
  unappliedCents: Centavos,
  businessDate: Fecha,
  receivedAt: Instante,
  /** Es el contra-asiento de un pago anterior. */
  reversal: z.boolean(),
  /** A qué se aplicó. */
  lines: z.array(z.object({ concept: z.string(), amountCents: Centavos })),
});
export type PortalReceipt = z.infer<typeof PortalReceipt>;
