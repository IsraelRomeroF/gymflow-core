/**
 * Reconocimiento biométrico (ADR-014, ADR-032).
 *
 * Aquí vive lo que decide, no lo que calcula. El motor —InsightFace sobre
 * ONNX— produce un vector y una puntuación; **qué se hace con esa puntuación
 * es una decisión de producto**, y por eso es pura, está probada y se puede
 * calibrar sin tocar el motor.
 *
 * La diferencia con una credencial criptográfica hay que tenerla presente
 * todo el tiempo: **un HMAC prueba; un parecido es una probabilidad.** Todo
 * este módulo existe para que esa probabilidad se trate como tal.
 */

export type BiometricModality = 'FACE' | 'FINGERPRINT';

// ── Identificación 1:N ──────────────────────────────────────────────────────

export type Candidate = {
  readonly memberId: string;
  /** Similitud coseno con la plantilla almacenada. 1 = idéntico. */
  readonly score: number;
};

export type MatchSettings = {
  /** Mínimo para considerar que hay parecido suficiente. */
  readonly threshold: number;
  /**
   * Distancia mínima entre el mejor y el segundo.
   *
   * **Es la protección que de verdad importa en 1:N**, y la que casi siempre
   * falta: tomar el máximo y compararlo contra el umbral funciona con diez
   * empleados y se degrada con mil ochocientos socios, porque basta con que
   * dos personas se parezcan más entre sí que al umbral. Si el segundo pisa
   * al primero, el sistema **no sabe** quién es — y decir "no sé" es la única
   * respuesta correcta.
   */
  readonly minMargin: number;
};

/**
 * Valores por defecto. `SUPUESTO`, y deliberadamente **más estrictos** que los
 * de HRFlow, de donde viene el motor.
 *
 * Allí el umbral es 0.45 sin justificación escrita, y compara contra los
 * empleados de una empresa. Una sucursal tiene ~1,850 socios: en 1:N la
 * probabilidad de emparejar al equivocado crece con N, y aquí un falso
 * positivo **consume la visita pagada de otro socio** y envenena las alertas
 * de retención.
 *
 * **Estos números hay que medirlos contra el padrón real antes de enrolar a
 * nadie.** Están aquí, juntos y con nombre, para poder cambiarlos de una vez
 * cuando exista esa medición — no para darlos por buenos.
 */
export const DEFAULT_MATCH_SETTINGS: MatchSettings = {
  threshold: 0.55,
  minMargin: 0.05,
};

export type BiometricMatch =
  | { readonly outcome: 'MATCH'; readonly memberId: string; readonly score: number; readonly margin: number }
  /** Nadie se parece lo suficiente. */
  | { readonly outcome: 'NO_MATCH'; readonly bestScore: number }
  /** Dos o más se parecen demasiado entre sí: el sistema NO sabe quién es. */
  | { readonly outcome: 'AMBIGUOUS'; readonly bestScore: number; readonly margin: number };

/**
 * Resuelve una identificación 1:N.
 *
 * Nunca devuelve un socio "por aproximación": o hay un ganador claro, o no
 * hay respuesta. Un `AMBIGUOUS` en la puerta se resuelve con recepción, que
 * es molesto; un falso positivo se resuelve descubriendo dentro de un mes que
 * a alguien le gastaron sus visitas, que es peor.
 */
export function identify(
  candidates: readonly Candidate[],
  settings: MatchSettings = DEFAULT_MATCH_SETTINGS,
): BiometricMatch {
  if (candidates.length === 0) return { outcome: 'NO_MATCH', bestScore: 0 };

  const ordenados = [...candidates].sort((a, b) => b.score - a.score);
  const mejor = ordenados[0]!;
  const segundo = ordenados[1];

  if (mejor.score < settings.threshold) return { outcome: 'NO_MATCH', bestScore: mejor.score };

  // Sin segundo candidato el margen es total: no hay con quién confundirse.
  const margen = segundo ? mejor.score - segundo.score : 1;
  if (margen < settings.minMargin) {
    return { outcome: 'AMBIGUOUS', bestScore: mejor.score, margin: margen };
  }

  return { outcome: 'MATCH', memberId: mejor.memberId, score: mejor.score, margin: margen };
}

// ── Detección de vida ───────────────────────────────────────────────────────

/**
 * Cómo se comprobó que había una persona viva delante.
 *
 * `ACTIVE` es el reto de movimiento: frena una fotografía, **no frena un
 * video**. Lo dice el propio código del motor. `PASSIVE` analiza la textura
 * de impresión o pantalla en un solo cuadro y sí lo frena, pero exige tener
 * el modelo cargado.
 */
export type LivenessMode = 'NONE' | 'ACTIVE' | 'PASSIVE' | 'BOTH';

export type LivenessEvidence = {
  readonly mode: LivenessMode;
  /** Puntuación del modelo pasivo, si corrió. */
  readonly passiveScore: number | null;
  /** El reto de movimiento se superó, si se pidió. */
  readonly activePassed: boolean | null;
};

export type LivenessSettings = {
  readonly passiveThreshold: number;
  /**
   * ¿Se exige al menos una capa? Apagarlo deja la puerta abierta a una foto,
   * así que solo debería estar en falso mientras se calibra.
   */
  readonly required: boolean;
};

export const DEFAULT_LIVENESS_SETTINGS: LivenessSettings = {
  passiveThreshold: 0.55,
  required: true,
};

export type LivenessVerdict =
  | { readonly outcome: 'PASS'; readonly stopsVideoReplay: boolean }
  | { readonly outcome: 'FAIL'; readonly reason: 'NO_CHECK' | 'ACTIVE_FAILED' | 'PASSIVE_LOW' };

/**
 * Veredicto de vida, **y si esa comprobación frena un video o no**.
 *
 * Lo segundo no es un detalle técnico: mientras solo corra el reto activo, la
 * bitácora no puede afirmar que hubo una persona delante, solo que hubo algo
 * que se movía. Registrarlo es lo que permite, el día de una reclamación,
 * saber qué se comprobó de verdad.
 */
export function evaluateLiveness(
  evidence: LivenessEvidence,
  settings: LivenessSettings = DEFAULT_LIVENESS_SETTINGS,
): LivenessVerdict {
  if (evidence.mode === 'NONE') {
    return settings.required
      ? { outcome: 'FAIL', reason: 'NO_CHECK' }
      : { outcome: 'PASS', stopsVideoReplay: false };
  }

  const usaActivo = evidence.mode === 'ACTIVE' || evidence.mode === 'BOTH';
  const usaPasivo = evidence.mode === 'PASSIVE' || evidence.mode === 'BOTH';

  if (usaActivo && evidence.activePassed === false) {
    return { outcome: 'FAIL', reason: 'ACTIVE_FAILED' };
  }
  if (usaPasivo) {
    const score = evidence.passiveScore ?? 0;
    if (score < settings.passiveThreshold) return { outcome: 'FAIL', reason: 'PASSIVE_LOW' };
  }

  return { outcome: 'PASS', stopsVideoReplay: usaPasivo };
}

// ── Enrolamiento ────────────────────────────────────────────────────────────

/**
 * Constancia de que alguien está enrolado. **Nunca lleva el vector.**
 *
 * La plantilla vive en el equipo de la sucursal (ADR-032). Esto es lo que la
 * nube sí guarda, y cada campo está por una obligación concreta de ADR-014.
 */
export type Enrollment = {
  readonly memberId: string;
  readonly modality: BiometricModality;
  /** Dónde vive la plantilla. Sin esto no se puede ordenar su borrado. */
  readonly branchId: string | null;
  /** Las plantillas NO son portables entre algoritmos: hay que saber cuál. */
  readonly algorithmVendor: string | null;
  /** OBLIGATORIO. Un enrolamiento sin consentimiento no debería existir. */
  readonly consentId: string | null;
  readonly enrolledByUserId: string | null;
  readonly enrolledAt: Date;
  readonly revokedAt: Date | null;
  /** Cuándo se confirmó que la sucursal borró la plantilla. */
  readonly templateDeletedAt: Date | null;
};

export type EnrollmentGap =
  | 'NO_CONSENT' | 'NO_BRANCH' | 'NO_ALGORITHM' | 'NO_ENROLLER' | 'REVOKED';

/**
 * Qué le falta a un enrolamiento para ser utilizable y defendible.
 *
 * `NO_CONSENT` es el que convierte todo lo demás en irrelevante: es
 * exactamente el pasivo heredado que ADR-014 identifica como riesgo
 * principal, y del que este sistema arranca libre por ser un alta en blanco.
 * Volver a crearlo sería el peor desperdicio posible.
 */
export function enrollmentGaps(enrollment: Enrollment): EnrollmentGap[] {
  const gaps: EnrollmentGap[] = [];
  if (!enrollment.consentId) gaps.push('NO_CONSENT');
  if (!enrollment.branchId) gaps.push('NO_BRANCH');
  if (!enrollment.algorithmVendor) gaps.push('NO_ALGORITHM');
  if (!enrollment.enrolledByUserId) gaps.push('NO_ENROLLER');
  if (enrollment.revokedAt !== null) gaps.push('REVOKED');
  return gaps;
}

export function isUsableForAccess(enrollment: Enrollment): boolean {
  return enrollmentGaps(enrollment).length === 0;
}

/**
 * Plantillas que hay que borrar, y **no es lo mismo que un socio archivado**.
 *
 * ADR-014 exige supresión al terminar la relación. Sin un plazo explícito, un
 * enrolamiento revocado se queda en el equipo de la sucursal para siempre y
 * nadie se entera, porque nada falla.
 */
export const TEMPLATE_RETENTION_DAYS = 30;

export function templateDeletionDue(
  enrollment: Enrollment,
  at: Date,
  retentionDays = TEMPLATE_RETENTION_DAYS,
): boolean {
  if (enrollment.templateDeletedAt !== null) return false;
  if (enrollment.revokedAt === null) return false;
  return at.getTime() - enrollment.revokedAt.getTime() >= retentionDays * 86_400_000;
}

/**
 * Un socio enrolado en una sucursal NO es reconocido en otra.
 *
 * Es la consecuencia directa de que la plantilla no salga de su sede
 * (ADR-014), y conviene que sea una función con nombre en vez de una
 * condición escondida: es lo que obliga a que exista la vía alterna de
 * recepción, y lo que recepción tiene que poder explicar en diez segundos.
 */
export function enrolledAtBranch(
  enrollments: readonly Enrollment[],
  branchId: string,
  modality: BiometricModality,
): boolean {
  return enrollments.some((e) => e.branchId === branchId
    && e.modality === modality
    && isUsableForAccess(e));
}
