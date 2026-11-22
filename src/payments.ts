import type { PaymentStatus } from './billing.js';

/**
 * Cobro con tarjeta en archivo (§11, ADR-010, docs/07-pagos.md).
 *
 * Todo lo de aquí es PURO porque es lo que no se puede probar en producción:
 * un doble cobro se descubre cuando el socio reclama, y para entonces ya
 * ocurrió. La regla que gobierna el módulo es una sola:
 *
 *   **Ante la duda, no se cobra otra vez.**
 *
 * De ahí salen las tres decisiones que parecen exageradas y no lo son: la
 * clave de idempotencia se DERIVA (no se sortea), un timeout NO es un fallo,
 * y un rechazo duro no se reintenta solo.
 */

// ── Idempotencia ────────────────────────────────────────────────────────────

/**
 * Clave del intento. **Derivada, y por eso se puede regenerar.**
 *
 * El orden obligatorio es: generar la clave, PERSISTIRLA, y solo entonces
 * llamar al procesador. Si el proceso muere entre la llamada y la respuesta,
 * el reintento reconstruye exactamente la misma clave y el procesador
 * reconoce la operación en vez de cobrar de nuevo. Una clave aleatoria en
 * memoria se pierde con el proceso, que es justo cuando hace falta.
 */
export function attemptIdempotencyKey(chargeId: string, attemptNumber: number): string {
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) {
    throw new RangeError('attemptNumber empieza en 1');
  }
  return `ch_${chargeId}_a${attemptNumber}`;
}

/** Clave del reembolso. Misma lógica: dos clics no devuelven dos veces. */
export function refundIdempotencyKey(paymentId: string, sequence: number): string {
  return `rf_${paymentId}_n${sequence}`;
}

// ── Rechazos ────────────────────────────────────────────────────────────────

/**
 * Qué significa un rechazo para el REINTENTO. No es lo mismo "no había saldo
 * el día 1" que "esa tarjeta está reportada".
 */
export type DeclineKind = 'SOFT' | 'HARD' | 'AUTH_REQUIRED' | 'UNCLASSIFIED';

/**
 * Códigos que NO se reintentan nunca de forma automática.
 *
 * Reintentar un `stolen_card` o un `do_not_honor` no recupera nada y sí sube
 * la tasa de rechazos del comercio, que las redes penalizan y los
 * procesadores vigilan. Un rechazo duro es trabajo para una persona: hay que
 * pedirle otra tarjeta al socio.
 */
export const HARD_DECLINE_CODES: readonly string[] = [
  'card_declined', 'stolen_card', 'lost_card', 'pickup_card',
  'do_not_honor', 'invalid_account', 'account_closed',
  'card_not_supported', 'currency_not_supported', 'revocation_of_authorization',
  'transaction_not_allowed', 'fraudulent',
];

/** Códigos que sí valen un reintento más tarde: la causa puede desaparecer. */
export const SOFT_DECLINE_CODES: readonly string[] = [
  'insufficient_funds', 'try_again_later', 'processing_error',
  'issuer_not_available', 'reenter_transaction', 'approve_with_id',
  'card_velocity_exceeded', 'withdrawal_count_limit_exceeded',
];

export const AUTH_REQUIRED_CODES: readonly string[] = [
  'authentication_required', 'payment_intent_authentication_failure',
];

export function classifyDecline(code: string | null | undefined): DeclineKind {
  if (!code) return 'UNCLASSIFIED';
  const c = code.trim().toLowerCase();
  if (AUTH_REQUIRED_CODES.includes(c)) return 'AUTH_REQUIRED';
  if (HARD_DECLINE_CODES.includes(c)) return 'HARD';
  if (SOFT_DECLINE_CODES.includes(c)) return 'SOFT';
  // Un código desconocido se trata como DURO. La asimetría es deliberada:
  // equivocarse hacia "no reintentar" cuesta una llamada al socio;
  // equivocarse hacia "reintentar" cuesta cargos repetidos a una tarjeta que
  // el emisor ya dijo que no.
  return 'UNCLASSIFIED';
}

export function isAutoRetriable(kind: DeclineKind): boolean {
  return kind === 'SOFT';
}

// ── Mandato ─────────────────────────────────────────────────────────────────

/**
 * Autorización del socio para cobros recurrentes.
 *
 * Sin mandato vivo NO se cobra off-session, y no es formalismo: un cargo sin
 * mandato demostrable es un contracargo que se pierde, porque la carga de la
 * prueba es del comercio.
 */
export type Mandate = {
  readonly consentType: string;
  readonly documentVersion: string;
  readonly granted: boolean;
  readonly grantedAt: Date;
  readonly revokedAt: Date | null;
  /** Evidencia de dónde y cómo se firmó. */
  readonly ip: string | null;
  readonly userAgent: string | null;
};

export type MandateGap =
  | 'MISSING' | 'REFUSED' | 'REVOKED' | 'WRONG_TYPE' | 'NO_EVIDENCE' | 'STALE_VERSION';

/**
 * Qué le falta al mandato para poder cobrar off-session.
 *
 * `NO_EVIDENCE` es el que se olvida: un consentimiento sin IP ni dispositivo
 * es una fila en una tabla, no una prueba. Ante una disputa, "lo aceptó" sin
 * decir desde dónde ni con qué no convence a nadie.
 */
export function mandateGaps(
  mandate: Mandate | null,
  currentVersion: string | null,
): MandateGap[] {
  if (!mandate) return ['MISSING'];

  const gaps: MandateGap[] = [];
  if (mandate.consentType !== 'RECURRING_CHARGE') gaps.push('WRONG_TYPE');
  if (!mandate.granted) gaps.push('REFUSED');
  if (mandate.revokedAt !== null) gaps.push('REVOKED');
  if (!mandate.ip || !mandate.userAgent) gaps.push('NO_EVIDENCE');
  if (currentVersion && mandate.documentVersion !== currentVersion) gaps.push('STALE_VERSION');
  return gaps;
}

/**
 * Una versión nueva del texto NO invalida el mandato vigente.
 *
 * Es deliberado: dejar de cobrar a todo el padrón porque el abogado corrigió
 * una coma sería peor que el problema. Se marca para volver a pedirlo, y
 * mientras tanto el cobro sigue amparado por lo que el socio firmó.
 */
export function mandateAllowsOffSession(mandate: Mandate | null, currentVersion: string | null): boolean {
  return mandateGaps(mandate, currentVersion).every((g) => g === 'STALE_VERSION');
}

// ── El PAN no entra ─────────────────────────────────────────────────────────

/** Luhn. Es lo que separa un número de tarjeta de dieciséis dígitos sueltos. */
export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Mínimo de dígitos para considerar algo una tarjeta.
 *
 * **Catorce, no trece, y es una decisión con coste.** Las tarjetas de 13
 * dígitos existieron —Visa las retiró hace años— y quedan fuera de la
 * detección. A cambio se elimina un falso positivo masivo: un
 * **`Date.now()` en milisegundos tiene exactamente 13 dígitos**, y uno de
 * cada diez cuadra con Luhn por azar. Lo destapó la CI rechazando una
 * petición legítima cuyo identificador llevaba una marca de tiempo.
 *
 * Con 13 el control habría rechazado a diario datos normales, y un control
 * que estorba acaba desactivado — que es perder el control entero, no una
 * décima parte de él.
 */
export const PAN_MIN_DIGITS = 14;
export const PAN_MAX_DIGITS = 19;

/**
 * ¿Esto parece un número de tarjeta?
 *
 * Longitud **y** Luhn, las dos. Solo longitud produce falsos positivos con
 * folios y referencias, y un rechazo del borde que se dispara con datos
 * legítimos acaba desactivado por alguien harto — que es la peor forma de
 * perder un control.
 *
 * Los separadores se ignoran porque un PAN pegado desde un correo llega con
 * espacios o guiones, y ese es precisamente el caso que hay que atrapar.
 */
export function looksLikePan(value: string): boolean {
  const compact = value.replace(/[\s._/-]/g, '');
  if (!/^\d+$/.test(compact)) return false;
  if (compact.length < PAN_MIN_DIGITS || compact.length > PAN_MAX_DIGITS) return false;
  return luhnValid(compact);
}

/**
 * Secuencia con forma de tarjeta EN MEDIO de un texto.
 *
 * Existe porque `looksLikePan` exige que el valor entero sea el número, y el
 * sitio donde de verdad aparece un PAN no es un campo `cardNumber` —ese no se
 * envía nunca— sino el campo de notas del socio, donde alguien pega lo que le
 * dictaron por teléfono.
 *
 * **Dos correcciones que costaron un agujero real.** La primera versión usaba
 * un regex voraz de 13 a 19 dígitos y solo admitía espacio y guion. Fallaba
 * en dos casos que sí ocurren:
 *
 * - `4111.1111.1111.1111` — quien pega de un correo trae el separador que
 *   trae; el punto y la barra son tan comunes como el guion.
 * - `ref 994111111111111111` — el voraz se comía los 18 dígitos, Luhn fallaba
 *   sobre el conjunto, y `matchAll` reanudaba DESPUÉS: el PAN de 16 que iba
 *   dentro no se evaluaba jamás.
 *
 * Ahora se aísla cada racha de dígitos y, si es más larga que un PAN, se
 * recorre con ventanas de las longitudes que existen de verdad (15 de
 * American Express, 16 de la mayoría, 19 de algunas emisiones). No se prueban
 * todas las longitudes de 13 a 19 a propósito: multiplicaría los falsos
 * positivos sobre referencias numéricas largas, y un control que estorba con
 * datos legítimos acaba desactivado.
 *
 * **Queda un falso positivo conocido y asumido.** Una racha muy larga de
 * dígitos —una referencia SPEI de 22, por ejemplo— puede contener por azar
 * una subcadena de 16 que cuadre con Luhn, y se rechaza. Se acepta a
 * sabiendas: dejar pasar un PAN cuesta el alcance PCI del comercio; rechazar
 * una referencia cuesta una llamada. La asimetría manda, y los separadores no
 * lo salvan porque se compactan antes de mirar.
 */
const SEPARADORES = /[\s._/-]/g;

/**
 * Los identificadores del sistema NO son tarjetas, y hay que quitarlos antes
 * de mirar.
 *
 * Lo encontró la CI: un `cashSessionId` fue rechazado como si fuera un PAN.
 * Un UUID lleva guiones, y los guiones son separadores válidos en una
 * tarjeta, así que al compactarlo quedaban 32 dígitos entre los que aparecía
 * por azar una subcadena de 16 que cuadraba con Luhn. Como el API está lleno
 * de UUIDs, el control habría rechazado peticiones legítimas a diario — y un
 * control que estorba acaba desactivado.
 */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Racha de dígitos con separadores de agrupación de tarjeta. */
const RACHA = /[0-9][0-9\s._/-]*[0-9]/g;

/** Longitudes de PAN que existen en circulación. */
const LONGITUDES_REALES = [16, 15, 19] as const;

function hayPanEnRacha(crudo: string): boolean {
  const digitos = crudo.replace(SEPARADORES, '');
  if (digitos.length < PAN_MIN_DIGITS) return false;
  if (digitos.length <= PAN_MAX_DIGITS && luhnValid(digitos)) return true;

  /**
   * Más larga que un PAN. Solo se recorre con ventanas si la racha es de
   * DÍGITOS PUROS.
   *
   * Con separadores de por medio, recorrerla junta grupos que nunca fueron un
   * número solo —una referencia bancaria, una fecha, un identificador— y el
   * falso positivo es casi seguro. Sin separadores, en cambio, "99" pegado
   * delante de una tarjeta sí es el caso que hay que atrapar.
   */
  if (digitos.length !== crudo.length) return false;
  if (digitos.length <= PAN_MIN_DIGITS) return false;

  for (const largo of LONGITUDES_REALES) {
    if (digitos.length <= largo) continue;
    for (let i = 0; i + largo <= digitos.length; i++) {
      if (luhnValid(digitos.slice(i, i + largo))) return true;
    }
  }
  return false;
}

export function containsPanLike(text: string): boolean {
  // Los identificadores se borran primero: nunca son tarjetas y sus guiones
  // engañan al agrupador.
  const limpio = text.replace(UUID, ' ');
  for (const match of limpio.matchAll(RACHA)) {
    if (hayPanEnRacha(match[0])) return true;
  }
  return false;
}

/** Rutas del objeto donde aparece algo con forma de tarjeta. Vacío = limpio. */
export function findPanLike(value: unknown, path = '$'): string[] {
  if (typeof value === 'string') return containsPanLike(value) ? [path] : [];
  if (typeof value === 'number') return looksLikePan(String(value)) ? [path] : [];
  if (Array.isArray(value)) return value.flatMap((v, i) => findPanLike(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .flatMap(([k, v]) => findPanLike(v, `${path}.${k}`));
  }
  return [];
}

/**
 * Sustituye en un texto cualquier secuencia con forma de tarjeta.
 *
 * Es la segunda barrera, para el logger: la primera rechaza la petición, y
 * esta existe **por si acaso** —un mensaje de error de una librería, una traza
 * pegada por soporte— porque el PAN no debe tocar los logs ni de rebote.
 */
export function redactPanLike(text: string): string {
  return text.replace(RACHA, (match) => (hayPanEnRacha(match) ? '[PAN redactado]' : match));
}

/** Lo ÚNICO que se guarda de una tarjeta, además del token. */
export type CardFingerprint = {
  readonly brand: string | null;
  readonly last4: string | null;
  readonly expMonth: number | null;
  readonly expYear: number | null;
};

export function isValidLast4(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^\d{4}$/.test(value);
}

/** Tarjeta por vencer: el mes en que expira todavía sirve. */
export function cardExpired(card: CardFingerprint, at: Date): boolean {
  if (!card.expMonth || !card.expYear) return false;
  const lastValid = Date.UTC(card.expYear, card.expMonth, 1) - 1;
  return at.getTime() > lastValid;
}

export const CARD_EXPIRY_WARNING_DAYS = 45;

export function cardExpiringSoon(card: CardFingerprint, at: Date): boolean {
  if (!card.expMonth || !card.expYear) return false;
  if (cardExpired(card, at)) return false;
  const lastValid = Date.UTC(card.expYear, card.expMonth, 1) - 1;
  return lastValid - at.getTime() <= CARD_EXPIRY_WARNING_DAYS * 86_400_000;
}

// ── Webhooks ────────────────────────────────────────────────────────────────

export type WebhookVerdict = 'PROCESS' | 'DUPLICATE' | 'INVALID_SIGNATURE';

export function webhookVerdict(input: {
  readonly signatureValid: boolean;
  readonly alreadySeen: boolean;
}): WebhookVerdict {
  // La firma primero: un evento con firma inválida no se deduplica, se
  // rechaza. Deduplicarlo sería dejar que un tercero ocupe el identificador
  // de un evento legítimo que todavía no ha llegado.
  if (!input.signatureValid) return 'INVALID_SIGNATURE';
  return input.alreadySeen ? 'DUPLICATE' : 'PROCESS';
}

/**
 * Estados FINALES de un pago. Un evento no puede sacarlo de aquí.
 *
 * Los webhooks llegan desordenados —es normal, no una avería— y sin esta
 * guarda un `payment_failed` retrasado deshace un cobro que ya tuvo éxito:
 * el socio pagó, el sistema dice que no, y el torniquete le cierra la puerta.
 */
const TERMINAL: readonly PaymentStatus[] = ['SUCCEEDED', 'REVERSED', 'CANCELED'];

export function isTerminalPayment(status: PaymentStatus): boolean {
  return TERMINAL.includes(status);
}

/**
 * ¿Se aplica este evento al pago?
 *
 * `SUCCEEDED` es absorbente salvo por la reversión, que es una operación
 * deliberada y no un evento atrasado.
 */
export function canApplyEvent(current: PaymentStatus, incoming: PaymentStatus): boolean {
  if (current === incoming) return false;
  if (current === 'SUCCEEDED') return incoming === 'REVERSED';
  if (current === 'REVERSED' || current === 'CANCELED') return false;
  return true;
}

// ── Resolución de lo desconocido ────────────────────────────────────────────

/**
 * Un timeout NO es un fallo.
 *
 * Es la regla más importante del módulo y la más fácil de romper: marcar
 * `FAILED` lo que en realidad fue "no sé" hace que el reintento cobre por
 * segunda vez algo que ya se cobró. Por eso `UNKNOWN` bloquea reintentos
 * (`blocksNewAttempts`) hasta que el procesador diga qué pasó.
 */
export function statusFromProvider(providerStatus: string): PaymentStatus {
  switch (providerStatus) {
    case 'succeeded': return 'SUCCEEDED';
    case 'processing': return 'PROCESSING';
    case 'requires_action': return 'REQUIRES_ACTION';
    case 'canceled': return 'CANCELED';
    case 'failed': return 'FAILED';
    // Lo que no se reconoce se queda en UNKNOWN, que bloquea. Un estado nuevo
    // del proveedor no puede traducirse a "fallo" por omisión.
    default: return 'UNKNOWN';
  }
}

/** Cuánto lleva un pago sin resolverse. Insumo de la bandeja de conciliación. */
export const UNKNOWN_ESCALATION_HOURS = 24;

export function unknownNeedsEscalation(since: Date, now: Date): boolean {
  return now.getTime() - since.getTime() >= UNKNOWN_ESCALATION_HOURS * 3_600_000;
}

// ── Reembolsos ──────────────────────────────────────────────────────────────

export function maxRefundableCents(paymentAmountCents: bigint, alreadyRefundedCents: bigint): bigint {
  const left = paymentAmountCents - alreadyRefundedCents;
  return left > 0n ? left : 0n;
}

export type RefundDenial = 'NOT_SUCCEEDED' | 'AMOUNT_NOT_POSITIVE' | 'EXCEEDS_PAYMENT' | 'NO_REASON';

export function refundDenial(input: {
  readonly paymentStatus: PaymentStatus;
  readonly amountCents: bigint;
  readonly paymentAmountCents: bigint;
  readonly alreadyRefundedCents: bigint;
  readonly reason: string;
}): RefundDenial | null {
  if (input.paymentStatus !== 'SUCCEEDED') return 'NOT_SUCCEEDED';
  if (!input.reason.trim()) return 'NO_REASON';
  if (input.amountCents <= 0n) return 'AMOUNT_NOT_POSITIVE';
  if (input.amountCents > maxRefundableCents(input.paymentAmountCents, input.alreadyRefundedCents)) {
    return 'EXCEEDS_PAYMENT';
  }
  return null;
}

// ── Contracargos ────────────────────────────────────────────────────────────

/**
 * La ventana de riesgo real en México es de ~135 días **desde la fecha de
 * corte del estado de cuenta del socio**, no desde el cargo (docs/07 §9.2).
 *
 * La diferencia importa: un cargo del día 2 aparece en un corte del día 28 y
 * la cuenta empieza ahí. Guardar la evidencia 90 días —el número que suele
 * repetirse— la borra justo antes de necesitarla.
 */
export const CHARGEBACK_WINDOW_DAYS = 135;

export function chargebackWindowEnd(statementCutDate: Date): Date {
  return new Date(statementCutDate.getTime() + CHARGEBACK_WINDOW_DAYS * 86_400_000);
}
