import type { FollowUpChannel, FollowUpOutcome } from './retention.js';

/**
 * CAPTACIÓN (auditoría 8, fase 2, bloque 2.4): las reglas de un interesado y
 * del cierre de un alta, sin base de datos ni pantalla, para que la API, el
 * panel y las pruebas digan lo mismo.
 *
 *  - La ETAPA de un interesado se deriva de sus contactos (10-05): nadie la
 *    elige en un `select`.
 *  - La BANDEJA tiene tres grupos (10-16): «Te toca hoy», «Sin contactar» y
 *    «Esperando». Todo interesado abierto tiene próximo paso con fecha o está
 *    «Sin contactar»; el que fue contactado y quedó sin próximo paso toca hoy.
 *  - El FOLIO de un alta digital (9-06) es lo que el socio dicta en recepción.
 *  - Los PASOS para terminar un alta (9-01) salen del estado del socio.
 *
 * Esta subruta la importan panel y portal desde el navegador: nada de `node:`.
 */

// ── Etapa derivada ──────────────────────────────────────────────────────────

/** Las etapas de un interesado abierto, de menos a más avance. */
export const PROSPECT_OPEN_STAGES = ['NEW', 'CONTACTED', 'VISITED', 'TRIAL'] as const;
export type ProspectOpenStage = (typeof PROSPECT_OPEN_STAGES)[number];

/** Los resultados que se pueden registrar con un interesado, en el orden en que se ofrecen. */
export const PROSPECT_OUTCOMES = ['INTERESTED', 'ANSWERED', 'NO_ANSWER', 'TRIAL_VISIT', 'INTAKE_SENT', 'NOT_INTERESTED'] as const satisfies readonly FollowUpOutcome[];
export type ProspectOutcome = (typeof PROSPECT_OUTCOMES)[number];

/** «No le interesa» cierra al interesado en el mismo paso, con su motivo (10-05, 10-09). */
export const closesProspect = (outcome: FollowUpOutcome): boolean => outcome === 'NOT_INTERESTED';

/** A qué etapa lleva un contacto por sí solo. */
function stageOfContact(c: { readonly channel: FollowUpChannel | string; readonly outcome: FollowUpOutcome | string }): ProspectOpenStage {
  // No contestó: no hubo contacto; sigue donde estaba.
  if (c.outcome === 'NO_ANSWER') return 'NEW';
  // Vino a probar: ya entrenó aquí.
  if (c.outcome === 'TRIAL_VISIT') return 'TRIAL';
  // Hablaron en persona: visitó el gimnasio.
  if (c.channel === 'VISIT') return 'VISITED';
  return 'CONTACTED';
}

/**
 * La etapa de un interesado abierto según TODOS sus contactos: la más
 * avanzada que haya alcanzado. No retrocede (quien vino a probar y después no
 * contesta sigue «En prueba») y por eso «Reabrir» conserva la etapa (10-09).
 */
export function deriveStage(
  contacts: ReadonlyArray<{ readonly channel: FollowUpChannel | string; readonly outcome: FollowUpOutcome | string }>,
): ProspectOpenStage {
  let mayor = 0;
  for (const c of contacts) mayor = Math.max(mayor, PROSPECT_OPEN_STAGES.indexOf(stageOfContact(c)));
  return PROSPECT_OPEN_STAGES[mayor]!;
}

// ── Bandeja ─────────────────────────────────────────────────────────────────

/** Los grupos de la bandeja de interesados, en el orden en que se atienden. */
export const PROSPECT_QUEUES = ['TODAY', 'UNCONTACTED', 'WAITING'] as const;
export type ProspectQueue = (typeof PROSPECT_QUEUES)[number];

/**
 * Desde qué día «toca» un interesado abierto (`prospects.dueOn`):
 *  - con próximo paso: ese día;
 *  - contactado y sin próximo paso: el día del último contacto (toca ya: la
 *    regla es que nadie se queda sin próximo paso);
 *  - nunca contactado y sin próximo paso: `null` («Sin contactar»).
 */
export function dueOn(p: { readonly nextStepOn: string | null; readonly lastContactOn: string | null }): string | null {
  return p.nextStepOn ?? p.lastContactOn ?? null;
}

/** En qué grupo de la bandeja cae un interesado abierto. `today`: hoy en el gimnasio (`AAAA-MM-DD`). */
export function prospectQueue(due: string | null, today: string): ProspectQueue {
  if (due === null) return 'UNCONTACTED';
  return due <= today ? 'TODAY' : 'WAITING';
}

/** A partir de cuántos días sin contactar a un interesado nuevo la fila lo marca (10-16). */
export const UNCONTACTED_ALERT_DAYS = 3;

/** Las fuentes de «¿Cómo se enteró?» con las que nace un gimnasio; la gerencia las cambia (10-17). */
export const DEFAULT_PROSPECT_SOURCES = [
  'Pasó por aquí', 'Recomendación', 'Instagram', 'Facebook', 'TikTok', 'Google', 'WhatsApp', 'Lona o volante', 'Otro',
] as const;
/** La fuente que pide «¿Quién lo recomendó?». */
export const REFERRAL_SOURCE = 'Recomendación';

// ── Identidad: una sola búsqueda para las cuatro puertas ────────────────────

/**
 * Qué es la persona que ya existe (`POST /members/check-duplicates`):
 * socio, exsocio (dado de baja), interesado abierto o alta digital por revisar.
 */
export const IDENTITY_KINDS = ['MEMBER', 'FORMER_MEMBER', 'PROSPECT', 'INTAKE'] as const;
export type IdentityKind = (typeof IDENTITY_KINDS)[number];

// ── Alta digital ────────────────────────────────────────────────────────────

/** El folio que el socio ve al terminar y dicta en recepción (9-06): los últimos 6 del id, en mayúsculas. */
export function intakeFolio(id: string): string {
  return id.replace(/-/g, '').slice(-6).toUpperCase();
}

/** ¿Lo escrito en el buscador de la bandeja parece un folio? (6 caracteres de `0-9A-F`). */
export function looksLikeFolio(q: string): boolean {
  return /^[0-9a-f]{6}$/i.test(q.trim());
}

/** Lo que el formulario del socio puede dejar vacío y recepción completa (9-04). */
export const INTAKE_OPTIONAL_FIELDS = ['birthDate', 'emergencyContactName', 'memberSince'] as const;
export type IntakeOptionalField = (typeof INTAKE_OPTIONAL_FIELDS)[number];

/** Los datos del alta que recepción puede corregir o completar (9-21). */
export const INTAKE_CORRECTABLE_FIELDS = [
  'firstName', 'lastName', 'phoneE164', 'email', 'birthDate', 'memberSince', 'emergencyContactName', 'emergencyContactPhone',
] as const;
export type IntakeCorrectableField = (typeof INTAKE_CORRECTABLE_FIELDS)[number];

/** Días que un socio recién dado de alta conserva la franja «Para terminar su alta» (9-01). */
export const ONBOARDING_DAYS = 7;

// ── Cierre del alta: lo que falta, por el estado del socio ──────────────────

export const ONBOARDING_STEPS = ['SELL', 'COLLECT', 'PORTAL', 'FACE', 'DATA'] as const;
export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number];

export type OnboardingState = {
  /** Tiene una membresía viva (vigente, por empezar o con adeudo). */
  readonly hasMembership: boolean;
  /** Lo que debe hoy, en centavos. */
  readonly owesCents: bigint | number;
  /** Portal del socio encendido en el gimnasio (por omisión, sí). Sin él, el paso del código no existe. */
  readonly portalOn?: boolean;
  /** Ya activó el portal en su teléfono. */
  readonly portalActive: boolean;
  /** Biometría encendida en su sede. Sin ella, el paso del rostro no existe. */
  readonly biometricsOn: boolean;
  /** Ya tiene su rostro (o huella) registrado. */
  readonly enrolled: boolean;
  /** Datos de la ficha que quedaron vacíos (`birthDate`, `emergencyContactName`…). */
  readonly missingFields: readonly string[];
};

export type OnboardingStep = {
  readonly key: OnboardingStepKey;
  readonly done: boolean;
  /** Se ofrece, pero el alta está completa sin él. */
  readonly optional: boolean;
};

/**
 * Los pasos para terminar un alta, en orden, según el ESTADO del socio (9-01):
 * vender, cobrar, portal, rostro y datos que faltan. No depende de por qué
 * puerta entró (QR, interesado o mostrador): un exsocio vinculado que ya
 * tiene plan no ve «Vender membresía» (9-17).
 */
export function onboardingSteps(s: OnboardingState): OnboardingStep[] {
  const debe = BigInt(s.owesCents) > 0n;
  const pasos: OnboardingStep[] = [
    { key: 'SELL', done: s.hasMembership, optional: false },
  ];
  // Cobrar solo existe si ya hay algo que cobrar.
  if (s.hasMembership && debe) pasos.push({ key: 'COLLECT', done: false, optional: false });
  if (s.portalOn !== false) pasos.push({ key: 'PORTAL', done: s.portalActive, optional: true });
  if (s.biometricsOn) pasos.push({ key: 'FACE', done: s.enrolled, optional: true });
  if (s.missingFields.length > 0) pasos.push({ key: 'DATA', done: false, optional: true });
  return pasos;
}

/** El primer paso sin hacer: la acción principal del cierre. `null` = no falta nada. */
export function nextOnboardingStep(pasos: readonly OnboardingStep[]): OnboardingStep | null {
  return pasos.find((p) => !p.done) ?? null;
}
