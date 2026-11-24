import { z } from 'zod';
import { Centavos, Fecha, Id, Instante } from './comun.js';
import { AccessOutcomeSchema, DenialReasonSchema, ExceptionActionSchema, MembershipStatusSchema } from './enums.js';
import { CollectionMembership } from './billing.js';

/**
 * LA ENTRADA (`access/access.routes.ts`, `access.service.ts`,
 * `exception.service.ts`).
 *
 * Antes el panel escribía sus propias formas (`Intento` en `entrada.tsx`,
 * `Respuesta` en la Estación, `Vista` en la excepción) y cuando la API cambió
 * la respuesta del rostro TypeScript no avisó (5-21).
 */

/**
 * `POST /access/attempts` (201): la entrada por el mostrador. Un reintento
 * con el mismo `requestKey` devuelve la misma decisión.
 */
export const AccessAttemptResult = z.object({
  outcome: AccessOutcomeSchema,
  /** `null` si pasó. */
  reason: DenialReasonSchema.nullable(),
  /** «Tiene un pago pendiente…», «Es su última visita del paquete»: entra, pero hay que decírselo. */
  warning: z.string().nullable(),
  consumedVisit: z.boolean(),
  /**
   * REENTRADA (D-07): ya había entrado hoy en esta sucursal. Pasa y queda
   * registrada, pero no cuenta otra asistencia ni descuenta otra visita
   * (`attendanceId` es `null`).
   */
  reentry: z.boolean(),
  /** La versión de la regla con que se decidió (ACCESS_POLICY_VERSION). */
  policyVersion: z.string(),
  decisionId: Id,
  /** La asistencia que contó (solo si pasó). */
  attendanceId: Id.nullable(),
  /** El mostrador puede levantar este rechazo (cobrar y abrir, o dejar pasar). */
  overridable: z.boolean(),
  /** Solo cuando el rechazo es por adeudo (gracia vencida o suspendida): lo que debe, lo mínimo para entrar y cuántas cuotas. */
  outstandingCents: Centavos.nullable(),
  minimumCents: Centavos.nullable(),
  periodsOwed: z.number().int().nullable(),
});
export type AccessAttemptResult = z.infer<typeof AccessAttemptResult>;

/** `GET /access/manual-policy?branchId=&memberId=`: qué pide la entrada por el mostrador en esa sede. */
export const ManualEntryPolicy = z.object({
  /** La sede tiene cámara (módulo Biometría): la entrada a mano pide motivo. */
  requiresReason: z.boolean(),
  /** El socio tiene rostro o huella vigente en esa sede. */
  hasBiometric: z.boolean(),
  /**
   * D-06: el gimnasio exige el rostro para entrar y esta sede usa biometría.
   * Quien no lo tiene no entra por el mostrador con un motivo: cada visita la
   * autoriza la gerencia (`POST /access/decisions/:id/grant` sobre su rechazo
   * `BIOMETRIC_REQUIRED`).
   */
  faceRequired: z.boolean(),
});
export type ManualEntryPolicy = z.infer<typeof ManualEntryPolicy>;

/**
 * `POST /access/attempts/preview` (200): lo que PASARÍA si se registrara la
 * entrada ahora, sin registrar nada (ni decisión, ni asistencia, ni visita).
 * Es lo que deja poner el veredicto antes que el motivo (5-03): recepción
 * no escribe por qué entra por el mostrador quien de todos modos no entra.
 */
export const AccessAttemptPreview = z.object({
  outcome: AccessOutcomeSchema,
  reason: DenialReasonSchema.nullable(),
  warning: z.string().nullable(),
  /** Si entrara, descontaría una visita de su paquete. */
  wouldConsumeVisit: z.boolean(),
  /** Sería una reentrada (D-07): ya entró hoy aquí; no contaría ni descontaría. */
  reentry: z.boolean(),
  overridable: z.boolean(),
  policyVersion: z.string(),
  /** Solo con rechazo por adeudo: lo que debe, lo mínimo para entrar y cuántas cuotas (bruto, sin el saldo a favor). */
  outstandingCents: Centavos.nullable(),
  minimumCents: Centavos.nullable(),
  periodsOwed: z.number().int().nullable(),
  /** Saldo a favor sin aplicar: se aplica primero, así que lo que se propone cobrar es la deuda menos esto (4-18). */
  creditCents: Centavos,
  /** Qué pide la entrada por el mostrador en esa sede (la misma respuesta que `GET /access/manual-policy`). */
  policy: ManualEntryPolicy,
});
export type AccessAttemptPreview = z.infer<typeof AccessAttemptPreview>;

/** `POST /access/face`: la Estación. O no reconoció a nadie, o reconoció y la puerta decidió. */
export const FaceAccessResult = z.discriminatedUnion('reconocido', [
  z.object({
    reconocido: z.literal(false),
    /** Qué pasó, para decírselo a quien está frente a la cámara. */
    motivo: z.string(),
    /** No se vio ningún rostro (no confundir con «no te reconocí»). */
    sinRostro: z.boolean(),
  }),
  z.object({
    reconocido: z.literal(true),
    memberId: Id,
    memberName: z.string(),
    outcome: AccessOutcomeSchema,
    reason: DenialReasonSchema.nullable(),
    warning: z.string().nullable(),
    consumedVisit: z.boolean(),
    /** Reentrada (D-07): ya había entrado hoy aquí; no cuenta otra visita. */
    reentry: z.boolean(),
    decisionId: Id,
    /** Solo con rechazo por adeudo. La Estación NO lo muestra (sin importes en la entrada); es para recepción. */
    outstandingCents: Centavos.nullable(),
    /**
     * Firmó un texto biométrico anterior al vigente (6-03, 21-09): la Estación
     * le avisa que lo firme en recepción. No cambia si entra (D-06 es fase 3).
     */
    debeVolverAFirmar: z.boolean(),
  }),
]);
export type FaceAccessResult = z.infer<typeof FaceAccessResult>;

/** `GET /access/face/status`: ¿responde el motor del rostro? */
export const FaceEngineStatus = z.object({
  disponible: z.boolean(),
  /** Por qué no, en palabras; `null` si está disponible. */
  motivo: z.string().nullable(),
  /** Con qué decide hoy la Estación (bloque 2.3; la pantalla Biometría lo enseña). */
  modelo: z.string().nullable().optional(),
  umbral: z.number().optional(),
  margen: z.number().optional(),
  /** `branch`: el rostro vale en la sucursal donde se tomó (hoy). `organization`: en todo el gimnasio. */
  alcance: z.enum(['branch', 'organization']).optional(),
});
export type FaceEngineStatus = z.infer<typeof FaceEngineStatus>;

/** Una de las tres acciones del mostrador ante un rechazo (`exceptionOptions`). */
export const ExceptionOption = z.object({
  action: ExceptionActionSchema,
  label: z.string(),
  /** El motivo es lo que convierte el favor en un dato. */
  requiresReason: z.boolean(),
  primary: z.boolean(),
});
export type ExceptionOption = z.infer<typeof ExceptionOption>;

/** `GET /access/decisions/:id/exception`: la pantalla para resolver un rechazo con el socio delante. */
export const AccessException = z.object({
  decision: z.object({
    id: Id,
    outcome: AccessOutcomeSchema,
    reason: DenialReasonSchema.nullable(),
    at: Instante,
    branchId: Id,
  }),
  member: z.object({
    id: Id,
    memberCode: z.string(),
    fullName: z.string(),
    /** Todavía no hay fotos: siempre `null`. */
    photoUrl: z.null(),
    /** Aquí va como fecha de calendario (en `/members` es ISO con hora). */
    joinedAt: Fecha,
    tenureDays: z.number().int(),
  }),
  /** La membresía viva; una suspendida llega como `null`. */
  membershipStatus: MembershipStatusSchema.exclude(['SUSPENDED', 'CANCELED', 'EXPIRED']).nullable(),
  outstandingCents: Centavos,
  outstandingLabel: z.string(),
  /** Saldo a favor sin aplicar: «Cobrar y abrir» propone la deuda menos esto (4-18). */
  creditCents: Centavos,
  /** Lo mínimo para abrir hoy (la cuota más antigua, bruto) y cuántas cuotas debe; `null` si no debe cuotas de periodo. */
  minimumCents: Centavos.nullable(),
  periodsOwed: z.number().int().nullable(),
  /** Hasta cinco, la más reciente primero. */
  recentVisits: z.array(z.object({ at: Instante, branchId: Id })),
  options: z.array(ExceptionOption),
  /** Si el rechazo ya se resolvió (una sola vez, 5-10): quién y cuándo. */
  resolution: z.object({ decisionId: Id, at: Instante, byName: z.string().nullable() }).nullable(),
});
export type AccessException = z.infer<typeof AccessException>;

/**
 * `POST /access/decisions/:id/collect` (201): cobró y abrió. Trae el
 * veredicto, como `POST /members/:id/payments` (4-09): si con eso quedó al
 * corriente y hasta dónde, o cuánto le falta todavía.
 */
export const CollectAndOpenResult = z.object({
  paymentId: Id,
  folio: z.string().nullable(),
  /** La concesión que resolvió el rechazo. */
  decisionId: Id,
  attendanceId: Id.nullable(),
  /** Saldo a favor que cubrió deuda antes de repartir este cobro. */
  creditAppliedCents: Centavos,
  membership: CollectionMembership.nullable(),
  toEnterCents: Centavos.nullable(),
});
export type CollectAndOpenResult = z.infer<typeof CollectAndOpenResult>;

/**
 * `POST /access/decisions/:id/grant` (201): el paso concedido sobre un
 * rechazo. Sobre un `BIOMETRIC_REQUIRED` es la AUTORIZACIÓN de la gerencia
 * para esa visita (D-06).
 */
export const AccessGrantResult = z.object({
  outcome: AccessOutcomeSchema,
  /**
   * Casi siempre `null` (pasó). Solo trae motivo si, ya autorizada la entrada
   * sin rostro, la puerta dijo que no por otra cosa: nada quedó resuelto.
   */
  reason: DenialReasonSchema.nullable(),
  decisionId: Id,
  /** `null` si fue una reentrada (D-07). */
  attendanceId: Id.nullable(),
  reentry: z.boolean(),
  consumedVisit: z.boolean(),
  /** El rechazo que resolvió. */
  overriddenFrom: Id,
  /** Quién autorizó, cuando la entrada era de alguien sin rostro (D-06). */
  authorizedByName: z.string().nullable(),
});
export type AccessGrantResult = z.infer<typeof AccessGrantResult>;

/**
 * `GET /access/decisions/:id/resolution`: ¿ya se resolvió ese rechazo? La
 * pantalla de quien espera la autorización de la gerencia lo pregunta cada
 * pocos segundos y sigue sola cuando llega.
 */
export const AccessResolution = z.object({
  resolved: z.boolean(),
  byName: z.string().nullable(),
  at: Instante.nullable(),
});
export type AccessResolution = z.infer<typeof AccessResolution>;

// ── Entrar solo con rostro (fase 3, bloque 3.3; D-06) ───────────────────────

/**
 * `GET /access/face-rule` y `PUT /access/face-rule`: la regla «nadie entra sin
 * su rostro, salvo que la gerencia autorice esa visita», por gimnasio. Trae a
 * cuántos socios con plan les falta el rostro: es lo que hay que saber antes
 * de encenderla.
 */
export const FaceRule = z.object({
  enabled: z.boolean(),
  /** Sucursales que usan biometría: solo ahí pesa la regla. */
  branches: z.array(z.object({
    branchId: Id,
    name: z.string(),
    /** Socios que hoy pueden entrar con su plan o paquete (su sucursal de casa es esta). */
    canEnter: z.number().int(),
    /** De esos, los que no tienen rostro ni huella vigente en esta sucursal. */
    withoutFace: z.number().int(),
  })),
  /** Último cambio de la regla, si lo hubo. */
  changedAt: Instante.nullable(),
  changedByName: z.string().nullable(),
});
export type FaceRule = z.infer<typeof FaceRule>;

/** `GET /access/face-rule/pending`: a quién le falta el rostro en una sucursal (para llamarlos a registrarlo). */
export const FaceRulePending = z.object({
  total: z.number().int(),
  members: z.array(z.object({ memberId: Id, memberCode: z.string(), fullName: z.string(), lastVisitOn: Fecha.nullable() })),
});
export type FaceRulePending = z.infer<typeof FaceRulePending>;

// ── Pase de prueba (fase 3, bloque 3.3; D-08) ───────────────────────────────

/**
 * Un pase de prueba: gratis, UNO por persona, identificada por su celular.
 * Vale el día de operación `validOn` en la sede `branchId`. No es un cargo ni
 * una membresía: no mueve dinero.
 */
export const TrialPass = z.object({
  id: Id,
  memberId: Id,
  branchId: Id,
  branchName: z.string(),
  validOn: Fecha,
  /** Vale HOY (día de operación de su sede). */
  validToday: z.boolean(),
  /** Los últimos cuatro dígitos del celular con que se identificó. */
  phoneLast4: z.string(),
  grantedByName: z.string().nullable(),
  grantedAt: Instante,
});
export type TrialPass = z.infer<typeof TrialPass>;

/** Por qué no se le puede dar (los mismos códigos que `ERROR_REASONS`). */
export const TRIAL_PASS_BLOCKS = ['TRIAL_PASS_ALREADY_USED', 'TRIAL_PASS_NEEDS_PHONE', 'TRIAL_PASS_NOT_FIRST_TIME', 'MEMBER_ARCHIVED'] as const;

/**
 * `GET /members/:id/trial-pass`: su pase de prueba (si ya lo usó) y, si no,
 * si se le puede dar. `blockedBy` explica el no en palabras.
 */
export const MemberTrialPass = z.object({
  pass: TrialPass.nullable(),
  eligible: z.boolean(),
  blockedBy: z.enum(TRIAL_PASS_BLOCKS).nullable(),
  blockedText: z.string().nullable(),
});
export type MemberTrialPass = z.infer<typeof MemberTrialPass>;

/** `POST /members/:id/trial-pass` (201; 200 si ya tenía el de hoy en esa sede): le dio su pase de prueba. */
export const TrialPassGrantResult = z.object({
  created: z.boolean(),
  pass: TrialPass,
});
export type TrialPassGrantResult = z.infer<typeof TrialPassGrantResult>;

// ── Pase del día (bloque 1.8; 4-01) ─────────────────────────────────────────

/**
 * Un pase del día: la visita suelta. No es una membresía: es un cargo pagado
 * que da acceso el día de operación `validOn` en la sede `branchId`.
 */
export const DayPass = z.object({
  /** El id del cargo `DAY_PASS`: el pase es su cargo. */
  id: Id,
  memberId: Id,
  /** La sede donde se vendió y la única donde abre. */
  branchId: Id,
  /** El día de operación que cubre (el de la sede). */
  validOn: Fecha,
  concept: z.string(),
  amountCents: Centavos,
  /** Pagado: es lo que abre. Un pase anulado o con el cobro revertido no abre. */
  paid: z.boolean(),
  /** Vale HOY: pagado y de hoy (día de operación de su sede). */
  validToday: z.boolean(),
});
export type DayPass = z.infer<typeof DayPass>;

/**
 * `POST /members/:id/day-passes` (201; 200 si es el reintento de la misma
 * venta): vendió y cobró un pase del día. Sin membresía y sin inscripción.
 */
export const DayPassSaleResult = z.object({
  /** `false` en el reintento de la misma `saleKey`: no se cobró otra vez. */
  created: z.boolean(),
  pass: DayPass,
  /** El cobro; `null` si su saldo a favor cubrió todo el pase. */
  payment: z.object({ id: Id, folio: z.string().nullable(), amountCents: Centavos }).nullable(),
  /** Lo que cubrió su saldo a favor: eso no se le cobró. */
  creditAppliedCents: Centavos,
});
export type DayPassSaleResult = z.infer<typeof DayPassSaleResult>;

/** `GET /members/:id/day-passes`: el pase de hoy (si lo hay) y los que lleva. */
export const MemberDayPasses = z.object({
  /** El pase que vale hoy, en cualquier sede; `null` si no trae. */
  today: DayPass.nullable(),
  /** Cuántos pases pagados lleva en total: las visitas sueltas se cuentan en la ficha. */
  total: z.number().int(),
  /** Los más recientes primero, hasta 20 (sin los anulados). */
  recent: z.array(DayPass),
});
export type MemberDayPasses = z.infer<typeof MemberDayPasses>;
