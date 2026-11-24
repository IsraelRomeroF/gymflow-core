import { z } from 'zod';
import { Centavos, Fecha, Id, Instante } from './comun.js';
import { Pagina } from './lista.js';
import { FollowUpContact } from './retention.js';
import { IDENTITY_KINDS, ONBOARDING_STEPS, PROSPECT_QUEUES, RESPONSIBLE_KINDS } from '../captacion.js';

/**
 * CAPTACIÓN: interesados (`prospects/prospects.routes.ts`) y altas digitales
 * (`intake/intake.routes.ts`). Las dos listas se cortaban en 50 sin avisar
 * (10-01, 9-14); ahora viajan como `Pagina`.
 */

export const PROSPECT_STATUSES = ['NEW', 'CONTACTED', 'VISITED', 'TRIAL', 'CONVERTED', 'LOST'] as const;
export const ProspectStatusSchema = z.enum(PROSPECT_STATUSES);
export type ProspectStatus = z.infer<typeof ProspectStatusSchema>;

/** Un interesado, con su último contacto y cuántos van. */
export const Prospect = z.object({
  id: Id,
  firstName: z.string(),
  lastName: z.string(),
  phoneE164: z.string().nullable(),
  email: z.string().nullable(),
  source: z.string().nullable(),
  status: ProspectStatusSchema,
  branchId: Id,
  assignedToUserId: Id.nullable(),
  /** La ficha a la que dio lugar, si se inscribió. */
  convertedMemberId: Id.nullable(),
  notes: z.string().nullable(),
  createdAt: Instante,
  updatedAt: Instante,
  /** El contrato de «Le llamé» es el de Retención (`follow-ups/contacto.ts`). */
  lastFollowUp: FollowUpContact.nullable(),
  followUps: z.number().int(),
  /** El próximo paso con fecha; `null` = no tiene (2.4: todo abierto lo tiene o está «Sin contactar»). */
  nextStepOn: Fecha.nullable(),
  /** Desde qué día toca (`dueOn` del núcleo); `null` = nunca contactado y sin próximo paso. */
  dueOn: Fecha.nullable(),
  /** En qué grupo de la bandeja está; `null` si ya está cerrado. */
  queue: z.enum(PROSPECT_QUEUES).nullable(),
  /** Quién lo recomendó, si se anotó: un socio (`referredByMemberId`) o solo su nombre. */
  referredByMemberId: Id.nullable(),
  referredByName: z.string().nullable(),
  /** Por qué se cerró sin inscribirse (catálogo `interesadoPerdido`) y cuándo. */
  lostReasonCode: z.string().nullable(),
  lostReason: z.string().nullable(),
  closedAt: Instante.nullable(),
  /** El plan que preguntó (D-31): la venta abre con él. `null` = no se anotó, o el plan ya no existe. */
  interestPlanId: Id.nullable(),
  interestPlanName: z.string().nullable(),
  /** El día en que se cierra solo si nadie lo contacta ni le pone fecha (D-31); `null` si ya está cerrado. */
  autoCloseOn: Fecha.nullable(),
  /** Faltan pocos días para `autoCloseOn` (o ya pasó): la fila lo avisa. */
  autoCloseSoon: z.boolean(),
  /** Se cerró solo por falta de contacto (no lo cerró una persona). Se puede reabrir. */
  autoClosed: z.boolean(),
});
export type Prospect = z.infer<typeof Prospect>;

/**
 * `GET /prospects/auto-close` (D-31, bloque 4.7): el cierre solo, visto ANTES
 * de que pase. `startsOn` es el día desde el que cierra en este gimnasio:
 * `null` mientras el cierre de la noche no ha corrido con esta regla (su
 * primera corrida no cierra a nadie, solo fija esa fecha). `due` son los
 * que ya cumplieron el plazo (se cierran en la siguiente corrida, o el día
 * `startsOn` si aún no llega) y `soon`, los que lo cumplen en los próximos
 * `noticeDays` días. De las sedes de quien pregunta.
 */
export const ProspectAutoClose = z.object({
  days: z.number().int(),
  noticeDays: z.number().int(),
  startsOn: Fecha.nullable(),
  /** Ya cierra de verdad: `startsOn` llegó. */
  active: z.boolean(),
  due: z.number().int(),
  soon: z.number().int(),
});
export type ProspectAutoClose = z.infer<typeof ProspectAutoClose>;

/** Un plan en la página pública de la sucursal (D-31): nombre y precio de LISTA de esa sede, sin promociones. */
export const PublicPlan = z.object({
  id: Id,
  name: z.string(),
  description: z.string().nullable(),
  billingModel: z.string(),
  durationUnit: z.string(),
  durationValue: z.number().int(),
  /** Precio de lista en esa sucursal (el propio de la sede si lo tiene). */
  priceCents: Centavos,
  /** Inscripción, si el plan la cobra; `'0'` = no cobra. */
  signupFeeCents: Centavos,
  visitsIncluded: z.number().int().nullable(),
});
export type PublicPlan = z.infer<typeof PublicPlan>;

/** Los grupos de la bandeja y las dos pestañas, con el mismo buscador y sede. */
export const ProspectCounts = z.object({
  open: z.number().int(), closed: z.number().int(),
  today: z.number().int(), uncontacted: z.number().int(), waiting: z.number().int(),
});
export type ProspectCounts = z.infer<typeof ProspectCounts>;

/**
 * `GET /prospects?open=&status=&branchId=&q=&cursor=&limit=`: del más reciente
 * al más viejo. `open=true` son los que siguen en seguimiento; `open=false`,
 * los cerrados (se inscribió o se perdió). `counts` cuenta los dos grupos con
 * el mismo buscador y sede, para las pestañas.
 */
export const ProspectList = Pagina(Prospect).extend({ counts: ProspectCounts });
export type ProspectList = z.infer<typeof ProspectList>;

/**
 * `POST /prospects/:id/follow-ups` (201): el contacto registrado y la etapa
 * en que quedó el interesado, derivada de sus contactos (10-05).
 */
export const ProspectContactResult = FollowUpContact.extend({ status: ProspectStatusSchema });
export type ProspectContactResult = z.infer<typeof ProspectContactResult>;

/**
 * `GET /prospects/pending`: el pendiente de interesados para el Inicio (10-08),
 * con la forma común de los pendientes de módulo (`{ clave, cuantos, masAntiguo,
 * href, tono }`) y el desglose para la frase «4 sin contactar · 2 te tocan hoy».
 */
export const ProspectPending = z.object({
  clave: z.literal('prospects'),
  /** Los que piden algo hoy: los que tocan hoy más los que nadie ha contactado. */
  cuantos: z.number().int(),
  /** Desde cuándo espera el más antiguo de ellos; `null` si no hay ninguno. */
  masAntiguo: Instante.nullable(),
  href: z.string(),
  tono: z.enum(['warn', 'info', 'neutral']),
  today: z.number().int(),
  uncontacted: z.number().int(),
});
export type ProspectPending = z.infer<typeof ProspectPending>;

/** `GET /prospects/sources` y `PUT /prospects/sources`: «¿Cómo se enteró?», catálogo de la gerencia (10-17). */
export const ProspectSources = z.object({
  sources: z.array(z.string()),
  /** `true`: el gimnasio no ha cambiado la lista; son las de fábrica. */
  defaults: z.boolean(),
});
export type ProspectSources = z.infer<typeof ProspectSources>;

/**
 * UNA PERSONA QUE YA EXISTE (`POST /members/check-duplicates`, `people`): el
 * buscador de identidad único de las cuatro puertas (Nuevo prospecto, Nuevo
 * socio, aprobar un alta y clase suelta a visitante).
 */
export const IdentityMatch = z.object({
  kind: z.enum(IDENTITY_KINDS),
  /** `null` cuando quien pregunta no puede abrirlo (un interesado o un alta de otra sede): solo se avisa. */
  id: Id.nullable(),
  fullName: z.string(),
  memberCode: z.string().nullable(),
  phoneE164: z.string().nullable(),
  /** El estado en su tabla: de socio (`ACTIVE`, `ARCHIVED`…), de interesado (`NEW`…) o `SUBMITTED`. */
  status: z.string().nullable(),
  branchId: Id.nullable(),
  /** 0 a 100, con la misma regla que la fusión (`matchIdentity`). */
  score: z.number(),
  explanation: z.string(),
  /** Mismo celular y otro nombre: comparten celular, no son la misma persona. */
  sharedPhone: z.boolean(),
});
export type IdentityMatch = z.infer<typeof IdentityMatch>;

export const IdentityCheck = z.object({
  /** Solo socios, como antes de 2.4: lo que bloquea un alta. */
  candidates: z.array(z.object({
    candidateId: z.string(), score: z.number(), method: z.string(), action: z.string(), explanation: z.string(),
  })),
  blocking: z.boolean(),
  /** Socios, exsocios, interesados abiertos y altas por revisar, del más parecido al menos. */
  people: z.array(IdentityMatch),
});
export type IdentityCheck = z.infer<typeof IdentityCheck>;

export const INTAKE_STATUSES = ['SUBMITTED', 'APPROVED', 'REJECTED'] as const;
export const IntakeStatusSchema = z.enum(INTAKE_STATUSES);

/**
 * Las insignias de un alta por revisar: qué falta (`MISSING_*`), si dejó nota
 * de salud, si se parece a alguien que ya existe, si comparte celular con otra
 * persona, si era un interesado, si dijo que ya venía y si recepción ya
 * guardó correcciones sin aprobar.
 */
export const INTAKE_FLAGS = [
  'MISSING_BIRTHDATE', 'MISSING_EMERGENCY', 'HEALTH_NOTE', 'POSSIBLE_DUPLICATE', 'SHARED_PHONE', 'WAS_PROSPECT', 'RETURNING', 'CORRECTED',
  // D-10 (fase 3): tiene de 15 a 17 años; se aprueba cuando su tutor firma en el mostrador.
  'NEEDS_GUARDIAN',
] as const;
export type IntakeFlag = (typeof INTAKE_FLAGS)[number];

/** Un alta digital en la bandeja o en el historial. */
export const IntakeSummary = z.object({
  id: Id,
  branchId: Id,
  status: IntakeStatusSchema,
  /** «Datos borrados» cuando ya se limpió por retención (SEC-08): ver `scrubbed`. */
  fullName: z.string(),
  phoneE164: z.string().nullable(),
  email: z.string().nullable(),
  memberSince: Fecha.nullable(),
  submittedAt: Instante,
  /** A qué socio dio lugar. */
  memberId: Id.nullable(),
  rejectionReason: z.string().nullable(),
  /** Quién la aprobó o rechazó y cuándo; `null` mientras está por revisar o si caducó sola. */
  reviewedAt: Instante.nullable(),
  reviewedByUserId: Id.nullable(),
  reviewedByName: z.string().nullable(),
  /** Sus datos personales ya se borraron (90 días después de revisarla, o al anonimizar al socio). */
  scrubbed: z.boolean(),
  /** Lo que el socio dicta en recepción (`intakeFolio`). */
  folio: z.string(),
  /** Las insignias de la fila (9-04, 9-09): solo en la bandeja; vacío en el historial. */
  flags: z.array(z.enum(INTAKE_FLAGS)),
});
export type IntakeSummary = z.infer<typeof IntakeSummary>;

/**
 * `GET /intakes?status=&branchId=&q=&cursor=&limit=` (`q`: nombre, celular o folio): la bandeja (`SUBMITTED`, en orden de
 * llegada) o el historial (aprobadas o rechazadas, lo reciente primero).
 * `pending` es la bandeja completa de las sedes que ve quien pregunta.
 */
export const IntakeList = Pagina(IntakeSummary).extend({ pending: z.number().int() });
export type IntakeList = z.infer<typeof IntakeList>;

/** Lo que recepción corrigió o completó de un alta: solo los campos cambiados; `null` = borró el dato. */
export const IntakeCorrections = z.record(z.string(), z.string().nullable());
export type IntakeCorrections = z.infer<typeof IntakeCorrections>;

/**
 * `GET /intakes/:id`: el alta para decidir, en una pantalla. `intake` es lo
 * que el socio ENVIÓ (la evidencia); `corrections`, lo que recepción guardó
 * encima sin aprobar (9-21). `pendingFields`, `matches` y `flags` se calculan
 * sobre el resultado de las dos cosas. Ya no viaja la IP (9-15).
 */
export const IntakeDetail = z.object({
  intake: z.object({
    id: Id,
    branchId: Id,
    status: IntakeStatusSchema,
    folio: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    phoneE164: z.string().nullable(),
    email: z.string().nullable(),
    birthDate: Fecha.nullable(),
    emergencyContactName: z.string().nullable(),
    emergencyContactPhone: z.string().nullable(),
    memberSince: Fecha.nullable(),
    /** Solo con `members:health:read`; los demás saben que existe por `hasHealthNotes`. */
    healthNotes: z.string().nullable(),
    hasHealthNotes: z.boolean(),
    acceptedConsents: z.array(z.object({ consentType: z.string(), version: z.string(), granted: z.boolean(), documentId: z.string() })),
    submittedAt: Instante,
    corrections: IntakeCorrections.nullable(),
    correctedAt: Instante.nullable(),
    correctedByName: z.string().nullable(),
    /** D-10: es menor de edad hoy (con lo corregido encima): para aprobar o vincular hace falta la firma de su tutor. */
    minor: z.boolean(),
    /** El tutor que el menor escribió en el QR: a quién llamar. Quien firma se confirma en el mostrador. */
    guardianName: z.string().nullable(),
    guardianPhoneE164: z.string().nullable(),
  }),
  suggestion: z.enum(['AUTO_LINK', 'NEEDS_REVIEW', 'NEW_MEMBER']),
  matches: z.array(z.object({
    candidateId: z.string(), score: z.number(), method: z.string(), action: z.string(), explanation: z.string(),
    fullName: z.string().nullable(), memberCode: z.string().nullable(), phoneE164: z.string().nullable(), status: z.string().nullable(),
    /** Mismo celular y otro nombre: comparten celular (9-02). */
    sharedPhone: z.boolean(),
    /** Ya tiene una membresía viva: al vincular no se le ofrece vender otra (9-17). */
    hasMembership: z.boolean(),
  })),
  pendingFields: z.array(z.string()),
  /** El interesado abierto que es esta misma persona (10-10): se convierte al aprobar o vincular. */
  prospect: z.object({ id: Id, branchId: Id, source: z.string().nullable(), status: ProspectStatusSchema, followUps: z.number().int() }).nullable(),
  flags: z.array(z.enum(INTAKE_FLAGS)),
});
export type IntakeDetail = z.infer<typeof IntakeDetail>;

/** `PATCH /intakes/:id/corrections`: lo guardado sin aprobar, y quién y cuándo. */
export const IntakeCorrectionsSaved = z.object({
  corrections: IntakeCorrections.nullable(),
  correctedAt: Instante.nullable(),
  correctedByName: z.string().nullable(),
});
export type IntakeCorrectionsSaved = z.infer<typeof IntakeCorrectionsSaved>;

/** `POST /intakes/:id/approve` y `/link` (201): el socio que resultó y lo que arrastró. */
export const IntakeResolved = z.object({
  memberId: Id,
  memberCode: z.string(),
  /** Consentimientos que firmó en una versión que ya no es la vigente: hay que volver a pedírselos. */
  pendingReconsent: z.array(z.string()),
  /** El interesado que quedó convertido en la misma operación, si lo había. */
  convertedProspectId: Id.nullable(),
});
export type IntakeResolved = z.infer<typeof IntakeResolved>;

/**
 * `GET /members/:id/onboarding`: lo que falta para terminar el alta de un
 * socio, por su ESTADO (9-01): los pasos de `onboardingSteps` del núcleo. Lo
 * leen el cierre de «Alta aprobada», el de «Nuevo socio» y la franja «Para
 * terminar su alta» de la ficha (hasta `ONBOARDING_DAYS` días).
 */
export const MemberOnboarding = z.object({
  memberId: Id,
  memberCode: z.string(),
  firstName: z.string(),
  /** Días desde que se creó su ficha (no su antigüedad declarada). */
  daysSinceCreated: z.number().int(),
  /** Hay algo por hacer y la ficha sigue dentro de la ventana: la franja se pinta. */
  show: z.boolean(),
  steps: z.array(z.object({ key: z.enum(ONBOARDING_STEPS), done: z.boolean(), optional: z.boolean() })),
  /** El primer paso sin hacer; `null` = no falta nada. */
  next: z.enum(ONBOARDING_STEPS).nullable(),
  /** Su membresía viva, para decir «Ya tiene Mensualidad hasta el 30 nov» (9-17). */
  membership: z.object({ planName: z.string().nullable(), currentPeriodEnd: Fecha.nullable() }).nullable(),
  owesCents: Centavos,
  missingFields: z.array(z.string()),
});
export type MemberOnboarding = z.infer<typeof MemberOnboarding>;

// ── Celular compartido y responsable (D-09) · completar la ficha (D-11) ─────

/** El responsable anotado en una ficha: del celular que comparte y, si es menor, su tutor. */
export const MemberResponsible = z.object({
  kind: z.enum(RESPONSIBLE_KINDS),
  /** Con `MEMBER`: el socio responsable (su ficha). */
  memberId: Id.nullable(),
  memberCode: z.string().nullable(),
  /** Nombre del responsable; con `SELF`, `null`. */
  name: z.string().nullable(),
  /** Teléfono propio del adulto, si no es el mismo que comparte. */
  phoneE164: z.string().nullable(),
  /** Firmó como tutor en el mostrador (D-10) y cuándo. */
  guardianSignedAt: Instante.nullable(),
});
export type MemberResponsible = z.infer<typeof MemberResponsible>;

/**
 * `GET /members/:id/shared-phone`: con quién comparte celular este socio y
 * quién responde por el número (D-09). `hidden`: quien pregunta no ve
 * teléfonos (el coach), y entonces no se le dice nada.
 */
export const MemberSharedPhone = z.object({
  hidden: z.boolean(),
  /** Otros socios vivos con el mismo celular. */
  sharedWith: z.array(z.object({ id: Id, fullName: z.string(), memberCode: z.string(), status: z.string() })),
  responsible: MemberResponsible.nullable(),
  /** Comparte celular y nadie ha anotado quién responde por el número. */
  missingResponsible: z.boolean(),
});
export type MemberSharedPhone = z.infer<typeof MemberSharedPhone>;

/** `POST /members/:id/complete` (D-11): qué campos vacíos se llenaron y cuáles se dejaron porque ya tenían dato. */
export const MemberCompleted = z.object({
  filled: z.array(z.string()),
  skipped: z.array(z.string()),
  missingFields: z.array(z.string()),
});
export type MemberCompleted = z.infer<typeof MemberCompleted>;
