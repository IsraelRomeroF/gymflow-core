import { z } from 'zod';
import { Id, Instante } from './comun.js';

/**
 * DATOS Y MARCA DEL GIMNASIO (D-27, auditoría 8 · fase 4 · bloque 4.6).
 *
 * Nada de esto se cambia desde el panel del gimnasio: razón social, RFC,
 * nombre comercial, logo, teléfonos, horarios y leyenda del recibo los
 * administra la plataforma (la consola), con motivo y bitácora. El panel los
 * muestra y ofrece «Pedir un cambio a GymFlow»: una solicitud que la consola
 * aplica o rechaza con respuesta.
 */

/** Qué dato se pide cambiar. Los de sucursal llevan de cuál; `OTHER` es texto libre y no se aplica solo. */
export const GYM_DATA_FIELDS = ['TRADE_NAME', 'LEGAL_NAME', 'RFC', 'LOGO', 'PHONE', 'WHATSAPP', 'RECEIPT_LEGEND', 'BRANCH_PHONE', 'BRANCH_HOURS', 'OTHER'] as const;
export const GymDataField = z.enum(GYM_DATA_FIELDS);
export type GymDataField = z.infer<typeof GymDataField>;
/** Los datos que son de UNA sucursal. */
export const GYM_BRANCH_FIELDS: readonly GymDataField[] = ['BRANCH_PHONE', 'BRANCH_HOURS'];

export const GYM_CHANGE_REQUEST_STATUSES = ['PENDING', 'APPLIED', 'REJECTED'] as const;
export const GymChangeRequestStatus = z.enum(GYM_CHANGE_REQUEST_STATUSES);
export type GymChangeRequestStatus = z.infer<typeof GymChangeRequestStatus>;

/** Lo que la plataforma lleva de la marca además de sus nombres. Todo puede faltar: se llena cuando el gimnasio lo pide. */
export const GymBrand = z.object({
  rfc: z.string().nullable(),
  /** Teléfono y WhatsApp del gimnasio, en E.164. */
  phone: z.string().nullable(),
  whatsapp: z.string().nullable(),
  /** Lo que se imprime al pie del recibo. */
  receiptLegend: z.string().nullable(),
  /** El logo, como `data:` URL (PNG, JPEG o WebP). */
  logo: z.string().nullable(),
  /** Teléfono y horario de cada sucursal. */
  branches: z.array(z.object({
    id: Id, code: z.string(), name: z.string(), isActive: z.boolean(),
    phone: z.string().nullable(),
    /** En texto: «Lunes a viernes de 6:00 a 22:00». */
    openingHours: z.string().nullable(),
  })),
});
export type GymBrand = z.infer<typeof GymBrand>;

/** `GET /organization/logo`: el logo del gimnasio para el recibo (aparte, para no cargarlo en cada pantalla). */
export const GymLogo = z.object({ logo: z.string().nullable() });
export type GymLogo = z.infer<typeof GymLogo>;

/** Una solicitud de cambio, como la ve el gimnasio que la mandó. */
export const GymChangeRequest = z.object({
  id: Id,
  field: GymDataField,
  /** La sucursal, en los datos de sucursal. */
  branchId: Id.nullable(),
  branchName: z.string().nullable(),
  /** El valor nuevo que se pidió (en el logo, `null`: va la imagen). */
  proposedValue: z.string().nullable(),
  proposedLogo: z.string().nullable(),
  reason: z.string(),
  requestedBy: z.object({ id: Id, fullName: z.string() }),
  requestedAt: Instante,
  status: GymChangeRequestStatus,
  /** Lo que GymFlow contestó. Al rechazar siempre viene. */
  response: z.string().nullable(),
  /** El valor que quedó (GymFlow puede ajustar lo pedido). */
  appliedValue: z.string().nullable(),
  resolvedAt: Instante.nullable(),
  /** La mandó quien pregunta. */
  mine: z.boolean(),
  /** Quien la pidió ya vio el resultado. */
  seen: z.boolean(),
});
export type GymChangeRequest = z.infer<typeof GymChangeRequest>;

/** `GET /organization/change-requests`. */
export const GymChangeRequestList = z.object({
  requests: z.array(GymChangeRequest),
  /** Las MÍAS ya resueltas que todavía no veo: el aviso de arriba del panel. */
  unseen: z.number().int(),
});
export type GymChangeRequestList = z.infer<typeof GymChangeRequestList>;

/** `POST /organization/change-requests/seen`. */
export const GymChangeRequestsSeen = z.object({ seen: z.number().int() });
export type GymChangeRequestsSeen = z.infer<typeof GymChangeRequestsSeen>;

/** Una solicitud, como la ve la consola: con la marca y el valor que el dato tiene hoy. */
export const PlatformChangeRequest = GymChangeRequest.omit({ mine: true, seen: true }).extend({
  organizationId: Id,
  tradeName: z.string(),
  /** El valor de HOY del dato (en el logo y en «otro dato», `null`). */
  currentValue: z.string().nullable(),
  /** Cuándo vio el resultado quien la pidió. */
  seenAt: Instante.nullable(),
});
export type PlatformChangeRequest = z.infer<typeof PlatformChangeRequest>;

/** `GET /platform/change-requests`: las pendientes de todas las marcas, de la más vieja a la más nueva. */
export const PlatformChangeRequestList = z.object({ pending: z.number().int(), requests: z.array(PlatformChangeRequest) });
export type PlatformChangeRequestList = z.infer<typeof PlatformChangeRequestList>;

/** `GET /platform/organizations/:id/brand`: la ficha de marca y sus solicitudes (pendientes primero). */
export const PlatformBrand = GymBrand.extend({
  organizationId: Id,
  tradeName: z.string(),
  legalName: z.string(),
  requests: z.array(PlatformChangeRequest),
});
export type PlatformBrand = z.infer<typeof PlatformBrand>;
