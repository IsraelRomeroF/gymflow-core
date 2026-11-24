import type { Grant } from './authorize.js';

/**
 * PERMISOS POR PERSONA (decisión del 2026-10-09).
 *
 * El puesto da los permisos de base. Encima, quien administra al personal
 * (la gerencia, o el dueño mientras no haya gerente) enciende o apaga acciones
 * sueltas a una persona de recepción o a un coach: "esta recepcionista sí
 * cancela ventas", "este coach no reserva por el socio".
 *
 * Solo se ajusta lo de esta lista, cerrada a propósito: nunca el personal, la
 * segunda firma, la bitácora, la configuración ni la plataforma. Lo que pide
 * segunda firma la sigue pidiendo, y los topes del puesto siguen valiendo.
 * Se guarda en `users.permissionOverrides` como { add, remove }.
 *
 * Cada puesto tiene SU lista (17-02): a recepción se le ajusta lo del
 * mostrador; al coach, solo lo de su trabajo (clases, entrenamiento y ver la
 * salud de sus socios). Al coach nunca se le enciende dinero, caja, punto de
 * venta, acceso ni altas: eso entraba por un interruptor que el dueño no ve y
 * rompía «el coach solo ve a sus socios asignados».
 */
export type GrupoAjustable = { name: string; permissions: readonly string[] };

export const ADJUSTABLE_BY_ROLE: Readonly<Record<'RECEPTION' | 'COACH', readonly GrupoAjustable[]>> = {
  RECEPTION: [
    { name: 'Socios', permissions: ['members:create', 'members:update', 'members:portal:invite', 'members:message:send', 'members:intake:review', 'members:health:read', 'access:biometric:enroll'] },
    { name: 'Membresías', permissions: ['memberships:create', 'memberships:visitpack:manage', 'memberships:freeze', 'memberships:change_plan'] },
    { name: 'Cobro', permissions: ['payments:record', 'billing:charge:create', 'billing:discount:apply'] },
    // `cash:petty:record` y `cash:withdraw` vienen con el puesto desde D-15 (bloque 3.5); aquí se le quitan a quien no deba.
    { name: 'Caja', permissions: ['cash:session:open', 'cash:session:close', 'cash:petty:record', 'cash:withdraw'] },
    { name: 'Punto de venta', permissions: ['pos:sale:create', 'pos:sale:void'] },
    { name: 'Acceso', permissions: ['access:monitor', 'access:manual_grant', 'access:credential:manage'] },
    // `classes:session:operate` (D-28): suplente y cupo. A quien recepción arma el horario se le
    // enciende junto con `classes:manage`. Cancelar (`classes:session:cancel`) no está en ninguna lista.
    { name: 'Clases', permissions: ['classes:book_for_member', 'classes:session:operate', 'classes:manage'] },
    { name: 'Entrenamiento', permissions: ['training:read', 'training:template:manage', 'training:assign'] },
  ],
  COACH: [
    { name: 'Socios', permissions: ['members:health:read'] },
    // `classes:manage` ya no viene con el puesto (D-28): armar el horario se da por persona.
    { name: 'Clases', permissions: ['classes:book_for_member', 'classes:session:operate', 'classes:manage'] },
    { name: 'Entrenamiento', permissions: ['training:template:manage', 'training:assign'] },
  ],
};

/** Todos los grupos que se ajustan a alguien (la lista de recepción los contiene todos). */
export const ADJUSTABLE_PERMISSION_GROUPS: readonly GrupoAjustable[] = ADJUSTABLE_BY_ROLE.RECEPTION;

export const ADJUSTABLE_PERMISSIONS: ReadonlySet<string> = new Set(Object.values(ADJUSTABLE_BY_ROLE).flatMap((gs) => gs.flatMap((g) => g.permissions)));

/** A quién se le ajusta: recepción y coach. Gerencia y dueño van completos por su puesto. */
export const ADJUSTABLE_ROLES: ReadonlySet<string> = new Set(Object.keys(ADJUSTABLE_BY_ROLE));

const POR_PUESTO: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  Object.entries(ADJUSTABLE_BY_ROLE).map(([k, gs]) => [k, new Set(gs.flatMap((g) => g.permissions))]),
);

/** Lo que se le puede ajustar a ESE puesto; nada a los que no se ajustan. */
export function adjustableFor(roleKey: string | null | undefined): ReadonlySet<string> {
  return (roleKey ? POR_PUESTO.get(roleKey) : undefined) ?? new Set();
}

export type PermissionOverrides = { add: string[]; remove: string[] };

/**
 * Lo guardado, limpio: solo claves de la lista, sin repetir y sin estar en las
 * dos. Con `roleKey`, solo lo que se ajusta a ese puesto: un ajuste viejo que
 * hoy no le toca (caja a un coach) deja de valer aunque siga guardado.
 */
export function normalizeOverrides(raw: unknown, roleKey?: string | null): PermissionOverrides {
  const o = (raw && typeof raw === 'object' ? raw : {}) as { add?: unknown; remove?: unknown };
  const permitidas = roleKey === undefined ? ADJUSTABLE_PERMISSIONS : adjustableFor(roleKey);
  const lista = (v: unknown) => [...new Set(Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string' && permitidas.has(k)) : [])].sort();
  const remove = lista(o.remove);
  const add = lista(o.add).filter((k) => !remove.includes(k));
  return { add, remove };
}

/**
 * Los permisos efectivos con los ajustes de la persona. Lo agregado vale en
 * las mismas sucursales que su puesto (`branches`; null = todo el gimnasio).
 */
export function applyOverrides(grants: readonly Grant[], overrides: PermissionOverrides, branches: ReadonlyArray<string | null>): Grant[] {
  const quitar = new Set(overrides.remove);
  const out = grants.filter((g) => !quitar.has(g.permission));
  const ya = new Set(out.map((g) => `${g.permission}|${g.branchId ?? ''}`));
  for (const permission of overrides.add) {
    for (const branchId of new Set(branches)) {
      const k = `${permission}|${branchId ?? ''}`;
      if (!ya.has(k)) { out.push({ permission, branchId } as Grant); ya.add(k); }
    }
  }
  return out;
}
