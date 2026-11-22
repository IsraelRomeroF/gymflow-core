import { z } from 'zod';
import { Id, Instante } from './comun.js';
import { CANALES_DE_SOLICITUD_ARCO, ESTADOS_DE_SOLICITUD_ARCO, RESULTADOS_DE_SOLICITUD_ARCO, TIPOS_DE_SOLICITUD_ARCO } from '../privacidad.js';
import type { ConsentType } from '../intake.js';

/**
 * PRIVACIDAD (auditoría 8, bloque 1.10): solicitudes ARCO con su ciclo
 * completo, las firmas del socio y los textos que firma.
 */

export const CONSENT_TYPES = ['PRIVACY_NOTICE', 'BIOMETRIC', 'RECURRING_CHARGE', 'MARKETING', 'HOUSE_RULES', 'HEALTH_DATA'] as const satisfies readonly ConsentType[];
export const ConsentTypeSchema = z.enum(CONSENT_TYPES);

/** Una solicitud ARCO. `status`, `deadlineAt` y `overdue` los calcula el servidor. */
export const PrivacyRequest = z.object({
  id: Id,
  /** El folio de la constancia que se entrega al socio. */
  folio: z.string(),
  memberId: Id,
  kind: z.enum(TIPOS_DE_SOLICITUD_ARCO),
  channel: z.enum(CANALES_DE_SOLICITUD_ARCO),
  /** El permiso del que se opone o que revoca (solo OPPOSITION y REVOCATION). */
  consentType: ConsentTypeSchema.nullable(),
  note: z.string().nullable(),
  receivedAt: Instante,
  status: z.enum(ESTADOS_DE_SOLICITUD_ARCO),
  /** Cuándo se acreditó que la pide el titular; sin esto el plazo no corre. */
  identityVerifiedAt: Instante.nullable(),
  /** Cómo se acreditó («INE», «En persona», «Sesión de su portal»). */
  identityNote: z.string().nullable(),
  /** Vence responder (procede o no procede). */
  dueAt: Instante,
  resolvedAt: Instante.nullable(),
  outcome: z.enum(RESULTADOS_DE_SOLICITUD_ARCO).nullable(),
  /** La respuesta que lee el socio. */
  resolution: z.string().nullable(),
  /** Vence hacer efectivo lo que procede. */
  effectiveDueAt: Instante.nullable(),
  effectedAt: Instante.nullable(),
  effectNote: z.string().nullable(),
  /** El plazo que corre hoy (responder o hacer efectivo), o null. */
  deadlineAt: Instante.nullable(),
  overdue: z.boolean(),
});
export type PrivacyRequest = z.infer<typeof PrivacyRequest>;

/** `GET /members/:id/privacy-requests` y `GET /portal/privacy-requests`. */
export const MemberPrivacyRequests = z.object({ requests: z.array(PrivacyRequest) });
export type MemberPrivacyRequests = z.infer<typeof MemberPrivacyRequests>;

export const PrivacyInboxItem = PrivacyRequest.extend({
  member: z.object({ fullName: z.string(), memberCode: z.string(), homeBranchId: Id.nullable() }),
});
export type PrivacyInboxItem = z.infer<typeof PrivacyInboxItem>;

/** `GET /privacy/requests`: lo que sigue vivo (identidad, respuesta o hacerlo efectivo). */
export const PrivacyInbox = z.object({ requests: z.array(PrivacyInboxItem) });
export type PrivacyInbox = z.infer<typeof PrivacyInbox>;

/** `GET /privacy/requests/summary`: cifras sin nombres, para Inicio y para la dueña (D-25). */
export const PrivacyRequestsSummary = z.object({
  /** Vivas en total: por acreditar, por responder y por hacer efectivas. */
  open: z.number().int(),
  identityPending: z.number().int(),
  toAnswer: z.number().int(),
  toEffect: z.number().int(),
  overdue: z.number().int(),
  /** El plazo más próximo entre las que corren, o null. */
  nextDeadlineAt: Instante.nullable(),
});
export type PrivacyRequestsSummary = z.infer<typeof PrivacyRequestsSummary>;

/** La constancia que se imprime o se dicta: `GET /privacy/requests/:id/receipt`. */
export const PrivacyRequestReceipt = z.object({
  folio: z.string(),
  gym: z.object({ legalName: z.string(), tradeName: z.string() }),
  member: z.object({ fullName: z.string(), memberCode: z.string() }),
  request: PrivacyRequest,
  /** Plazos en días hábiles, como los dice la ley. */
  deadlines: z.object({ answerBusinessDays: z.number().int(), effectBusinessDays: z.number().int() }),
  issuedAt: Instante,
});
export type PrivacyRequestReceipt = z.infer<typeof PrivacyRequestReceipt>;

/** Una firma del socio (`GET /members/:id/consents` devuelve la lista). */
export const MemberConsent = z.object({
  id: Id,
  consentType: ConsentTypeSchema,
  documentVersion: z.string(),
  granted: z.boolean(),
  grantedAt: Instante,
  revokedAt: Instante.nullable(),
  channel: z.string().nullable(),
  ip: z.string().nullable(),
  evidenceHash: z.string().nullable(),
  /** Firmó un texto biométrico anterior al vigente (6-03, 21-09). */
  needsResign: z.boolean(),
  currentVersion: z.string().nullable(),
  /** ¿Guarda el texto exacto que firmó? Se lee con `GET /members/:id/consents/:cid`. */
  hasText: z.boolean(),
});
export type MemberConsent = z.infer<typeof MemberConsent>;
export const MemberConsents = z.array(MemberConsent);
export type MemberConsents = z.infer<typeof MemberConsents>;

/** Una firma con el texto exacto que se aceptó. */
export const MemberConsentText = z.object({
  id: Id, consentType: ConsentTypeSchema, documentVersion: z.string(), grantedAt: Instante,
  documentText: z.string().nullable(), evidenceHash: z.string().nullable(),
});
export type MemberConsentText = z.infer<typeof MemberConsentText>;

/** `GET /portal/consents`. */
export const PortalConsents = z.object({
  consents: z.array(z.object({
    id: Id, consentType: ConsentTypeSchema, documentVersion: z.string(), granted: z.boolean(),
    grantedAt: Instante, revokedAt: Instante.nullable(),
    revocable: z.boolean(), needsResign: z.boolean(), currentVersion: z.string().nullable(),
  })),
});
export type PortalConsents = z.infer<typeof PortalConsents>;

export const CONSENT_DOCUMENT_STATUSES = ['DRAFT', 'PUBLISHED', 'RETIRED'] as const;

/** Un texto en la lista de `GET /consent-documents` (sin el cuerpo). */
export const ConsentDocumentSummary = z.object({
  id: Id,
  consentType: ConsentTypeSchema,
  version: z.string(),
  status: z.enum(CONSENT_DOCUMENT_STATUSES),
  title: z.string(),
  publishedAt: Instante.nullable(),
  retiredAt: Instante.nullable(),
  bodyHash: z.string().nullable(),
  /** Cuántas firmas guardan esta versión (historial). */
  signatures: z.number().int(),
});
export type ConsentDocumentSummary = z.infer<typeof ConsentDocumentSummary>;
export const ConsentDocumentList = z.object({ documents: z.array(ConsentDocumentSummary) });
export type ConsentDocumentList = z.infer<typeof ConsentDocumentList>;

/** Lo que falta para publicar un borrador: `GET /consent-documents/:id/review`. */
export const ConsentDocumentReview = z.object({
  id: Id,
  consentType: ConsentTypeSchema,
  version: z.string(),
  title: z.string(),
  bodyText: z.string(),
  /** El texto vigente que reemplazaría, para ver la diferencia; null si es el primero. */
  current: z.object({ id: Id, version: z.string(), bodyText: z.string(), publishedAt: Instante.nullable() }).nullable(),
  /** `[CORCHETES]` sin completar: con uno solo no se publica. */
  placeholders: z.array(z.string()),
  /** La lista de verificación (solo el aviso de privacidad): cada punto y si el texto lo trata. */
  checklist: z.array(z.object({ key: z.string(), text: z.string(), found: z.boolean() })),
  /** ¿Se puede publicar tal como está (sin contar las casillas que marca la gerencia)? */
  publishable: z.boolean(),
});
export type ConsentDocumentReview = z.infer<typeof ConsentDocumentReview>;
