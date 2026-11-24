import type { PermissionKey } from './permissions.js';
import { PERMISSIONS } from './permissions.js';
import type { RoleLimits } from './authorize.js';

/**
 * CATÁLOGO DE PUESTOS (ADR-039).
 *
 * Un puesto es un paquete de permisos con nombre, un texto que dice a qué se
 * dedica, los topes con los que nace en cada gimnasio y en qué alcance tiene
 * sentido. Es la ÚNICA fuente: de aquí salen los roles de sistema de la base
 * (`seed`), las cuentas que da la plataforma, el selector de Personal y el
 * texto "esta pantalla es para…" del panel. Antes había cuatro listas de
 * nombres a mano que ya no decían lo mismo.
 *
 * Cada puesto ve y hace lo que su trabajo exige y nada más (decisión del
 * dueño del producto, 2026-10-04). El gimnasio no edita permisos: elige
 * puestos.
 */
export type RoleDef = {
  readonly key: RoleKey;
  /** Como lo dice el gimnasio: "Encargado de sucursal", no "SUPERVISOR". */
  readonly name: string;
  /** A qué se dedica, en una frase. Sale en el selector y en la puerta del panel. */
  readonly description: string;
  /** Qué ve en el panel, resumido. */
  readonly sees: string;
  /** Dónde opera: toda la organización, una o varias sucursales, o cualquiera de las dos. */
  readonly scope: 'org' | 'branch' | 'any';
  /** Si la plataforma y la gerencia pueden dar cuentas con este puesto. */
  readonly assignable: boolean;
  readonly permissions: readonly PermissionKey[];
  /** Topes con los que nace el puesto en cada gimnasio; la gerencia los ajusta después. */
  readonly limits: RoleLimits;
};

/**
 * Cuatro puestos de gimnasio (decisión del 2026-10-05): Dueño, Gerente,
 * Recepción y Coach. Caja se unió a Recepción, Profesor a Coach, y el
 * encargado de sucursal es un Gerente acotado a sus sedes. Las claves
 * retiradas se mapean en `RETIRED_ROLES` para pasar a la gente que ya las tenía.
 */
export const ROLE_KEYS = ['SUPERADMIN', 'OWNER', 'MANAGER', 'RECEPTION', 'COACH'] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

const K = <T extends readonly PermissionKey[]>(...keys: T) => keys;
const SIN_DINERO: RoleLimits = {
  maxDiscountPercent: 0, maxWaiverAmountCents: 0n, maxManualBalanceAdjustCents: 0n, maxCashWithdrawalCents: 0n, maxRefundAmountCents: 0n,
  maxManualAccessGrantsPerShift: null, maxPosVoidsPerShift: null,
};
const SIN_TOPE: RoleLimits = {
  maxDiscountPercent: null, maxWaiverAmountCents: null, maxManualBalanceAdjustCents: null, maxCashWithdrawalCents: null, maxRefundAmountCents: null,
  maxManualAccessGrantsPerShift: null, maxPosVoidsPerShift: null,
};

/** Lo que atiende el mostrador: entradas, altas, cobros, su turno de caja. */
const MOSTRADOR = K(
  'catalog:read',
  'members:read', 'members:create', 'members:consent:read', 'members:portal:invite',
  // Los recordatorios por WhatsApp los manda recepción con un toque desde una lista (D-34).
  'members:message:send',
  // El socio pide corregir o borrar algo en el mostrador: recepción lo registra para que corra el plazo (21-04).
  'members:privacy:request',
  'members:intake:read', 'members:intake:review',
  'memberships:create', 'memberships:visitpack:manage',
  // Cobrar incluye emitir el cargo del catálogo que se cobra (sin descuento).
  'billing:statement:read', 'billing:charge:create',
  'payments:record',
  'cash:session:open', 'cash:session:close', 'cash:session:read',
  // D-15 (bloque 3.5): anota fondo y gasto chico sin firma hasta el tope del gimnasio, y retira
  // o deposita con la firma de la dueña hasta su tope por turno.
  'cash:petty:record', 'cash:withdraw',
  'pos:sale:create',
  'access:monitor', 'access:manual_grant', 'access:credential:manage',
  'access:biometric:enroll', 'access:attendance:read',
  'classes:read', 'classes:book_for_member',
  // Ver e imprimir la rutina del socio, sin cambiarla (12-17).
  'training:read',
  // Retención (si el dueño se la libera): ver a quién llamar y anotar que se le llamó.
  'reports:branch:read', 'retention:followup:write',
);

export const ROLES: readonly RoleDef[] = [
  /**
   * SUPERADMIN es quien opera la PLATAFORMA. Deliberadamente NO puede registrar
   * pagos ni tocar caja: separa "puedo arreglar el sistema" de "puedo mover
   * dinero del cliente", que es la separación que buscaría una auditoría.
   *
   * Sin permisos de gimnasio (28-17): nunca entra como personal de nadie (no
   * tiene `ctx`), así que `members:read`, `audit:read`… solo hacían que la
   * matriz de puestos le mostrara un acceso a socios que no tiene.
   */
  {
    key: 'SUPERADMIN', name: 'Plataforma', description: 'Opera GymFlow: da de alta gimnasios, libera el software, contrata módulos y cobra.',
    sees: 'La consola de la plataforma; ningún panel de gimnasio.', scope: 'org', assignable: false,
    permissions: K('platform:organizations:manage'),
    limits: SIN_DINERO,
  },
  /**
   * La DUEÑA ve lo ADMINISTRATIVO y no opera nada (decisión del 2026-10-04):
   * cuánto entra y cuánto sale, qué hace su personal, a qué hora abre y
   * cierra cada sede y quién entra. No ve expedientes de socios ni listas de
   * clases: eso es operación. Solo permisos de LECTURA; no da segundas firmas.
   */
  {
    key: 'OWNER', name: 'Dueño', description: 'Consulta el dinero y a su equipo desde el teléfono, y da la segunda firma a lo que pide el gerente. No opera.',
    sees: 'Inicio con el pulso del día, Tablero, Movimientos, Personal, Cortes de caja, Autorizaciones, Planes, Bitácora, y Sucursales y Módulos para consultar.', scope: 'org', assignable: true,
    permissions: K(
      'reports:financial:read', 'billing:portfolio:read', 'payments:reconciliation:read',
      'cash:session:read',
      // Quién entra y a qué hora: es el flujo de su gimnasio, no el expediente de nadie.
      'access:attendance:read',
      'catalog:read', 'staff:read',
      'audit:read', 'audit:export',
      // La segunda firma: aprueba lo que otro pide, sin poder hacerlo él.
      'approvals:grant',
      // La llave de Dirección y Cumplimiento: él decide quién de su equipo las ve.
      'staff:unlock',
      // Y el rescate de su gerente cuando este olvidó la contraseña o se fue (DP-02).
      'staff:rescue',
      // Lee los textos legales completos y firma el aviso de privacidad (D-25).
      'settings:consent:read',
    ),
    limits: SIN_TOPE,
  },
  /**
   * El GERENTE opera y configura todo el gimnasio: socios, planes, cobros,
   * caja, personal, sucursales y módulos. SIEMPRE abarca todo el gimnasio
   * (decisión del 2026-10-06): el "gerente de sucursal" acotado a unas sedes
   * se juntó con éste porque no tenía un uso real distinto. Quien atiende
   * una sola sede es Recepción de esa sede.
   */
  {
    key: 'MANAGER', name: 'Gerente', description: 'Opera y configura todo el gimnasio, en todas sus sucursales, y da de alta al personal. Lo que exige segunda firma lo aprueba el dueño.',
    sees: 'Todo el panel, de todas las sucursales.', scope: 'org', assignable: true,
    // Todo menos la segunda firma: nadie aprueba lo suyo ni lo de su par (2026-10-05).
    permissions: K(...PERMISSIONS.map((perm) => perm.key).filter((key) => key !== 'approvals:grant' && key !== 'approvals:proxy' && key !== 'staff:unlock' && key !== 'staff:rescue' && !key.startsWith('platform:'))),
    limits: { ...SIN_TOPE, maxDiscountPercent: 30, maxManualAccessGrantsPerShift: 25, maxPosVoidsPerShift: 10 },
  },
  /**
   * RECEPCIÓN atiende y consulta; NO modifica (decisión del 2026-10-02):
   * registra entradas, inscribe, cobra, abre y cierra su turno, vende en
   * mostrador y entrega el código del portal.
   */
  {
    key: 'RECEPTION', name: 'Recepción', description: 'Atiende el mostrador: entradas, inscripciones, cobros, caja y punto de venta. No modifica lo ya hecho.',
    sees: 'Recepción, Socios, Caja, Punto de venta, Altas digitales, Clases.', scope: 'branch', assignable: true,
    permissions: MOSTRADOR,
    limits: { ...SIN_DINERO, maxDiscountPercent: 10, maxCashWithdrawalCents: 500_000n, maxManualAccessGrantsPerShift: 10, maxPosVoidsPerShift: 3 },
  },
  /**
   * El COACH entrena (2026-10-09): Rutinas, Clases de su sucursal y SOLO los
   * socios que tiene asignados (en la ficha del socio, o porque les asignó su
   * rutina vigente). Sin socios asignados, ve Rutinas y Clases.
   */
  {
    key: 'COACH', name: 'Coach', description: 'Da clases y entrena: pase de lista, horario y las rutinas de sus socios asignados.',
    sees: 'Rutinas, Clases y la ficha de entrenamiento de sus socios asignados.', scope: 'any', assignable: true,
    permissions: K(
      'catalog:read',
      'members:read', 'members:health:read',
      // D-29: se suma a un socio sin coach con el código que el socio le dicta.
      'members:coach:claim',
      // D-28: opera SUS clases (lista, inscribir a sus socios, suplente y cupo). No arma el
      // horario (`classes:manage` se le da por persona) y no cancela ninguna clase.
      'classes:read', 'classes:session:operate', 'classes:book_for_member',
      'training:template:manage', 'training:assign', ),
    limits: SIN_DINERO,
  },
];

export const ROLE_BY_KEY: ReadonlyMap<string, RoleDef> = new Map(ROLES.map((r) => [r.key, r]));

/**
 * Puestos que existieron y se retiraron el 2026-10-05: quien los tenga pasa al
 * puesto que lo absorbe (el `seed` lo hace con cada base).
 */
export const RETIRED_ROLES: Readonly<Record<string, RoleKey>> = {
  SUPERVISOR: 'MANAGER', CASHIER: 'RECEPTION', INSTRUCTOR: 'COACH',
};

/** Puestos que un gimnasio puede dar (todos menos la plataforma). */
export const ASSIGNABLE_ROLES: readonly RoleDef[] = ROLES.filter((r) => r.assignable);


/** Paquetes de permisos por puesto. Se conserva por compatibilidad: el catálogo es `ROLES`. */
export const ROLE_PERMISSIONS: Readonly<Record<RoleKey, readonly PermissionKey[]>> =
  Object.fromEntries(ROLES.map((r) => [r.key, r.permissions])) as Record<RoleKey, readonly PermissionKey[]>;

export function isRoleKey(key: string): key is RoleKey {
  return ROLE_BY_KEY.has(key);
}
