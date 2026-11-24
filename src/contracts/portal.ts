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

  // ── Fase 3, bloque 3.10 · la regla del rostro (D-06) y el pase de prueba (D-08) ──
  /** Su pase de PRUEBA de hoy (D-08): gratis, una vez, solo hoy y solo en esa sede. */
  trialPass: z.object({ branchName: z.string(), validOn: Fecha }).nullable(),
  /**
   * El gimnasio pide entrar con el rostro en su sede (D-06: la regla está
   * encendida y la sede usa biometría). Con ella, quien retira su rostro
   * necesita la autorización de la gerencia en cada visita.
   */
  faceRule: z.boolean(),
  /**
   * Su plan o su paquete dicen que sí, pero LA PUERTA lo detendría por no
   * tener rostro registrado (`BIOMETRIC_REQUIRED`): hoy entra solo si la
   * gerencia autoriza la visita. `canEnter` sigue contestando por su plan.
   */
  faceMissing: z.boolean(),
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
  /**
   * La sesión de este teléfono (D-04, bloque 4.1): queda abierta mientras se use. `idleDays` son los días
   * sin abrirlo tras los que se cierra, y `expiresAt`, el día en que se cerraría si no se volviera a abrir.
   */
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
  /**
   * El aviso del cambio de precio de su plan (D-19; fase 3, bloque 3.10), el
   * mismo del comprobante del mostrador (`PaymentReceipt.priceNotice`):
   * `UPCOMING` si lo pagará desde su siguiente pago, `APPLIED` si este es el
   * primer pago al precio nuevo. `null` si no hay nada que avisar.
   */
  priceNotice: z.object({
    kind: z.enum(['UPCOMING', 'APPLIED']),
    planName: z.string().nullable(),
    fromPriceCents: Centavos,
    toPriceCents: Centavos,
  }).nullable(),
  /**
   * Lo que el recibo imprime del gimnasio, igual que el del mostrador (D-27; bloque 4.11 con los datos de
   * 4.6): su logo (`data:` URL) arriba y, al pie, la leyenda, el teléfono, el WhatsApp y el RFC. Lo que no
   * esté registrado viene en `null` y no sale.
   */
  gym: z.object({
    logo: z.string().nullable(),
    phone: z.string().nullable(),
    whatsapp: z.string().nullable(),
    rfc: z.string().nullable(),
    receiptLegend: z.string().nullable(),
  }),
});
export type PortalReceipt = z.infer<typeof PortalReceipt>;

// ── Fase 3, bloque 3.10 · D-35: lo que puede renovar o comprar, a precio de lista ──

/**
 * Qué se vende: un plan por periodo, un paquete de visitas o un pase del día
 * (los tres son planes del catálogo; `BillingModel`).
 */
export const PORTAL_OFFER_KINDS = ['PLAN', 'VISIT_PACK', 'DAY_PASS'] as const;

/** Un plan que el gimnasio vende en la sede del socio, a su precio de LISTA ahí. */
export const PortalOfferPlan = z.object({
  id: Id,
  name: z.string(),
  description: z.string().nullable(),
  kind: z.enum(PORTAL_OFFER_KINDS),
  /** El precio de lista en su sede (el propio de la sede si lo tiene). Sin promociones ni descuentos. */
  priceCents: Centavos,
  /** La inscripción del plan, si cobra una (`'0'` = no cobra). Si le toca pagarla lo dice recepción. */
  signupFeeCents: Centavos,
  /** Cada cuánto se paga: `MONTH` × 1 = mensual. En un paquete o un pase no aplica. */
  durationUnit: z.enum(['DAY', 'WEEK', 'MONTH', 'VISIT']),
  durationValue: z.number().int(),
  /** Solo paquetes: cuántas visitas trae y cuántos días duran. */
  visitsIncluded: z.number().int().nullable(),
  visitValidityDays: z.number().int().nullable(),
  includesClasses: z.boolean(),
  /** Es el plan que tiene hoy (o el último que tuvo). */
  current: z.boolean(),
});
export type PortalOfferPlan = z.infer<typeof PortalOfferPlan>;

/**
 * `GET /portal/offer` (D-35 c, sin procesador): SOLO LECTURA. Lo que el socio
 * puede renovar o comprar y a qué precio de lista, para que llegue al
 * mostrador sabiendo cuánto es. No vende, no aparta y no mueve dinero: eso
 * llega con el cobro en línea (fase 5). Las promociones y los descuentos de
 * estudiante o de familia no aparecen aquí: se aplican en el mostrador.
 */
export const PortalOffer = z.object({
  /** La sede cuyos precios se muestran: la suya de casa; `null` = los de lista del gimnasio. */
  branchName: z.string().nullable(),
  /** ¿Se puede comprar desde el teléfono? Hoy siempre `false`: se paga en recepción. */
  purchasable: z.boolean(),
  /**
   * Renovar su mismo plan: al precio que tiene (`AGREED`) si su membresía
   * sigue viva, o al de lista (`LIST`) si ya terminó. `null` si nunca tuvo
   * plan o el suyo ya no se vende en su sede.
   */
  renewal: z.object({
    planId: Id,
    planName: z.string(),
    priceCents: Centavos,
    priceKind: z.enum(['AGREED', 'LIST']),
    /** Primer día del periodo que pagaría: el fin del actual; `null` si ya terminó (empieza el día que pague). */
    from: Fecha.nullable(),
    /** Su membresía se renueva sola: no tiene que pedirlo, solo pagar. */
    autoRenew: z.boolean(),
  }).nullable(),
  /** Planes, paquetes y pases que se venden en su sede, del más barato al más caro dentro de cada tipo. */
  plans: z.array(PortalOfferPlan),
  /** Clases sueltas con precio (solo si el gimnasio tiene clases). */
  classes: z.array(z.object({ id: Id, name: z.string(), dropInPriceCents: Centavos })),
});
export type PortalOffer = z.infer<typeof PortalOffer>;

// ── Fase 3, bloque 3.10 · D-34: notificaciones gratis que el socio enciende y apaga ──

/**
 * De qué se le notifica al teléfono y puede apagar. Lo demás (su portal se
 * abrió en otro teléfono, su membresía se suspendió, privacidad) llega siempre.
 *  - `payments`: un pago por vencer o vencido;
 *  - `classes`: su clase de mañana.
 */
export const PORTAL_NOTIFICATION_TOPICS = ['payments', 'classes'] as const;
export type PortalNotificationTopic = (typeof PORTAL_NOTIFICATION_TOPICS)[number];

export const PortalNotificationPreferences = z.object({ payments: z.boolean(), classes: z.boolean() });
export type PortalNotificationPreferences = z.infer<typeof PortalNotificationPreferences>;

/**
 * `GET /portal/notifications` y `PUT /portal/notifications/preferences`. Las
 * notificaciones son del navegador (Web Push con llaves propias del
 * servidor): no cuestan y no pasan por ningún proveedor contratado (D-34 c).
 */
export const PortalNotifications = z.object({
  /** El servidor puede notificar (tiene sus llaves). Sin ellas, los avisos solo se ven en la campana. */
  available: z.boolean(),
  /** La llave pública con que el teléfono se suscribe; `null` si no hay. */
  publicKey: z.string().nullable(),
  /** En cuántos de sus teléfonos con el portal abierto están encendidas. */
  devices: z.number().int(),
  preferences: PortalNotificationPreferences,
});
export type PortalNotifications = z.infer<typeof PortalNotifications>;
