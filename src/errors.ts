export type DomainErrorCode =
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'REQUIRE_APPROVAL'
  | 'RATE_LIMITED'
  | 'UNAUTHENTICATED'
  /** La sección existe, pero este gimnasio no la tiene encendida (ADR-036). */
  | 'MODULE_DISABLED'
  /** Consola de plataforma: la acción pide reconfirmar con la contraseña (no hay segundo factor desde el 2026-10-09). */
  | 'REAUTH_REQUIRED'
  /** Algo de lo que depende la operación no contesta (el motor facial): 503, se puede reintentar; no es culpa de lo que se mandó. */
  | 'UNAVAILABLE';

/**
 * CATÁLOGO DE `reason` (auditoría 8, 28-13; bloque 1.2).
 *
 * El `error` de una respuesta dice la FAMILIA (`CONFLICT`, `VALIDATION`…) y
 * decide el código HTTP; el `message` es para quien lo lee; el `reason` es el
 * porqué ESTABLE, para el programa que decide qué ofrecer: «Abre otro turno»
 * frente a «Ya se cobró», sin leer el texto. Reglas:
 *
 *  - una clave por causa que una pantalla, el torniquete o el procesador
 *    necesite distinguir; lo que solo se lee no lleva `reason`;
 *  - una clave publicada no cambia de nombre ni de sentido; el texto sí puede;
 *  - los porqués de un 401 de SESIÓN son otra lista (`SESSION_END_REASONS`,
 *    en `vocabulario`): el panel saca al login a quien reciba uno. Ninguna
 *    clave de aquí se repite allá (lo fija `test/errors.test.ts`).
 *
 * El valor de cada clave dice cuándo sale; no se le muestra a nadie.
 */
export const ERROR_REASONS = {
  // ── Generales ──
  RATE_LIMITED: 'Demasiados intentos: la respuesta trae `retryAfterSeconds` y `Retry-After`.',
  CONCURRENT_CHANGE: 'La base rechazó la operación porque ya existe o se hizo al mismo tiempo: recargar y revisar.',
  INVALID_STATE: 'La operación dejaría los datos en un estado que la base no permite.',
  VALUE_OUT_OF_RANGE: 'Un importe o una cantidad no cabe en su columna.',
  MONEY_OPERATION_IN_PROGRESS: 'Otra operación de dinero del mismo gimnasio tiene el candado: no se registró nada; reintentar en segundos.',
  // ── Caja ──
  NO_OPEN_REGISTER: 'No hay ningún turno de caja abierto en la sucursal del cobro.',
  MULTIPLE_OPEN_REGISTERS: 'Hay más de una caja abierta en la sucursal y el cobro no dijo en cuál.',
  CASH_SESSION_CLOSED: 'El turno de caja ya se cerró (el indicado, o se cortó mientras se cobraba).',
  REGISTER_ALREADY_OPEN: 'Esa caja ya tiene un turno abierto.',
  LAST_REGISTER: 'Es la única caja activa de la sucursal: no se retira.',
  // ── Cargos y pagos ──
  ALREADY_PAID: 'El cargo ya no tiene saldo: ya se cobró.',
  CHARGE_HAS_PAYMENTS: 'El cargo tiene pagos aplicados: primero se revierte el pago.',
  ALREADY_VOIDED: 'Ya estaba anulado (un cargo, una venta de tienda o un gasto).',
  ALREADY_REVERSED: 'El pago ya se revirtió o no se completó: no admite otra reversa ni reembolsos.',
  PAYMENT_HAS_REFUNDS: 'El pago ya tiene reembolsos: lo que queda se devuelve con otro reembolso.',
  // ── Membresías ──
  MEMBERSHIP_ALREADY_ACTIVE: 'El socio ya tiene una membresía vigente.',
  MEMBERSHIP_ALREADY_RENEWED: 'La membresía ya se renovó: su periodo cambió desde que se abrió la pantalla.',
  MEMBERSHIP_NOT_ACTIVE: 'La operación pide una membresía vigente y no lo está.',
  DEBT_PENDING: 'Debe su membresía: primero se cobra o se decide el adeudo.',
  PLAN_NOT_SOLD_AT_BRANCH: 'Ese plan no se vende en la sucursal elegida.',
  // ── Precios (bloque 3.6, D-19) ──
  PRICE_CHANGE_NEEDS_DECISION: 'El plan tiene socios que conservan su precio: el cambio de precio debe decir si también les cambia (`priceChange.includeProtected`).',
  PRICE_CHANGED_MEANWHILE: 'El precio del plan ya no es el que mostraba la pantalla: recargar y volver a revisar a quién toca.',
  // ── Pase del día (bloque 1.8) ──
  DAY_PASS_ALREADY_SOLD: 'Ya tiene su pase de hoy en esa sucursal.',
  DAY_PASS_MUST_BE_PAID: 'El pase del día se cobra al venderlo: falta la forma de pago.',
  SOLD_AS_DAY_PASS: 'La visita suelta ya no se vende como membresía: es un pase del día.',
  // ── Socios y personal ──
  COACH_HAS_MEMBERS: 'El coach que se da de baja tiene socios asignados: la baja debe decir a quién pasan (`coachHandover`).',
  DUPLICATE_MEMBER: 'El alta coincide con socios que ya existen: la respuesta trae `candidates`.',
  DUPLICATE_EMAIL: 'Ese correo ya tiene una cuenta.',
  // ── Captación (bloque 2.4) ──
  PHONE_IN_USE: 'Ese celular ya es el de otro socio: se puede compartir (D-09), pero hay que anotar quién es el responsable del número.',
  GUARDIAN_REQUIRED: 'El alta es de un menor de 15 a 17 años: se aprueba cuando su tutor firma en el mostrador (D-10).',
  PROSPECT_ALREADY_OPEN: 'Ya hay un interesado abierto con ese celular y ese nombre: la respuesta trae `existing`.',
  ALREADY_MEMBER: 'Esa persona ya es socio (mismo celular o correo, y nombre): la respuesta trae `existing`.',
  INTAKE_ALREADY_REVIEWED: 'Esa alta digital ya la revisó otra persona: la respuesta dice quién.',
  PROSPECT_CLOSED: 'El interesado ya está cerrado (se inscribió o se perdió).',
  // ── Puerta ──
  ALREADY_RESOLVED: 'Ese rechazo ya lo resolvió otra persona: no se registra otra entrada.',
  FACE_AUTHORIZATION_REQUIRED: 'No tiene su rostro registrado: esta entrada solo la autoriza la gerencia (D-06).',
  TRIAL_PASS_ALREADY_USED: 'Ese celular (o esa persona) ya usó su pase de prueba: es uno por persona (D-08).',
  TRIAL_PASS_NEEDS_PHONE: 'El pase de prueba se identifica por el celular: falta capturarlo en su ficha.',
  TRIAL_PASS_NOT_FIRST_TIME: 'El pase de prueba es para quien viene por primera vez: ya tiene o tuvo plan, paquete o pase del día.',
  FACE_ENGINE_DOWN: 'El motor facial no contesta, rechaza el token o no cargó su modelo (503): no es «no vi tu rostro».',
  // ── Clases ──
  CLASS_FULL: 'La clase se llenó.',
  // ── Consentimientos ──
  CONSENT_TEXT_MISSING: 'No hay texto publicado de ese consentimiento.',
  CONSENT_TEXT_CHANGED: 'El texto cambió mientras se leía: hay que abrir la versión vigente.',
  // ── Módulos y sucursales ──
  MODULE_NOT_CONTRACTED: 'El módulo (o uno que necesita) no está contratado.',
  MODULE_HAS_DEPENDENTS: 'Otro módulo encendido lo necesita.',
  MODULE_BLOCKED: 'Hay pendientes que resolver antes de apagar el módulo.',
  MODULE_OFF_IN_ORG: 'El módulo está apagado en todo el gimnasio: una sucursal no lo enciende sola.',
  BRANCH_HAS_STAFF: 'La sucursal todavía tiene personal asignado: no se cierra.',
  // ── Cierre de mes ──
  MONTH_ALREADY_CLOSED: 'Ese mes ya está cerrado.',
  // D-22 (bloque 3.7): las cifras de un mes cerrado quedan fijas.
  MONTH_CLOSED: 'El mes al que corresponde ya está cerrado: se anota en el mes en curso como ajuste de ese mes.',
  MONTH_HAS_OPEN_CASH: 'Queda una caja abierta con fecha de ese mes: no se cierra hasta cortarla.',
  // D-25 (bloque 3.7): el aviso de privacidad lo firma la dueña.
  NOTICE_SIGNATURE_STALE: 'El borrador cambió después de pedir la firma, o ya no hay una firma pedida.',
  // ── Consola de plataforma: cobro de GymFlow a las marcas (bloque 1.13) ──
  ORG_NOT_IN_USE: 'La marca no está en uso (sin liberar o suspendida): no se le factura.',
  MONTH_ALREADY_INVOICED: 'La marca ya tiene factura viva de ese mes: se anula antes de emitir otra.',
  PRICES_MISSING: 'Algo de lo que la marca tiene contratado no tiene precio: se fija en Precios.',
  MONTH_NOT_BILLABLE: 'Ese mes no se le factura a la marca: no ha empezado, es anterior a su liberación o su mensualidad es cero.',
  AMOUNT_OVER_BALANCE: 'El pago es mayor que lo que la factura todavía debe.',
  INVOICE_HAS_PAYMENTS: 'La factura tiene pagos registrados: primero se deshacen.',
  UNDO_WINDOW_CLOSED: 'Pasó el plazo para deshacer ese pago.',
  // ── Consola de plataforma: cambios de precio con un mes de aviso (D-38, bloque 3.11) ──
  PRICE_CHANGE_PENDING: 'Ese precio o ese plan ya tiene un cambio anunciado: se cancela antes de anunciar otro.',
  PRICE_CHANGE_TOO_SOON: 'Un cambio de precio o de plan se avisa con al menos un mes: la fecha pedida es anterior.',
  PRICE_CHANGE_CLOSED: 'Ese cambio anunciado ya aplicó o ya estaba cancelado.',
  // ── Firmas: el «no» pegado a la operación (D-03, bloque 3.2) ──
  APPROVAL_REPLY_REQUIRED: 'Esa operación ya se rechazó: para volver a pedirla hay que contestar ese «no» (`reply`).',
  APPROVAL_REJECTED_RECENTLY: 'Esa operación se rechazó hace menos de 30 minutos: no se firma en el mostrador, solo desde la sesión de quien firma.',
} as const;

export type ErrorReason = keyof typeof ERROR_REASONS;

/** ¿Es una clave del catálogo? (Los porqués de fin de sesión no lo son.) */
export function isErrorReason(x: unknown): x is ErrorReason {
  return typeof x === 'string' && Object.prototype.hasOwnProperty.call(ERROR_REASONS, x);
}

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly detail: string | undefined;
  readonly httpStatus: number;
  /**
   * El porqué estable (`ERROR_REASONS`, o `SESSION_END_REASONS` en un 401 de
   * sesión). `string` y no `ErrorReason`: el tipo estrecho lo ponen los
   * ayudantes de abajo; la clase también lleva los de sesión.
   */
  readonly reason: string | undefined;

  constructor(code: DomainErrorCode, message: string, detail?: string, reason?: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.detail = detail;
    this.reason = reason;
    this.httpStatus = HTTP_STATUS[code];
  }
}

const HTTP_STATUS: Record<DomainErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  // Un recurso de otro tenant devuelve 404, NUNCA 403: un 403 confirmaría
  // que el recurso existe, que es justo lo que no queremos revelar.
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION: 422,
  REQUIRE_APPROVAL: 428,
  REAUTH_REQUIRED: 403,
  RATE_LIMITED: 429,
  // 403 y no 404: el personal tiene que poder leer "este gimnasio no usa
  // Clases" en vez de creer que el enlace está roto.
  MODULE_DISABLED: 403,
  UNAVAILABLE: 503,
};

/** `what` es el mensaje completo para respetar la concordancia en español. */
export const notFound = (what = 'Recurso no encontrado') => new DomainError('NOT_FOUND', what);
export const forbidden = (detail?: string) => new DomainError('FORBIDDEN', 'Operación no permitida', detail);
/** `reason`: el porqué estable, cuando una pantalla necesita distinguir este choque de otro (28-13). */
export const conflict = (message: string, reason?: ErrorReason) => new DomainError('CONFLICT', message, undefined, reason);
export const validation = (message: string, detail?: string, reason?: ErrorReason) => new DomainError('VALIDATION', message, detail, reason);
/** 503: lo que la operación necesita no contesta. Siempre con su porqué. */
export const unavailable = (message: string, reason: ErrorReason) => new DomainError('UNAVAILABLE', message, undefined, reason);
/** Credencial ausente o inválida. Mensaje ÚNICO: distinguir "no existe" de
 *  "caducó" le diría a quien prueba códigos cuáles existen. */
export const unauthorized = (message = 'No autenticado') => new DomainError('UNAUTHENTICATED', message);
export const moduleDisabled = (name: string) => new DomainError('MODULE_DISABLED', `Este gimnasio no tiene activado ${name}`);
