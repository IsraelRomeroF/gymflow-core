import {
  normalizeEmail, normalizeName, normalizePhoneMx,
  rankMatches, AUTO_MERGE_THRESHOLD, REVIEW_THRESHOLD,
  type IdentityCandidate, type MatchResult,
} from './identity.js';

/**
 * ALTA DIGITAL (§5.1, ADR-029).
 *
 * El problema que resuelve es de aritmética: con arranque en blanco hay que
 * capturar ~1,500 socios, y a 10-15 minutos de mostrador cada uno son más de
 * 300 horas de recepción. Trasladar la digitación al teléfono del socio no es
 * una comodidad, es la diferencia entre poder apagar BDKGYM y no poder.
 *
 * Dos cosas NO se delegan al socio:
 *
 * - **La identidad.** Lo que el socio manda es un BORRADOR. Recepción lo
 *   confirma, y con los duplicados candidatos delante. Dejar que un formulario
 *   público escriba directamente en el padrón es fabricar un padrón sucio a
 *   velocidad industrial.
 * - **El texto del consentimiento.** Se muestra la versión vigente, se guarda
 *   el texto exacto que vio, y un borrador jamás sirve de evidencia.
 */

export type ConsentType =
  | 'PRIVACY_NOTICE' | 'BIOMETRIC' | 'RECURRING_CHARGE'
  | 'MARKETING' | 'HOUSE_RULES' | 'HEALTH_DATA';

export type ConsentDocumentStatus = 'DRAFT' | 'PUBLISHED' | 'RETIRED';

export type ConsentDocument = {
  readonly consentType: ConsentType;
  readonly version: string;
  readonly status: ConsentDocumentStatus;
  readonly bodyText: string;
  readonly required: boolean;
};

/**
 * Un borrador NO es evidencia.
 *
 * Un borrador todavía se puede editar, así que una firma sobre él produce
 * **evidencia inservible**: nadie podría decir después qué palabras aceptó el
 * socio. El dueño publica el texto desde el panel, con su motivo, y a partir
 * de ahí es inmutable. Que falle en el alta es incómodo un día; que no falle
 * es un problema el día de la reclamación.
 */
export function isUsableAsEvidence(doc: ConsentDocument): boolean {
  return doc.status === 'PUBLISHED' && doc.bodyText.trim().length > 0;
}

/**
 * Consentimientos exigidos para completar un alta.
 *
 * `BIOMETRIC` NO está aquí: se pide aparte, al enrolar (ADR-032), y nunca
 * enterrado en el alta. Hacerlo obligatorio para ser socio lo viciaría: el
 * socio que no quiere dar su rostro ni su huella entra por la vía alterna de
 * recepción, y eso es lo que hace libre el consentimiento (ADR-014).
 * `RECURRING_CHARGE` tampoco: ADR-025 y el mandato exigen pedirlo en su propio
 * momento, no en el alta.
 */
export const SIGNUP_REQUIRED_CONSENTS: readonly ConsentType[] = ['PRIVACY_NOTICE', 'HOUSE_RULES'];

export const SIGNUP_OPTIONAL_CONSENTS: readonly ConsentType[] = ['HEALTH_DATA', 'MARKETING'];

export type AcceptedConsent = {
  readonly consentType: ConsentType;
  readonly version: string;
  readonly granted: boolean;
};

export type ConsentGap =
  | { readonly kind: 'MISSING'; readonly consentType: ConsentType }
  | { readonly kind: 'REFUSED'; readonly consentType: ConsentType }
  | { readonly kind: 'STALE_VERSION'; readonly consentType: ConsentType; readonly accepted: string; readonly current: string }
  | { readonly kind: 'NOT_PUBLISHED'; readonly consentType: ConsentType; readonly version: string };

/**
 * Qué le falta a un alta para estar completa en materia de consentimientos.
 *
 * Devuelve TODOS los huecos, no el primero: recepción tiene que poder resolver
 * el alta en una pasada, no descubrir un problema nuevo en cada intento.
 */
export function consentGaps(
  documents: readonly ConsentDocument[],
  accepted: readonly AcceptedConsent[],
): ConsentGap[] {
  const gaps: ConsentGap[] = [];

  for (const type of SIGNUP_REQUIRED_CONSENTS) {
    // Manda el texto PUBLICADO. Un borrador más nuevo (por ejemplo, el aviso de
    // privacidad que espera la firma de la dueña, D-25) no detiene las altas:
    // se sigue firmando el vigente hasta que el nuevo se publique. Solo cuando
    // no hay ninguno publicado, el borrador bloquea.
    const current = documents.find((d) => d.consentType === type && d.status === 'PUBLISHED')
      ?? documents.find((d) => d.consentType === type && d.status !== 'RETIRED');
    const given = accepted.find((a) => a.consentType === type);

    if (!given) { gaps.push({ kind: 'MISSING', consentType: type }); continue; }
    if (!given.granted) { gaps.push({ kind: 'REFUSED', consentType: type }); continue; }
    if (!current) { gaps.push({ kind: 'MISSING', consentType: type }); continue; }
    if (!isUsableAsEvidence(current)) {
      gaps.push({ kind: 'NOT_PUBLISHED', consentType: type, version: current.version });
      continue;
    }
    if (given.version !== current.version) {
      gaps.push({ kind: 'STALE_VERSION', consentType: type, accepted: given.version, current: current.version });
    }
  }

  return gaps;
}

// ── El borrador que manda el socio ──────────────────────────────────────────

export type IntakeDraft = {
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly birthDate: Date | null;
  readonly emergencyContactName: string | null;
  readonly emergencyContactPhone: string | null;
  /**
   * "¿Desde cuándo vienes?" — lo contesta el propio socio.
   *
   * Es el campo que ADR-029 salva del arranque en blanco: la antigüedad
   * alimenta la pantalla de excepción y el ranking de retención. Y el socio la
   * recuerda mejor que recepción, que ante la duda pone hoy.
   */
  readonly memberSince: Date | null;
  readonly healthNotes: string | null;
  /**
   * «¿Tienes 18 años o más?» (D-10, fase 3). `false` obliga a dar la fecha de
   * nacimiento; sin contestar (un cliente viejo) vale lo que diga la fecha.
   */
  readonly adult?: boolean | null | undefined;
  /** Papá, mamá o tutor de quien tiene de 15 a 17 años (D-10): a quién llama el gimnasio y quién firma en el mostrador. */
  readonly guardianName?: string | null | undefined;
  readonly guardianPhone?: string | null | undefined;
};

export type IntakeFieldError = { readonly field: keyof IntakeDraft; readonly message: string };

export const MIN_AGE_YEARS = 15;
export const MAX_AGE_YEARS = 110;
/** Mayoría de edad: por debajo, el alta necesita a su tutor (D-10). */
export const ADULT_AGE_YEARS = 18;

/**
 * ¿Es menor de edad ese día? (D-10). Sin fecha de nacimiento no se sabe y se
 * contesta `false`: el formulario del QR la exige a quien dice no tener 18.
 */
export function isMinor(birthDate: Date | null | undefined, today: Date): boolean {
  return !!birthDate && yearsBetween(birthDate, today) < ADULT_AGE_YEARS;
}

/**
 * Valida el borrador. Es DELIBERADAMENTE tolerante con todo salvo el contacto.
 *
 * Un alta que rebota por un apellido con guion es un socio que abandona el
 * formulario y acaba en el mostrador, que es justo lo que se quería evitar.
 * Lo que no se cede es el medio de contacto: sin teléfono ni correo no hay
 * forma de invitarle al portal ni de avisarle de un cobro, y el registro nace
 * inútil.
 */
export function validateIntake(draft: IntakeDraft, today: Date): IntakeFieldError[] {
  const errors: IntakeFieldError[] = [];

  if (normalizeName(draft.firstName).length < 2) {
    errors.push({ field: 'firstName', message: 'El nombre es obligatorio' });
  }
  if (normalizeName(draft.lastName).length < 2) {
    errors.push({ field: 'lastName', message: 'El apellido es obligatorio' });
  }

  const phone = normalizePhoneMx(draft.phone);
  const email = normalizeEmail(draft.email);
  if (!phone && !email) {
    errors.push({ field: 'phone', message: 'Hace falta un teléfono o un correo para contactarte' });
  }
  if (draft.phone && !phone) {
    errors.push({ field: 'phone', message: 'El teléfono no parece válido (10 dígitos)' });
  }
  if (draft.email && !email) {
    errors.push({ field: 'email', message: 'El correo no parece válido' });
  }

  if (draft.birthDate) {
    const years = yearsBetween(draft.birthDate, today);
    if (years < MIN_AGE_YEARS) {
      errors.push({ field: 'birthDate', message: `El alta en línea es para mayores de ${MIN_AGE_YEARS} años` });
    } else if (years > MAX_AGE_YEARS) {
      errors.push({ field: 'birthDate', message: 'Revisa la fecha de nacimiento' });
    }
  }

  // Menores de 15 a 17 (D-10): dicen quién es su tutor y a qué celular se le
  // llama. El alta queda «falta su tutor» hasta que firme en el mostrador.
  if (draft.adult === false && !draft.birthDate) {
    errors.push({ field: 'birthDate', message: 'Si tienes menos de 18 años, escribe tu fecha de nacimiento' });
  }
  if (isMinor(draft.birthDate, today) && yearsBetween(draft.birthDate!, today) >= MIN_AGE_YEARS) {
    if (normalizeName(draft.guardianName ?? '').length < 2) {
      errors.push({ field: 'guardianName', message: 'Escribe el nombre de tu papá, mamá o tutor' });
    }
    if (!normalizePhoneMx(draft.guardianPhone)) {
      errors.push({ field: 'guardianPhone', message: 'Escribe el celular de tu papá, mamá o tutor (10 dígitos)' });
    }
  }

  // Una antigüedad en el futuro no es un error del socio: es un dedo. Se
  // rechaza con un mensaje que no lo culpa.
  if (draft.memberSince && draft.memberSince.getTime() > today.getTime()) {
    errors.push({ field: 'memberSince', message: 'Esa fecha todavía no ha llegado' });
  }

  if (draft.emergencyContactPhone && !normalizePhoneMx(draft.emergencyContactPhone)) {
    errors.push({ field: 'emergencyContactPhone', message: 'El teléfono de emergencia no parece válido' });
  }

  return errors;
}

export function yearsBetween(from: Date, to: Date): number {
  let years = to.getUTCFullYear() - from.getUTCFullYear();
  const beforeBirthday = to.getUTCMonth() < from.getUTCMonth()
    || (to.getUTCMonth() === from.getUTCMonth() && to.getUTCDate() < from.getUTCDate());
  if (beforeBirthday) years -= 1;
  return years;
}

export function draftToCandidate(draft: IntakeDraft, id = 'intake'): IdentityCandidate {
  return {
    id,
    firstName: draft.firstName,
    lastName: draft.lastName,
    phoneE164: normalizePhoneMx(draft.phone),
    email: normalizeEmail(draft.email),
    curp: null,
    birthDate: draft.birthDate ? draft.birthDate.toISOString().slice(0, 10) : null,
  };
}

export type IntakeReviewOutcome = 'AUTO_LINK' | 'NEEDS_REVIEW' | 'NEW_MEMBER';

export type IntakeReview = {
  readonly outcome: IntakeReviewOutcome;
  readonly matches: readonly MatchResult[];
};

/**
 * Qué hacer con un borrador que llega del teléfono.
 *
 * `AUTO_LINK` NO da el alta por sí solo: significa que el borrador es casi con
 * seguridad un socio que YA existe —el caso habitual en una recaptura de
 * padrón, donde el mismo socio rellena el formulario dos veces o ya lo
 * registró recepción— y que lo correcto es actualizar aquel, no crear otro.
 * La confirmación sigue siendo humana.
 */
export function reviewIntake(
  draft: IntakeDraft,
  existing: readonly IdentityCandidate[],
): IntakeReview {
  const matches = rankMatches(draftToCandidate(draft), existing);
  const best = matches[0];

  if (!best || best.score < REVIEW_THRESHOLD) return { outcome: 'NEW_MEMBER', matches: [] };
  if (best.score >= AUTO_MERGE_THRESHOLD) return { outcome: 'AUTO_LINK', matches };
  return { outcome: 'NEEDS_REVIEW', matches };
}

/**
 * Cuánto trabajo de mostrador queda. El criterio del sprint es < 5 minutos de
 * recepción por alta, y esto es lo que se mide contra él.
 */
export function pendingFieldCount(draft: IntakeDraft): number {
  const optional: Array<unknown> = [
    draft.birthDate, draft.emergencyContactName, draft.emergencyContactPhone, draft.memberSince,
  ];
  return optional.filter((v) => v === null || v === '').length;
}
