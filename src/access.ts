import { grantsAccess, type MembershipStatus, type VisitPackStatus } from './membership.js';
import { AVISO_PASE_DEL_DIA } from './vocabulario.js';

/**
 * Motor de políticas de acceso (§21, ADR-015).
 *
 * Es PURO y DETERMINISTA por obligación, no por elegancia: esta misma función
 * corre en la nube y dentro del gateway de la sucursal, y las dos tienen que
 * decidir igual. Si consultara una base de datos o mirara el reloj del
 * sistema, esa garantía sería imposible de sostener.
 *
 * De ahí que `at` venga por parámetro y que la versión sea explícita: con dos
 * desplegables independientes, una divergencia de versión rompe la promesa
 * EN SILENCIO —la puerta decide una cosa y el servidor cree otra— y el
 * handshake del heartbeat existe para detectarlo antes de que ocurra.
 */

/**
 * Versión de la política. Se incrementa cuando cambia una REGLA, no cuando se
 * refactoriza. El gateway la reporta en cada latido y la nube la compara.
 *
 * `2.0.0` — un socio en mora ya NO entra por defecto. Es un cambio de regla
 * MAYOR: un gateway que siga en `1.x` dejaría pasar a quien esta versión
 * rechaza, y el handshake lo marca como incidente. Justamente para eso existe.
 *
 * `3.0.0` — un paquete de visitas **sin pagar** ya no abre la puerta. También
 * es MAYOR y por el mismo motivo: un gateway en `2.x` sigue abriendo con un
 * paquete vendido a cuenta que nadie liquidó, y además descuenta la visita.
 *
 * `3.2.0` — el PASE DEL DÍA (auditoría 8, 4-01): quien no tiene membresía que
 * lo habilite pero pagó su pase de hoy entra en la sede del pase. Es MENOR:
 * no cierra nada que antes abriera; un gateway en `3.1` solo deja de reconocer
 * el pase (lo rechaza y recepción lo deja pasar).
 */
export const ACCESS_POLICY_VERSION = '3.2.0';

export type AccessOutcome = 'GRANTED' | 'DENIED';

/**
 * Motivos de denegación.
 *
 * Son específicos a propósito: la pantalla de excepción del Sprint 9 tiene que
 * convertir un rechazo en una transacción, y para eso necesita saber si el
 * socio debe dinero, si se equivocó de sucursal o si su credencial fue
 * revocada. Un único `DENIED` dejaría a recepción adivinando.
 */
export type DenialReason =
  | 'MEMBER_UNKNOWN'
  | 'MEMBER_ARCHIVED'
  | 'NO_MEMBERSHIP'
  | 'MEMBERSHIP_PAST_DUE'
  | 'MEMBERSHIP_FROZEN'
  | 'MEMBERSHIP_SUSPENDED'
  | 'MEMBERSHIP_ENDED'
  | 'BRANCH_NOT_ALLOWED'
  | 'OUTSIDE_TIME_WINDOW'
  | 'NO_VISITS_LEFT'
  | 'VISIT_PACK_EXPIRED'
  | 'VISIT_PACK_UNPAID'
  | 'CREDENTIAL_REVOKED'
  | 'CREDENTIAL_EXPIRED'
  | 'DUPLICATE_SCAN';

export type CredentialKind = 'QR' | 'RFID' | 'PIN' | 'FINGERPRINT' | 'FACE' | 'MANUAL';

export type BranchAccessScope = 'HOME_BRANCH' | 'LISTED_BRANCHES' | 'ALL_BRANCHES';

/** Ventana horaria de acceso. `weekday` 0 = domingo, como `Date.getUTCDay()`. */
export type TimeWindow = {
  readonly weekday: number;
  /** Minutos desde medianoche, en la zona de la SUCURSAL. */
  readonly fromMinute: number;
  readonly toMinute: number;
};

export type AccessSubject = {
  readonly memberId: string;
  /** `true` si el socio está archivado o dado de baja. */
  readonly archived: boolean;
  readonly membership: {
    readonly status: MembershipStatus;
    readonly homeBranchId: string | null;
    readonly branchAccessScope: BranchAccessScope;
    readonly allowedBranchIds: readonly string[];
    readonly accessTimeWindows: readonly TimeWindow[] | null;
  } | null;
  readonly visitPack: {
    readonly packId: string;
    readonly balance: number;
    readonly expired: boolean;
    /**
     * Estado del paquete. **No es decorativo.**
     *
     * Faltaba, y sin él la puerta abría con un paquete vendido a cuenta que
     * nadie había liquidado — y encima el libro descontaba la visita. El
     * dominio ya tenía la regla bien puesta en `canConsumeVisit`, que sí
     * exige `ACTIVE`; aquí había una segunda implementación de la misma regla
     * y era ciega.
     */
    readonly status: VisitPackStatus;
  } | null;
  /**
   * CLASE SUELTA PAGADA (2026-10-09): quien no tiene plan pero pagó su clase
   * de hoy entra a esa clase, en su sucursal, desde una hora antes de que
   * empiece hasta que termina. La ventana la calcula quien arma el sujeto.
   */
  readonly classPass?: { readonly branchId: string; readonly className: string } | null;
  /**
   * PASE DEL DÍA PAGADO (4-01): la visita suelta ya no es una membresía de un
   * día. Es un cargo pagado que vale por el día de operación de UNA sede: la
   * sede donde se vendió. Quien arma el sujeto solo lo pone si el pase es de
   * hoy y está pagado; aquí se comprueba la sede.
   */
  readonly dayPass?: { readonly branchId: string } | null;
};


/**
 * Política del gimnasio, no del código.
 *
 * Es configuración por organización porque GymFlow es multi-inquilino: un
 * gimnasio puede querer cerrar la puerta al primer día de mora y otro dar
 * margen. Fijarlo en el código obligaría a un despliegue para cambiar una
 * regla de negocio, y a una bifurcación el día que dos clientes discrepen.
 */
export type AccessSettings = {
  /**
   * ¿Entra un socio en mora (`PAST_DUE`)?
   *
   * Por defecto **NO**: el torniquete es el punto donde la mora se vuelve
   * visible y cobrable. Recepción sigue pudiendo darle paso a mano, con
   * nombre y motivo (principio 8 de la visión): la puerta no decide, informa.
   */
  readonly allowAccessWhilePastDue: boolean;
};

export const DEFAULT_ACCESS_SETTINGS: AccessSettings = {
  allowAccessWhilePastDue: false,
};

export type AccessRequest = {
  /** Instante de la decisión. NUNCA se toma del reloj interno. */
  readonly at: Date;
  /** Minuto del día en la zona de la SUCURSAL, ya resuelto por quien llama. */
  readonly localMinuteOfDay: number;
  readonly localWeekday: number;
  readonly branchId: string;
  readonly credential: {
    readonly kind: CredentialKind;
    readonly revoked: boolean;
    readonly expiresAt: Date | null;
    /** El mismo código ya se usó en la ventana anti-replay. */
    readonly alreadyUsed: boolean;
  };
  readonly subject: AccessSubject | null;
  /** Omitido = política por defecto. */
  readonly settings?: AccessSettings;
};

export type AccessDecision = {
  readonly outcome: AccessOutcome;
  readonly reason: DenialReason | null;
  /** Se consume una visita del paquete. Lo ejecuta quien llama, no esto. */
  readonly consumesVisit: boolean;
  /** Entra, pero hay que decírselo: mora, paquete casi agotado, etc. */
  readonly warning: string | null;
  /**
   * Recepción PUEDE dar el paso pese al rechazo, con nombre y motivo.
   *
   * No todos los rechazos son iguales: una deuda se resuelve en el mostrador,
   * una credencial revocada no. Marcarlo aquí evita que la pantalla de
   * excepción ofrezca un botón que no debería existir.
   */
  readonly overridable: boolean;
  readonly policyVersion: string;
  readonly evaluatedAt: Date;
};

/**
 * Rechazos que RECEPCIÓN puede levantar a mano.
 *
 * Se resuelven en el mostrador: el socio paga, se le explica el plan que sí
 * cubre esa sede, o se le deja pasar por hoy con el motivo registrado. Los que
 * no están aquí —credencial revocada, socio dado de baja— no son un trámite
 * de mostrador y ofrecer un botón para saltárselos sería un agujero.
 */
const RECHAZOS_LEVANTABLES: ReadonlySet<DenialReason> = new Set([
  'MEMBERSHIP_PAST_DUE',
  'MEMBERSHIP_FROZEN',
  'BRANCH_NOT_ALLOWED',
  'OUTSIDE_TIME_WINDOW',
  'NO_VISITS_LEFT',
  'VISIT_PACK_EXPIRED',
  // Un paquete sin pagar es EXACTAMENTE el caso que la pantalla de excepción
  // existe para resolver: el socio está delante, debe el paquete, y ahí se
  // cobra. Negarlo sin opción lo manda a discutir a la puerta.
  'VISIT_PACK_UNPAID',
  'MEMBERSHIP_SUSPENDED',
]);

export function isOverridable(reason: DenialReason): boolean {
  return RECHAZOS_LEVANTABLES.has(reason);
}

function denegar(reason: DenialReason, at: Date): AccessDecision {
  return {
    outcome: 'DENIED', reason, consumesVisit: false, warning: null,
    overridable: isOverridable(reason),
    policyVersion: ACCESS_POLICY_VERSION, evaluatedAt: at,
  };
}

function permitir(at: Date, opts: { consumesVisit?: boolean; warning?: string } = {}): AccessDecision {
  return {
    outcome: 'GRANTED',
    reason: null,
    consumesVisit: opts.consumesVisit ?? false,
    warning: opts.warning ?? null,
    overridable: false,
    policyVersion: ACCESS_POLICY_VERSION,
    evaluatedAt: at,
  };
}

/** ¿Esta membresía habilita ESTA sucursal? */
export function branchAllowed(
  membership: NonNullable<AccessSubject['membership']>,
  branchId: string,
): boolean {
  switch (membership.branchAccessScope) {
    case 'ALL_BRANCHES':
      return true;
    case 'HOME_BRANCH':
      return membership.homeBranchId === branchId;
    case 'LISTED_BRANCHES':
      return membership.allowedBranchIds.includes(branchId);
    default:
      return false;
  }
}

/**
 * ¿El momento cae dentro de alguna ventana?
 *
 * Sin ventanas declaradas se entiende SIN restricción horaria. Interpretar la
 * ausencia como "nunca" dejaría fuera a todo el padrón el día que alguien
 * añada la columna sin rellenarla.
 */
export function withinTimeWindow(
  windows: readonly TimeWindow[] | null,
  weekday: number,
  minuteOfDay: number,
): boolean {
  if (windows === null || windows.length === 0) return true;
  return windows.some(
    (w) => w.weekday === weekday && minuteOfDay >= w.fromMinute && minuteOfDay < w.toMinute,
  );
}

/**
 * LA decisión. El orden de las comprobaciones importa y es deliberado:
 *
 *  1. Credencial — es lo más barato y lo más urgente: una credencial revocada
 *     no debe llegar siquiera a consultar el estado del socio.
 *  2. Socio — un socio archivado no entra aunque su membresía figure activa.
 *     Este caso NO es teórico: al ejecutar la plataforma encontramos 15,073
 *     membresías vivas de socios archivados. Sin esta regla, todas abrirían
 *     la puerta.
 *  3. Membresía — estado, sucursal, horario.
 *  4. Paquete de visitas — solo si no hay membresía que ya habilite.
 */
export function evaluateAccess(request: AccessRequest): AccessDecision {
  const { at, credential, subject } = request;
  const settings = request.settings ?? DEFAULT_ACCESS_SETTINGS;

  // ── 1. Credencial ─────────────────────────────────────────────────────────
  if (credential.revoked) return denegar('CREDENTIAL_REVOKED', at);
  if (credential.expiresAt !== null && credential.expiresAt.getTime() <= at.getTime()) {
    return denegar('CREDENTIAL_EXPIRED', at);
  }
  if (credential.alreadyUsed) return denegar('DUPLICATE_SCAN', at);

  // ── 2. Socio ──────────────────────────────────────────────────────────────
  if (subject === null) return denegar('MEMBER_UNKNOWN', at);
  if (subject.archived) return denegar('MEMBER_ARCHIVED', at);

  // ── 3. Membresía ──────────────────────────────────────────────────────────
  const m = subject.membership;
  if (m !== null && grantsAccess(m.status)) {
    /**
     * MORA: por defecto NO entra.
     *
     * El torniquete es el único punto donde el gimnasio ve al socio moroso sin
     * buscarlo, y cerrarlo ahí convierte la deuda en cobro. El rechazo es
     * LEVANTABLE: recepción puede darle paso con nombre y motivo, que es lo
     * que el principio 8 de la visión exige —visibilidad, no prohibición— y
     * lo que impide que el personal invente un atajo por fuera del sistema.
     *
     * Configurable por organización: es política del gimnasio, no del código.
     */
    if (m.status === 'PAST_DUE' && !settings.allowAccessWhilePastDue) {
      return denegar('MEMBERSHIP_PAST_DUE', at);
    }
    if (!branchAllowed(m, request.branchId)) return denegar('BRANCH_NOT_ALLOWED', at);
    if (!withinTimeWindow(m.accessTimeWindows, request.localWeekday, request.localMinuteOfDay)) {
      return denegar('OUTSIDE_TIME_WINDOW', at);
    }
    return permitir(at, m.status === 'PAST_DUE'
      ? { warning: 'Tiene un pago pendiente. Pásese por recepción' }
      : {});
  }

  // ── 3b. Clase suelta pagada ───────────────────────────────────────────────
  // Solo para entrar a esa clase, en su sucursal. No consume visitas.
  const pase = subject.classPass;
  if (pase && pase.branchId === request.branchId) {
    return permitir(at, { warning: `Entra a su clase suelta: ${pase.className}` });
  }

  // ── 3c. Pase del día pagado ───────────────────────────────────────────────
  // Solo en la sede donde se vendió y solo ese día. No consume visitas: va
  // antes que el paquete para que quien pagó su pase de hoy no gaste una.
  const paseDelDia = subject.dayPass;
  if (paseDelDia && paseDelDia.branchId === request.branchId) {
    return permitir(at, { warning: AVISO_PASE_DEL_DIA });
  }

  // ── 4. Paquete de visitas ─────────────────────────────────────────────────
  const pack = subject.visitPack;
  if (pack !== null) {
    // Lo PRIMERO: un paquete que nadie pagó no abre nada. Iba después de las
    // otras dos comprobaciones y, de hecho, no estaba: el estado ni siquiera
    // llegaba hasta aquí.
    if (pack.status === 'PENDING_PAYMENT') return denegar('VISIT_PACK_UNPAID', at);
    if (pack.status === 'FROZEN') return denegar('MEMBERSHIP_FROZEN', at);
    if (pack.expired || pack.status === 'EXPIRED') return denegar('VISIT_PACK_EXPIRED', at);
    if (pack.balance <= 0 || pack.status === 'EXHAUSTED') return denegar('NO_VISITS_LEFT', at);
    return permitir(at, {
      consumesVisit: true,
      ...(pack.balance === 1 ? { warning: 'Es su última visita del paquete' } : {}),
    });
  }

  // ── Sin nada que habilite ─────────────────────────────────────────────────
  if (m === null) return denegar('NO_MEMBERSHIP', at);
  switch (m.status) {
    case 'FROZEN': return denegar('MEMBERSHIP_FROZEN', at);
    case 'SUSPENDED': return denegar('MEMBERSHIP_SUSPENDED', at);
    default: return denegar('MEMBERSHIP_ENDED', at);
  }
}

/**
 * Comparación de versiones entre la nube y un gateway.
 *
 * En un monorepo esto no hacía falta: un import, una versión. Con dos
 * desplegables independientes, una divergencia produce decisiones distintas
 * ante los mismos datos, y lo hace sin error ni aviso. Por eso se compara
 * explícitamente y el resultado es visible en el monitor.
 */
export type PolicyVersionCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly severity: 'WARN' | 'BLOCK'; readonly detail: string };

export function checkPolicyVersion(gatewayVersion: string, cloudVersion = ACCESS_POLICY_VERSION): PolicyVersionCheck {
  if (gatewayVersion === cloudVersion) return { ok: true };

  const [gMajor = '', gMinor = ''] = gatewayVersion.split('.');
  const [cMajor = '', cMinor = ''] = cloudVersion.split('.');

  // Cambio MAYOR: las reglas no son las mismas. Es un incidente operativo.
  if (gMajor !== cMajor) {
    return {
      ok: false,
      severity: 'BLOCK',
      detail: `El gateway ejecuta la política ${gatewayVersion} y la nube la ${cloudVersion}. ` +
        'Las reglas difieren: la puerta puede estar decidiendo distinto que el servidor',
    };
  }
  // Cambio MENOR: reglas compatibles, pero hay que actualizar.
  return {
    ok: false,
    severity: gMinor !== cMinor ? 'WARN' : 'WARN',
    detail: `El gateway ejecuta la política ${gatewayVersion}, la nube la ${cloudVersion}. ` +
      'Compatible, pero conviene actualizar',
  };
}
