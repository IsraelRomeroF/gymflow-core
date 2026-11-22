import { z } from 'zod';
import { Id, Instante } from './comun.js';
import { BiometricModalitySchema, EnrollmentGapSchema } from './enums.js';

/**
 * BIOMETRÍA (`access/access.routes.ts`, `enrollment.service.ts`). Antes
 * `Enrollment` y `Pendiente` estaban copiados en la ficha y en la pantalla de
 * Biometría (6-17). Nunca viaja la plantilla ni su referencia.
 */

/** Un rostro o huella registrado de un socio, en una sucursal. */
export const BiometricEnrollment = z.object({
  id: Id,
  modality: BiometricModalitySchema,
  branchId: Id,
  /** Con la cámara de recepción: `insightface/buffalo_sc`. */
  algorithmVendor: z.string(),
  /** El consentimiento firmado con el que se tomó. */
  consentId: Id,
  enrolledAt: Instante,
  revokedAt: Instante.nullable(),
  /** Cuándo la sucursal confirmó que borró la plantilla. */
  templateDeletedAt: Instante.nullable(),
  /** Qué le falta para servir en la puerta; en la práctica `[]` o `['REVOKED']`. */
  gaps: z.array(EnrollmentGapSchema),
  /**
   * Dónde vive la plantilla (bloque 2.3): `server` = rostro tomado con la
   * cámara de recepción (cifrado en el servidor; se borra en el acto al
   * revocar y se puede «Actualizar»); `device` = registro de un lector de la
   * sucursal (30 días para confirmar su borrado).
   */
  templateKind: z.enum(['server', 'device']).optional(),
  /** La versión del texto biométrico con la que se firmó este registro. */
  consentVersion: z.string().nullable().optional(),
});
export type BiometricEnrollment = z.infer<typeof BiometricEnrollment>;

/** `GET /members/:id/biometric-enrollments`: todos, también los revocados, el más reciente primero. */
export const BiometricEnrollmentList = z.object({ enrollments: z.array(BiometricEnrollment) });
export type BiometricEnrollmentList = z.infer<typeof BiometricEnrollmentList>;

/** Un registro revocado que espera que la sucursal confirme el borrado de la plantilla. */
export const PendingTemplateDeletion = z.object({
  id: Id,
  memberId: Id,
  branchId: Id,
  /** Incluye dados de baja; un anonimizado llega como «Socio anonimizado». */
  memberName: z.string().nullable(),
  memberCode: z.string().nullable(),
  revokedAt: Instante.nullable(),
});
export type PendingTemplateDeletion = z.infer<typeof PendingTemplateDeletion>;

/** `GET /biometric-enrollments/pending-deletion`: lo vencido (30 días o más sin borrar) y lo que sigue en plazo. */
export const PendingTemplateDeletions = z.object({
  overdue: z.array(PendingTemplateDeletion),
  waiting: z.array(PendingTemplateDeletion),
});
export type PendingTemplateDeletions = z.infer<typeof PendingTemplateDeletions>;

// ── Bloque 2.3: asistente nuevo, «Actualizar», cifras reales y medición ─────

/**
 * `POST /access/face/check`: ¿sirve esta captura para registrar un rostro?
 * Se pregunta ANTES de habilitar «Registrar» (6-14): el problema se dice con
 * el socio todavía frente a la cámara. No guarda nada.
 */
export const FaceCheck = z.object({
  ok: z.boolean(),
  /** Qué corregir, en palabras de mostrador; `null` si la captura sirve. */
  problema: z.string().nullable(),
  /** Cuadros en los que se vio un rostro (`null` si el motor no lo dice). */
  cuadrosConRostro: z.number().int().nullable(),
  /** De esos, cuántos de frente (`null` si el motor es anterior al bloque 2.3). */
  cuadrosDeFrente: z.number().int().nullable(),
});
export type FaceCheck = z.infer<typeof FaceCheck>;

/** Lo que responde registrar o actualizar un rostro con la cámara. */
export const FaceEnrollmentResult = z.object({
  id: Id,
  modality: BiometricModalitySchema,
  branchId: Id,
  algorithmVendor: z.string(),
  enrolledAt: Instante,
  /** La versión del texto biométrico que ampara este rostro. */
  consentVersion: z.string().nullable().optional(),
  /** En «Actualizar»: el registro que este sustituyó. */
  replacedEnrollmentId: Id.nullable().optional(),
});
export type FaceEnrollmentResult = z.infer<typeof FaceEnrollmentResult>;

/** `GET /biometric-enrollments/summary`: las cifras reales de la pantalla Biometría (6-06). */
export const BiometricsSummary = z.object({
  /** Rostros vivos tomados con la cámara, de socios vigentes. */
  facesLive: z.number().int(),
  /** Socios distintos con al menos un rostro vivo. */
  membersWithFace: z.number().int(),
  /** Rostros registrados en los últimos 30 días (sigan vivos o no). */
  enrolledLast30Days: z.number().int(),
  /** Revocados en los últimos 30 días. */
  revokedLast30Days: z.number().int(),
  /** Registros vivos de un lector de sucursal (sin plantilla en el servidor). */
  deviceLive: z.number().int(),
  byBranch: z.array(z.object({ branchId: Id, facesLive: z.number().int(), deviceLive: z.number().int() })),
});
export type BiometricsSummary = z.infer<typeof BiometricsSummary>;

/** Un intento de la medición del umbral (6-10). Nunca lleva foto ni plantilla: solo parecidos. */
export const FaceMeasurementAttempt = z.object({
  id: Id,
  branchId: Id,
  /** `MEMBER`: «es» (un socio con rostro registrado). `STRANGER`: «no es» (alguien que no es socio). */
  kind: z.enum(['MEMBER', 'STRANGER']),
  memberId: Id.nullable(),
  memberName: z.string().nullable(),
  /** Parecido con SU propio rostro registrado (solo `MEMBER`). */
  ownScore: z.number().nullable(),
  /** El mayor parecido con el rostro de cualquier OTRA persona del padrón. */
  bestOtherScore: z.number().nullable(),
  /** Contra cuántas personas se comparó. */
  compared: z.number().int(),
  at: Instante,
});
export type FaceMeasurementAttempt = z.infer<typeof FaceMeasurementAttempt>;

/** Qué pasaría con un umbral dado, según lo medido. */
export const FaceThresholdRow = z.object({
  threshold: z.number(),
  /** Socios que NO se reconocerían (parecido propio por debajo). */
  falseRejects: z.number().int(),
  /** Personas que se confundirían con otra (parecido ajeno igual o por encima). */
  falseAccepts: z.number().int(),
});
export type FaceThresholdRow = z.infer<typeof FaceThresholdRow>;

/** `GET /access/face/measurements`: los intentos y lo que dicen. */
export const FaceMeasurementReport = z.object({
  attempts: z.array(FaceMeasurementAttempt),
  analysis: z.object({
    /** Socios distintos medidos («es») y personas que no son socios («no es»). */
    members: z.number().int(),
    strangers: z.number().int(),
    /** Lo que pide el plan: 30 y 10. */
    membersNeeded: z.number().int(),
    strangersNeeded: z.number().int(),
    enough: z.boolean(),
    /** El umbral y la ventaja con los que hoy decide la Estación. */
    currentThreshold: z.number(),
    currentMargin: z.number(),
    /** El parecido propio más bajo de un socio y el parecido ajeno más alto. */
    lowestOwn: z.number().nullable(),
    highestOther: z.number().nullable(),
    /**
     * La franja segura: del parecido ajeno más alto más 0.05 al propio más
     * bajo menos 0.05. `safeTo` es `null` si no hay franja (se traslapan).
     */
    safeFrom: z.number().nullable(),
    safeTo: z.number().nullable(),
    /**
     * El umbral que sale de lo medido: el de hoy si cae en la franja segura;
     * si no, el borde más cercano; sin franja, el que no confunde a nadie.
     * `null` mientras no haya intentos de los dos tipos.
     */
    suggestedThreshold: z.number().nullable(),
    /** Con el umbral sugerido, cuántos socios medidos no se reconocerían. */
    suggestedFalseRejects: z.number().int().nullable(),
    /** Con el umbral de hoy. */
    currentFalseRejects: z.number().int(),
    currentFalseAccepts: z.number().int(),
    /** Socios cuyo parecido propio no le saca la ventaja exigida al mejor ajeno. */
    currentMarginFailures: z.number().int(),
    /** Lo que se concluye, en una frase. */
    verdict: z.string(),
    table: z.array(FaceThresholdRow),
  }),
});
export type FaceMeasurementReport = z.infer<typeof FaceMeasurementReport>;
