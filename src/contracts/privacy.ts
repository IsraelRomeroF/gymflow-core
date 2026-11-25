import { z } from 'zod';
import { Id, Instante } from './comun.js';
import { Fecha } from './comun.js';
import { CANALES_DE_SOLICITUD_ARCO, ESTADOS_DE_SOLICITUD_ARCO, RESULTADOS_DE_SOLICITUD_ARCO, TIPOS_DE_SOLICITUD_ARCO } from '../privacidad.js';
import { ESTADOS_DE_LISTA_DE_CONSERVACION, ESTADOS_DE_RENGLON_DE_CONSERVACION } from '../privacidad.js';
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

// ── Conservación (D-32; bloque 3.9) ─────────────────────────────────────────

/** Un exsocio en la lista del mes. El nombre se lee de su ficha: la lista no lo guarda. */
export const PrivacyBatchItem = z.object({
  memberId: Id,
  memberCode: z.string(),
  /** Null cuando ya está anonimizado. */
  fullName: z.string().nullable(),
  homeBranchId: Id.nullable(),
  /** El día de su baja, en su sede. */
  archivedOn: Fecha,
  /**
   * P-01 (4.18): de qué baja entró. `ARCHIVED` = lo dieron de baja en su ficha;
   * `CANCELED` / `EXPIRED` = la baja calculada de D-18 (canceló, o su membresía
   * terminó y no renovó ni volvió a venir). Al firmar, a esos se les da de baja
   * en su ficha y se anonimizan en el mismo acto.
   */
  cause: z.enum(['ARCHIVED', 'CANCELED', 'EXPIRED']),
  status: z.enum(ESTADOS_DE_RENGLON_DE_CONSERVACION),
  /** El motivo con que se sacó de la lista o por el que no se tocó. */
  note: z.string().nullable(),
});
export type PrivacyBatchItem = z.infer<typeof PrivacyBatchItem>;

/** Una lista mensual de conservación, sin sus renglones. */
export const PrivacyBatchSummary = z.object({
  id: Id,
  /** El mes de la lista: `2026-11`. */
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  status: z.enum(ESTADOS_DE_LISTA_DE_CONSERVACION),
  /** El plazo con el que se armó. */
  monthsAfterArchive: z.number().int(),
  /** Entró quien se dio de baja este día o antes. */
  cutoffOn: Fecha,
  preparedAt: Instante,
  signedAt: Instante.nullable(),
  signedByName: z.string().nullable(),
  counts: z.object({ listed: z.number().int(), anonymized: z.number().int(), excluded: z.number().int(), skipped: z.number().int() }),
});
export type PrivacyBatchSummary = z.infer<typeof PrivacyBatchSummary>;

export const PrivacyBatch = PrivacyBatchSummary.extend({ items: z.array(PrivacyBatchItem) });
export type PrivacyBatch = z.infer<typeof PrivacyBatch>;

/** `GET /privacy/conservation`: los plazos, los rostros en espera y la lista del mes. */
export const PrivacyConservation = z.object({
  /** El plazo que rige para anonimizar. */
  monthsAfterArchive: z.number().int(),
  /** `true` si el gimnasio no fijó plazo y rige el de por omisión. */
  monthsIsDefault: z.boolean(),
  faceDaysAfterArchive: z.number().int(),
  /** El día en que los plazos empezaron a correr en este gimnasio; null si el cierre diario aún no pasa. */
  startedOn: Fecha.nullable(),
  /**
   * P-01 (4.18): el día en que la baja calculada (canceló, o terminó sin
   * renovar) empezó a contar en este gimnasio; null si el cierre aún no pasa.
   * A quien ya era baja calculada ese día, los 30 días del rostro le cuentan desde ahí.
   */
  calculatedStartedOn: Fecha.nullable(),
  /** El plazo de baja del gimnasio (D-18): días de terminada sin renovar, y lo que protege una visita. */
  churnDays: z.number().int(),
  /**
   * Rostros de exsocios que siguen guardados y cuándo se borra el próximo.
   * Desde 4.18 cuentan también los de la baja calculada (esos se siguen
   * reconociendo hasta borrarse; la puerta les niega la entrada por no tener plan).
   */
  faces: z.object({
    waiting: z.number().int(),
    nextDeletionOn: Fecha.nullable(),
    /** A quién se le borra y cuándo, del más próximo al más lejano (hasta 200). `fullName` solo para la gerencia. */
    items: z.array(z.object({
      memberId: Id, memberCode: z.string(), fullName: z.string().nullable(),
      cause: z.enum(['ARCHIVED', 'CANCELED', 'EXPIRED']),
      /** Desde qué día cuenta su baja para la conservación. */
      since: Fecha,
      /** Null mientras el cierre no fije el arranque. */
      deletesOn: Fecha.nullable(),
    })),
  }),
  /** La lista que espera firma, con sus renglones; null si no hay. */
  batch: PrivacyBatch.nullable(),
  /** ¿Quien pregunta puede firmarla? */
  canSign: z.boolean(),
  /** ¿Quien pregunta puede sacar a alguien de la lista? */
  canExclude: z.boolean(),
  /** Las últimas listas ya resueltas. */
  history: z.array(PrivacyBatchSummary),
});
export type PrivacyConservation = z.infer<typeof PrivacyConservation>;

/**
 * `GET /members/:id/conservation` (P-01; bloque 4.18): lo que la conservación
 * hace con ESTE socio. La baja para la conservación puede no ser la de D-18
 * que dice la ficha («De baja desde el…»): quien sigue viniendo sin membresía
 * no cuenta. `baja` null = no es baja ni para D-18 (o ya está anonimizado).
 */
export const MemberConservation = z.object({
  memberId: Id,
  /** Hoy en su sede. */
  asOf: Fecha,
  baja: z.object({
    cause: z.enum(['ARCHIVED', 'CANCELED', 'EXPIRED']),
    /** ¿Cuenta ya como baja para borrar su rostro y para la lista? */
    counts: z.boolean(),
    /** Desde qué día cuenta (si `counts`). */
    since: Fecha.nullable(),
    /** Por qué todavía no cuenta (si no `counts`). */
    exception: z.enum(['ENTRADA_RECIENTE', 'PAQUETE_VIVO']).nullable(),
    /** Con una visita reciente: desde qué día contará si no vuelve. */
    countsFrom: Fecha.nullable(),
    /** El último día con una entrada registrada. */
    lastEntryOn: Fecha.nullable(),
  }).nullable(),
  /** ¿Tiene un rostro guardado? Si su baja cuenta, el día en que se borra (null mientras el cierre no fije el arranque). */
  face: z.object({ stored: z.boolean(), deletesOn: Fecha.nullable() }),
  /** Si su baja cuenta: desde qué día entra a la lista mensual por anonimizar (que siempre firma la dueña). */
  listFrom: Fecha.nullable(),
});
export type MemberConservation = z.infer<typeof MemberConservation>;

/** `POST /privacy/conservation/sign`: la lista firmada y lo que se hizo con cada renglón. */
export const PrivacyBatchSigned = z.object({ batch: PrivacyBatch });
export type PrivacyBatchSigned = z.infer<typeof PrivacyBatchSigned>;

/** `GET` y `PUT /privacy/settings`. `monthsAfterArchive` null = rige el plazo por omisión (`effectiveMonths`). */
export const PrivacySettings = z.object({ monthsAfterArchive: z.number().int().nullable(), effectiveMonths: z.number().int() });
export type PrivacySettings = z.infer<typeof PrivacySettings>;

// ── La firma de la dueña en el aviso de privacidad (3.7, D-25) ──────────────

export const NOTICE_SIGNATURE_STATUSES = ['PENDING', 'SIGNED', 'REJECTED', 'STALE'] as const;

/**
 * `GET /consent-documents/signature-requests`: los avisos de privacidad cuya
 * publicación pidió la gerencia y que esperan la firma de la dueña, y los que
 * ella no firmó (con su motivo). `STALE`: el borrador cambió después de
 * pedirla, hay que volver a pedirla.
 */
export const NoticeSignatureRequests = z.object({
  requests: z.array(z.object({
    documentId: Id,
    version: z.string(),
    title: z.string(),
    status: z.enum(NOTICE_SIGNATURE_STATUSES),
    requestedAt: Instante,
    requestedByName: z.string().nullable(),
    reason: z.string(),
    resolvedAt: Instante.nullable(),
    resolvedByName: z.string().nullable(),
    note: z.string().nullable(),
  })),
  /** Quien pregunta es quien firma (la dueña). */
  canSign: z.boolean(),
});
export type NoticeSignatureRequests = z.infer<typeof NoticeSignatureRequests>;

/** `POST /consent-documents/:id/publish`. Con `awaitingSignature` el aviso NO quedó publicado: espera la firma de la dueña. */
export const ConsentDocumentPublishResult = z.object({
  ok: z.literal(true),
  status: z.enum(CONSENT_DOCUMENT_STATUSES),
  publishedAt: Instante.nullable(),
  awaitingSignature: z.boolean(),
});
export type ConsentDocumentPublishResult = z.infer<typeof ConsentDocumentPublishResult>;
