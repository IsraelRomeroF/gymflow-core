import { z } from 'zod';
import { Centavos, Id, Instante } from './comun.js';
import { APPROVAL_DELIVERIES, APPROVAL_PROXY_END_REASONS, APPROVAL_REACHES, APPROVAL_REQUEST_STATUSES, APPROVAL_RESOURCE_TYPES } from '../approvals.js';

/**
 * LA SEGUNDA FIRMA (`approvals/approvals.routes.ts`, auditoría 8, bloque 2.10).
 * Antes estos tipos se escribían a mano en `components/autorizacion.tsx` y en
 * `app/(panel)/autorizaciones/page.tsx`.
 */

export const ApprovalRequestStatusSchema = z.enum(APPROVAL_REQUEST_STATUSES);
export const ApprovalDeliverySchema = z.enum(APPROVAL_DELIVERIES);
export const ApprovalReachSchema = z.enum(APPROVAL_REACHES);

/** Quien puede firmar esta operación y cómo se va a enterar (29-05). */
export const ApprovalApprover = z.object({
  userId: Id,
  fullName: z.string(),
  /** Sus firmas están en pausa por intentos fallidos hasta este instante (24-11). */
  pausedUntil: Instante.nullable(),
  reach: ApprovalReachSchema,
  /** D-02: firma como apoderado de esta persona (su nombre); null = firma por su puesto. */
  proxyOf: z.string().nullable(),
});
export type ApprovalApprover = z.infer<typeof ApprovalApprover>;

/** El «no» anterior de la misma operación (D-03): quién, cuándo y por qué. */
export const ApprovalPreviousRejection = z.object({
  requestId: Id,
  at: Instante,
  /** Quién dijo que no: con más de un firmante (apoderado, D-02), la tarjeta distingue «la rechazaste» de «la rechazó X». */
  byUserId: Id.nullable(),
  byName: z.string().nullable(),
  reason: z.string().nullable(),
});
export type ApprovalPreviousRejection = z.infer<typeof ApprovalPreviousRejection>;

/** La pregunta de quien firma en vez de un «no» (D-03): la solicitud sigue viva. */
export const ApprovalQuestion = z.object({
  text: z.string(),
  at: Instante,
  byUserId: Id.nullable(),
  byName: z.string().nullable(),
  /** Lo que contestó quien pidió; null mientras no conteste. */
  answer: z.string().nullable(),
  answeredAt: Instante.nullable(),
});
export type ApprovalQuestion = z.infer<typeof ApprovalQuestion>;

/**
 * Cómo está ESTA operación antes de pedirla (D-03): si ya la rechazaron en
 * las últimas 24 horas, hasta cuándo no se firma en el mostrador y cuántas
 * veces se puede pedir todavía en esta hora.
 */
export const ApprovalOperationState = z.object({
  previousRejection: ApprovalPreviousRejection.nullable(),
  /** Tras un «no»: hasta este instante solo se firma desde la sesión de quien firma. */
  localLockedUntil: Instante.nullable(),
  requestsUsed: z.number().int(),
  requestsMax: z.number().int(),
  /** Con el tope alcanzado: cuándo se puede volver a pedir. */
  nextRequestAt: Instante.nullable(),
});
export type ApprovalOperationState = z.infer<typeof ApprovalOperationState>;

/** `GET /approvals/approvers?permission=&branchId=&amountCents=&resourceId=`. */
export const ApprovalApprovers = z.object({
  approvers: z.array(ApprovalApprover),
  requestTtlSeconds: z.number().int(),
  grantTtlSeconds: z.number().int(),
  /** Solo si la consulta dijo de qué registro se trata (`resourceId`). */
  operation: ApprovalOperationState.nullable(),
});
export type ApprovalApprovers = z.infer<typeof ApprovalApprovers>;

/** Una solicitud de firma a distancia. `POST /approvals/requests` (201). */
export const ApprovalRequest = z.object({
  id: Id,
  permission: z.string(),
  branchId: Id.nullable(),
  resourceType: z.enum(APPROVAL_RESOURCE_TYPES).nullable(),
  resourceId: Id.nullable(),
  amountCents: Centavos.nullable(),
  summary: z.string(),
  reason: z.string().nullable(),
  status: ApprovalRequestStatusSchema,
  decidedAt: Instante.nullable(),
  rejectReason: z.string().nullable(),
  expiresAt: Instante,
  createdAt: Instante,
  /** Lo que le queda a una pendiente según el reloj del servidor (29-06). */
  secondsLeft: z.number().int(),
  /** A cuántos teléfonos salió el aviso (29-05). Se llena instantes después de pedir. */
  notifiedCount: z.number().int(),
  /** La primera vez que la bandeja de alguien que puede firmar la mostró (29-05). */
  seenAt: Instante.nullable(),
  /** El «no» anterior de esta misma operación, si lo hubo en las últimas 24 horas (D-03). */
  previousRejection: ApprovalPreviousRejection.nullable(),
  /** Lo que quien pide le contesta a ese «no»: obligatorio para volver a pedir. */
  reply: z.string().nullable(),
  /** Cuántas veces va esta operación en la última hora, contando esta (1 = la primera). */
  attempt: z.number().int(),
  /** Quien firma preguntó en vez de rechazar: la solicitud sigue pendiente. */
  question: ApprovalQuestion.nullable(),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequest>;

/** `GET /approvals/requests/:id`: lo que ve quien la pidió. */
export const ApprovalRequestState = ApprovalRequest.extend({
  approverName: z.string().nullable(),
  /** D-02: quien contestó lo hizo como apoderado de esta persona (su nombre); null = contestó por su puesto. */
  approverProxyOf: z.string().nullable(),
  /** La firma, mientras no se use ni venza (29-03). */
  approvalToken: z.string().nullable(),
  delivery: ApprovalDeliverySchema.nullable(),
});
export type ApprovalRequestState = z.infer<typeof ApprovalRequestState>;

/** `GET /approvals/inbox`: lo que ESTA persona puede firmar ahora. */
export const ApprovalInboxItem = ApprovalRequest.extend({
  requesterName: z.string().nullable(),
  /** De qué se trata, leído de la base (UXG-05). */
  context: z.string().nullable(),
});
export type ApprovalInboxItem = z.infer<typeof ApprovalInboxItem>;
export const ApprovalInbox = z.object({ requests: z.array(ApprovalInboxItem) });
export type ApprovalInbox = z.infer<typeof ApprovalInbox>;

/**
 * Una solicitud ya resuelta, en «Resueltas hoy» (20-05). `mine`: la pidió quien
 * consulta. `delivery` solo en las aprobadas: `used` es que la operación se
 * registró con esa firma; `expired`, que se autorizó y no se usó.
 */
export const ApprovalHistoryItem = z.object({
  id: Id,
  permission: z.string(),
  branchId: Id.nullable(),
  resourceType: z.enum(APPROVAL_RESOURCE_TYPES).nullable(),
  resourceId: Id.nullable(),
  amountCents: Centavos.nullable(),
  summary: z.string(),
  context: z.string().nullable(),
  reason: z.string().nullable(),
  status: z.enum(['APPROVED', 'REJECTED', 'EXPIRED', 'CANCELED']),
  requesterName: z.string().nullable(),
  approverName: z.string().nullable(),
  /** D-02: quien contestó lo hizo como apoderado de esta persona (su nombre); null = contestó por su puesto. */
  approverProxyOf: z.string().nullable(),
  mine: z.boolean(),
  createdAt: Instante,
  /** Cuándo se resolvió: la decisión o, en una vencida, su vencimiento. */
  resolvedAt: Instante,
  rejectReason: z.string().nullable(),
  delivery: ApprovalDeliverySchema.nullable(),
  seenAt: Instante.nullable(),
  notifiedCount: z.number().int(),
  /** D-03: el «no» anterior al que respondía, la respuesta, y lo que se preguntó y contestó. */
  previousRejection: ApprovalPreviousRejection.nullable(),
  reply: z.string().nullable(),
  question: ApprovalQuestion.nullable(),
});
export type ApprovalHistoryItem = z.infer<typeof ApprovalHistoryItem>;

/** `GET /approvals/history`: las resueltas de las últimas 24 horas, la más reciente primero (hasta 100). */
export const ApprovalHistory = z.object({
  requests: z.array(ApprovalHistoryItem),
  /** `all`: todo lo que esta persona puede firmar, más lo que pidió; `mine`: solo lo que pidió. */
  scope: z.enum(['all', 'mine']),
  windowHours: z.number().int(),
});
export type ApprovalHistory = z.infer<typeof ApprovalHistory>;

// ── Apoderado temporal (D-02, bloque 3.1) ───────────────────────────────────

/** Un nombramiento de apoderado. `active`: abierto y con su fecha de fin por delante. */
export const ApprovalProxyAppointment = z.object({
  id: Id,
  proxyUserId: Id,
  proxyName: z.string().nullable(),
  grantedByUserId: Id,
  grantedByName: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: Instante,
  /** Hasta cuándo vale: el fin del día elegido, en la zona del gimnasio. */
  endsAt: Instante,
  /** Cuándo y por qué dejó de valer; un vencido que nadie ha cerrado todavía dice `EXPIRED` con su `endsAt`. */
  endedAt: Instante.nullable(),
  endReason: z.enum(APPROVAL_PROXY_END_REASONS).nullable(),
  active: z.boolean(),
  /** Cuántas firmas dio y cuántas solicitudes rechazó con este nombramiento. */
  signedCount: z.number().int(),
  rejectedCount: z.number().int(),
});
export type ApprovalProxyAppointment = z.infer<typeof ApprovalProxyAppointment>;

/** A quién se puede nombrar: personal activo del gimnasio con cuenta, salvo quien nombra. */
export const ApprovalProxyCandidate = z.object({
  userId: Id,
  fullName: z.string(),
  /** Su puesto, en palabras («Gerente», «Recepción»). */
  roleLabel: z.string().nullable(),
  /** Tiene una contraseña temporal o recién restablecida: todavía no puede firmar. */
  cannotSignYet: z.boolean(),
});
export type ApprovalProxyCandidate = z.infer<typeof ApprovalProxyCandidate>;

/**
 * `GET /approvals/proxy`. `canManage`: quien consulta es quien da la segunda
 * firma por su puesto (el dueño) y puede nombrar o revocar. `mine`: quien
 * consulta ES el apoderado vigente. Los candidatos y la historia solo van
 * para quien administra.
 */
export const ApprovalProxyState = z.object({
  canManage: z.boolean(),
  mine: z.boolean(),
  current: ApprovalProxyAppointment.nullable(),
  candidates: z.array(ApprovalProxyCandidate),
  history: z.array(ApprovalProxyAppointment),
  /** Hoy y el último día elegible como fin, en la fecha del gimnasio (`YYYY-MM-DD`). */
  today: z.string(),
  lastDay: z.string(),
  maxDays: z.number().int(),
});
export type ApprovalProxyState = z.infer<typeof ApprovalProxyState>;
