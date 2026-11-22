import { z } from 'zod';
import { Centavos, Id, Instante } from './comun.js';
import { APPROVAL_DELIVERIES, APPROVAL_REACHES, APPROVAL_REQUEST_STATUSES, APPROVAL_RESOURCE_TYPES } from '../approvals.js';

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
});
export type ApprovalApprover = z.infer<typeof ApprovalApprover>;

/** `GET /approvals/approvers?permission=&branchId=&amountCents=`. */
export const ApprovalApprovers = z.object({
  approvers: z.array(ApprovalApprover),
  requestTtlSeconds: z.number().int(),
  grantTtlSeconds: z.number().int(),
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
});
export type ApprovalRequest = z.infer<typeof ApprovalRequest>;

/** `GET /approvals/requests/:id`: lo que ve quien la pidió. */
export const ApprovalRequestState = ApprovalRequest.extend({
  approverName: z.string().nullable(),
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
  mine: z.boolean(),
  createdAt: Instante,
  /** Cuándo se resolvió: la decisión o, en una vencida, su vencimiento. */
  resolvedAt: Instante,
  rejectReason: z.string().nullable(),
  delivery: ApprovalDeliverySchema.nullable(),
  seenAt: Instante.nullable(),
  notifiedCount: z.number().int(),
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
