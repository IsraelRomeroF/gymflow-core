import { ROLE_PERMISSIONS } from './roles.js';

/**
 * SECCIONES BAJO LLAVE DEL DUEÑO (decisión del 2026-10-06).
 *
 * Las pantallas de Dirección y Cumplimiento no las ve el gerente ni la
 * recepción por su puesto: el dueño se las libera, una por una, a cada
 * persona. Lo que se libera queda en el expediente de la persona
 * (`users.unlockedSections`) y en la bitácora.
 *
 * Cada sección dice qué permisos pierde quien no la tiene liberada. Un
 * permiso que comparten dos secciones (p. ej. los reportes financieros, de
 * Tablero y Movimientos) se pierde solo si las DOS están cerradas.
 */
export type SeccionLiberable = {
  key: string;
  name: string;
  group: 'operacion' | 'direccion' | 'cumplimiento';
  /** En una frase, para el dueño que decide. */
  text: string;
  /** Lo que la API deja de permitir mientras la sección esté cerrada. */
  permissions: readonly string[];
  /**
   * Abierta por el puesto (Caja, Punto de venta): el dueño la QUITA a una
   * persona en vez de liberarla. Se guarda como `-clave` en `unlockedSections`,
   * así nadie pierde la caja por una lista vieja (decisión del 2026-10-07).
   */
  defaultOpen?: boolean;
  /**
   * Lo que hace aparecer su pantalla en el menú del panel: basta con alguno
   * (el `permisos` de `modules/registro.ts`, que su prueba compara con esto).
   * Si el puesto no trae ninguno, la llave de esta sección no le cambia nada.
   */
  menuPermissions: readonly string[];
  /** Puestos que ven la pantalla aunque no tengan el permiso (la dueña consulta Sucursales y Módulos, D-23/D-25). */
  menuRoles?: readonly string[];
};

export const LOCKABLE_SECTIONS: readonly SeccionLiberable[] = [
  // Operación: viene con el puesto; el dueño la puede quitar persona por persona.
  { key: 'caja', name: 'Caja', group: 'operacion', defaultOpen: true, text: 'Abrir y cerrar turnos, retiros y el corte.', permissions: ['cash:session:open', 'cash:session:close', 'cash:session:read', 'cash:withdraw', 'cash:petty:record', 'cash:limits:set', 'cash:variance:approve'], menuPermissions: ['cash:session:read'] },
  { key: 'pos', name: 'Punto de venta', group: 'operacion', defaultOpen: true, text: 'Vender producto en mostrador y anular ventas.', permissions: ['pos:sale:create', 'pos:sale:void', 'pos:sale:return'], menuPermissions: ['pos:sale:create'] },
  { key: 'tablero', name: 'Tablero', group: 'direccion', text: 'Cuánto entra, cuánto se gana y la cartera, por sucursal.', permissions: ['reports:financial:read', 'reports:month:close', 'billing:portfolio:read', 'payments:reconciliation:read', 'payments:reconciliation:resolve'], menuPermissions: ['reports:financial:read'] },
  { key: 'movimientos', name: 'Movimientos', group: 'direccion', text: 'Entradas y salidas de dinero por día, y los gastos fijos.', permissions: ['reports:financial:read', 'expenses:manage'], menuPermissions: ['reports:financial:read'] },
  { key: 'retencion', name: 'Retención', group: 'direccion', text: 'A quién llamar antes de que deje de venir.', permissions: ['reports:branch:read', 'retention:followup:write'], menuPermissions: ['reports:branch:read'] },
  { key: 'planes', name: 'Planes', group: 'direccion', text: 'Crear y cambiar planes y precios.', permissions: ['catalog:manage'], menuPermissions: ['catalog:read'] },
  { key: 'productos', name: 'Productos', group: 'direccion', text: 'Catálogo e inventario de la tienda.', permissions: ['pos:product:manage', 'pos:inventory:adjust'], menuPermissions: ['pos:product:manage'] },
  { key: 'personal', name: 'Personal', group: 'direccion', text: 'Dar de alta, cambiar y dar de baja al personal.', permissions: ['staff:read', 'staff:manage'], menuPermissions: ['staff:read'] },
  { key: 'importar', name: 'Importar socios', group: 'direccion', text: 'Cargar la base de socios de otro sistema.', permissions: ['members:import'], menuPermissions: ['members:import'] },
  { key: 'sucursales', name: 'Sucursales', group: 'direccion', text: 'Abrir sucursales, sus cajas y sus equipos.', permissions: ['settings:branch', 'settings:org', 'access:device:manage'], menuPermissions: ['settings:branch'], menuRoles: ['OWNER'] },
  { key: 'modulos', name: 'Módulos', group: 'direccion', text: 'Encender y apagar secciones del gimnasio.', permissions: ['settings:org', 'settings:branch'], menuPermissions: ['settings:org', 'settings:branch'], menuRoles: ['OWNER'] },
  { key: 'bitacora', name: 'Bitácora', group: 'cumplimiento', text: 'Quién hizo qué, con fecha y motivo.', permissions: ['audit:read', 'audit:export'], menuPermissions: ['audit:read'] },
  { key: 'biometria', name: 'Biometría', group: 'cumplimiento', text: 'Enrolamientos de rostro y huella y sus borrados.', permissions: ['audit:read'], menuPermissions: ['audit:read'] },
  { key: 'consentimientos', name: 'Textos de consentimiento', group: 'cumplimiento', text: 'Publicar el aviso de privacidad y el reglamento.', permissions: ['settings:consent:manage'], menuPermissions: ['members:consent:read', 'settings:consent:read'] },
];

export const LOCKABLE_SECTION_KEYS: ReadonlySet<string> = new Set(LOCKABLE_SECTIONS.map((s) => s.key));

/** Lo que una lista guardada puede contener: `clave` para liberar, `-clave` para quitar lo que viene por puesto. */
export function isSectionToken(token: string): boolean {
  const s = LOCKABLE_SECTIONS.find((x) => x.key === token.replace(/^-/, ''));
  if (!s) return false;
  return s.defaultOpen ? token.startsWith('-') : !token.startsWith('-');
}

/** ¿Esta persona tiene la sección? Abierta por puesto salvo `-clave`; cerrada salvo `clave`. */
export function isSectionOpen(key: string, unlocked: readonly string[]): boolean {
  const s = LOCKABLE_SECTIONS.find((x) => x.key === key);
  if (!s) return true;
  return s.defaultOpen ? !unlocked.includes(`-${key}`) : unlocked.includes(key);
}

/** El dueño no tiene llave: su puesto ya es el de ver todo. */
export const UNLOCK_EXEMPT_ROLES: ReadonlySet<string> = new Set(['OWNER', 'SUPERADMIN']);

/**
 * Qué permisos pierde una persona según las secciones que tiene liberadas.
 * El dueño está exento de SU propia llave; solo lo limita la plataforma
 * (`platformSections`, 2026-10-09): null = ve todo.
 */
export function lockedPermissions(unlocked: readonly string[], roleKeys: readonly string[], platformSections: readonly string[] | null = null): ReadonlySet<string> {
  if (roleKeys.some((r) => UNLOCK_EXEMPT_ROLES.has(r))) {
    if (!platformSections) return new Set();
    unlocked = platformSections;
  }
  const conservar = new Set<string>();
  const candidatos = new Set<string>();
  for (const s of LOCKABLE_SECTIONS) {
    for (const p of s.permissions) {
      candidatos.add(p);
      if (isSectionOpen(s.key, unlocked)) conservar.add(p);
    }
  }
  return new Set([...candidatos].filter((p) => !conservar.has(p)));
}

/** Limpia una lista venida de fuera: solo claves conocidas, sin repetir. */
export function normalizeUnlocked(input: readonly string[]): string[] {
  return [...new Set(input.filter(isSectionToken))];
}

// ── Para la pantalla de la llave (panel y consola de plataforma) ────────────
// Antes el panel copiaba la lista con otros textos (17-14) y su propia
// `LLAVES_ABIERTAS` (27-02): al agregar una sección aquí, el panel la ignoraba
// en silencio. Ahora lee estas.

/** El nombre de cada grupo de secciones, como lo lee el dueño. */
export const SECTION_GROUP_NAMES: Readonly<Record<SeccionLiberable['group'], string>> = {
  operacion: 'Operación',
  direccion: 'Dirección',
  cumplimiento: 'Cumplimiento',
};

/** Las secciones que vienen abiertas con el puesto (Caja, Punto de venta): el dueño las QUITA (`-clave`). */
export const OPEN_BY_ROLE_SECTIONS: ReadonlySet<string> = new Set(LOCKABLE_SECTIONS.filter((s) => s.defaultOpen).map((s) => s.key));

/** La lista con la que una persona ve todo: cada sección de Dirección y Cumplimiento liberada, nada quitado. */
export const ALL_SECTIONS_UNLOCKED: readonly string[] = LOCKABLE_SECTIONS.filter((s) => !s.defaultOpen).map((s) => s.key);

/**
 * Abre o cierra UNA sección en una lista guardada y devuelve la lista nueva
 * (sin repetir). Las abiertas por puesto se cierran con `-clave`; las demás
 * se abren con `clave`. Una clave que no es de la llave no cambia la lista.
 */
export function setSectionOpen(key: string, unlocked: readonly string[], open: boolean): string[] {
  const s = LOCKABLE_SECTIONS.find((x) => x.key === key);
  if (!s) return [...unlocked];
  const sin = unlocked.filter((k) => k !== key && k !== `-${key}`);
  if (s.defaultOpen) return open ? sin : [...sin, `-${key}`];
  return open ? [...sin, key] : sin;
}

/**
 * LAS SECCIONES CON EFECTO PARA UN PUESTO (17-05). La llave solo quita: abrirle
 * Tablero a una recepcionista no le daba nada, porque su puesto no trae esa
 * pantalla. Son las que su puesto vería sin la llave: alguno de sus
 * `menuPermissions` o el puesto en `menuRoles`. En el orden de la lista.
 */
export function effectiveSections(roleKey: string): string[] {
  const permisos: ReadonlySet<string> = new Set((ROLE_PERMISSIONS as Readonly<Record<string, readonly string[]>>)[roleKey] ?? []);
  return LOCKABLE_SECTIONS
    .filter((s) => s.menuPermissions.some((p) => permisos.has(p)) || (s.menuRoles ?? []).includes(roleKey))
    .map((s) => s.key);
}

/**
 * Lo que vale guardar de una lista para ese puesto: claves conocidas, sin
 * repetir y solo de secciones con efecto (lo demás no hace nada y no se
 * guarda). Es la regla que debe aplicar la API al guardar la llave.
 */
export function onlyEffectiveSections(tokens: readonly string[], roleKey: string): string[] {
  const efecto = new Set(effectiveSections(roleKey));
  return normalizeUnlocked(tokens).filter((t) => efecto.has(t.replace(/^-/, '')));
}
