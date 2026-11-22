/**
 * Catálogo de MÓDULOS (ADR-036).
 *
 * Un módulo es una parte del producto que un gimnasio puede usar o no:
 * Clases, Punto de venta, Rutinas, Prospectos… Cada gimnasio enciende los
 * suyos, porque lo que necesita cada encargado para operar cambia de un
 * gimnasio a otro.
 *
 * Es catálogo GLOBAL de la plataforma, como el de permisos, y dominio puro:
 * lo comparten el backend (la puerta de las rutas y los trabajos nocturnos),
 * el panel y el portal (qué secciones se muestran).
 *
 * Reglas:
 *  - Lo `fijo` no se apaga: sin socios, cobros o caja no hay gimnasio.
 *  - Apagar un módulo lo oculta y deja de generar cosas nuevas. NUNCA borra:
 *    al volver a encenderlo todo está como estaba, y el dinero histórico
 *    sigue contando en los reportes.
 *  - Un módulo cuyo requisito está apagado cuenta como apagado.
 */
/** Cómo se agrupan en la pantalla de Módulos: por lo que resuelven, no por cómo están hechos. */
export const MODULE_GROUPS = {
  money: 'Para cobrar',
  sell: 'Para vender',
  members: 'Para tus socios',
  entrance: 'Para la entrada',
} as const;
export type ModuleGroup = keyof typeof MODULE_GROUPS;

export type ModuleDef = {
  readonly key: string;
  /** Como lo lee el encargado en la pantalla de Módulos. */
  readonly name: string;
  /** Para qué sirve, en una frase y sin tecnicismos. */
  readonly description: string;
  readonly kind: 'fixed' | 'optional';
  /** Solo los opcionales: en qué grupo de la pantalla van. */
  readonly group: ModuleGroup | null;
  /** Quién lo usa en el gimnasio. */
  readonly usedBy: string;
  /** Las pantallas del panel que trae, con el nombre que tienen en el menú. */
  readonly screens: readonly string[];
  /** Módulos que deben estar encendidos para que este funcione. */
  readonly requires: readonly string[];
  /** Cómo nace un gimnasio que no ha elegido nada. */
  readonly defaultEnabled: boolean;
  /**
   * `branch`: una sucursal puede dejar de usarlo aunque el gimnasio lo tenga
   * encendido (una sede sin salón de clases, una sin tienda). `org`: es de
   * todo el gimnasio o de nadie.
   */
  readonly scope: 'org' | 'branch';
};

function m(
  key: string, name: string, description: string,
  opts: { fixed?: boolean; group?: ModuleGroup; usedBy: string; screens: readonly string[]; requires?: readonly string[]; defaultEnabled?: boolean; byBranch?: boolean },
): ModuleDef {
  return {
    key, name, description,
    kind: opts.fixed ? 'fixed' : 'optional',
    group: opts.group ?? null,
    usedBy: opts.usedBy,
    screens: opts.screens,
    requires: opts.requires ?? [],
    defaultEnabled: opts.defaultEnabled ?? true,
    scope: opts.byBranch ? 'branch' : 'org',
  };
}

export const MODULES = [
  m('core', 'Lo básico', 'Socios, membresías, cobros, planes, recepción, reportes, personal, sucursales, autorizaciones y bitácora.', {
    fixed: true, usedBy: 'Todo el personal',
    screens: ['Inicio', 'Recepción', 'Socios', 'Tablero', 'Movimientos', 'Planes', 'Personal', 'Sucursales', 'Autorizaciones', 'Bitácora', 'Textos de consentimiento'],
  }),

  // Sin Caja, el efectivo y la terminal se registran igual, pero sin turno ni
  // corte: para el gimnasio que cobra por transferencia o que no corta cajón.
  m('cash', 'Caja', 'Turnos de caja, cortes y retiros. Sin Caja, los cobros en efectivo y con terminal se registran sin corte.', {
    group: 'money', usedBy: 'Recepción · Gerencia', screens: ['Caja'], byBranch: true,
  }),

  m('pos', 'Punto de venta', 'Vende agua, suplementos y accesorios en el mostrador, con existencias por sucursal.', {
    group: 'sell', usedBy: 'Recepción vende · Gerencia lleva el catálogo', screens: ['Punto de venta', 'Productos'], requires: ['cash'], byBranch: true,
  }),
  m('prospects', 'Prospectos', 'Seguimiento de quien preguntó y todavía no se inscribe.', {
    group: 'sell', usedBy: 'Recepción · Gerencia', screens: ['Prospectos'], byBranch: true,
  }),
  m('intake', 'Altas digitales', 'El socio captura sus datos y firma desde su teléfono con el QR de la sucursal; recepción solo confirma.', {
    group: 'sell', usedBy: 'Recepción', screens: ['Altas digitales'], byBranch: true,
  }),

  m('classes', 'Clases', 'Horario de clases con cupo, reservas desde el teléfono y pase de lista.', {
    group: 'members', usedBy: 'Coach y Recepción · el socio reserva en su teléfono', screens: ['Clases'], byBranch: true,
  }),
  m('training', 'Rutinas', 'Rutinas que arma el coach y que el socio sigue desde su teléfono.', {
    group: 'members', usedBy: 'Coach · Gerencia', screens: ['Rutinas'],
  }),
  m('retention', 'Retención', 'La lista diaria de a quién llamar antes de que deje de venir.', {
    group: 'members', usedBy: 'Gerencia · Recepción', screens: ['Retención'],
  }),
  m('member_portal', 'Portal del socio', 'El socio ve su membresía, paga y reserva desde su teléfono.', {
    group: 'members', usedBy: 'Tus socios · Recepción entrega el código', screens: ['Portal del socio (en el teléfono del socio)'],
  }),

  m('biometrics', 'Biometría', 'Entrada con rostro o huella, con el consentimiento del socio y el control de borrado que pide la ley.', {
    group: 'entrance', usedBy: 'Recepción enrola · Gerencia vigila los borrados', screens: ['Biometría'], byBranch: true,
  }),
  // Apagado mientras no haya equipo instalado: sin él solo mostraría una lista vacía.
  m('turnstile', 'Monitor de accesos', 'Pantalla en vivo de quién entra y a quién se le negó el paso, y los equipos de la entrada.', {
    group: 'entrance', usedBy: 'Recepción · Gerencia', screens: ['Accesos'], defaultEnabled: false, byBranch: true,
  }),
] as const satisfies readonly ModuleDef[];

export type ModuleKey = (typeof MODULES)[number]['key'];

export const MODULE_BY_KEY: ReadonlyMap<string, ModuleDef> = new Map(MODULES.map((def) => [def.key, def]));

/**
 * Lo que el gimnasio eligió a mano. Lo que no aparece sigue el valor por
 * omisión del catálogo: así un gimnasio que nunca tocó nada, y un módulo que
 * nazca mañana, se comportan igual sin rellenar datos.
 */
export type ModuleState = Readonly<Partial<Record<string, boolean>>>;

const elegido = (def: ModuleDef, state: ModuleState): boolean =>
  def.kind === 'fixed' || (state[def.key] ?? def.defaultEnabled);

/** Los módulos que de verdad están activos: elegidos y con sus requisitos activos. */
export function effectiveModules(state: ModuleState): ReadonlySet<ModuleKey> {
  const activos = new Set<string>();
  const visitar = (def: ModuleDef, camino: readonly string[]): boolean => {
    if (activos.has(def.key)) return true;
    if (!elegido(def, state) || camino.includes(def.key)) return false;
    for (const req of def.requires) {
      const requisito = MODULE_BY_KEY.get(req);
      if (!requisito || !visitar(requisito, [...camino, def.key])) return false;
    }
    activos.add(def.key);
    return true;
  };
  for (const def of MODULES) visitar(def, []);
  return activos as ReadonlySet<ModuleKey>;
}

export function isModuleEnabled(key: string, state: ModuleState): boolean {
  return (effectiveModules(state) as ReadonlySet<string>).has(key);
}

/** Módulos activos que dejarían de funcionar si este se apaga. */
export function dependentsOf(key: string, state: ModuleState): ModuleKey[] {
  const activos = effectiveModules(state);
  const sin = effectiveModules({ ...state, [key]: false });
  return [...activos].filter((k) => k !== key && !sin.has(k));
}

export type ModuleChange =
  | { ok: true; state: ModuleState; alsoEnabled: ModuleKey[] }
  | { ok: false; code: 'UNKNOWN' | 'FIXED' | 'HAS_DEPENDENTS'; dependents: ModuleKey[] };

/**
 * El estado que resulta de encender o apagar un módulo.
 *
 * Encender enciende también sus requisitos (se dice cuáles). Apagar se
 * rechaza si otro módulo activo lo necesita: primero se apaga ese, a
 * propósito, para que nadie apague dos cosas creyendo que apagaba una.
 */
export function changeModule(key: string, enabled: boolean, state: ModuleState): ModuleChange {
  const def = MODULE_BY_KEY.get(key);
  if (!def) return { ok: false, code: 'UNKNOWN', dependents: [] };
  if (def.kind === 'fixed') return { ok: false, code: 'FIXED', dependents: [] };

  if (!enabled) {
    const dependents = dependentsOf(key, state);
    if (dependents.length > 0) return { ok: false, code: 'HAS_DEPENDENTS', dependents };
    return { ok: true, state: { ...state, [key]: false }, alsoEnabled: [] };
  }

  const nuevo: Record<string, boolean | undefined> = { ...state, [key]: true };
  const alsoEnabled: ModuleKey[] = [];
  const encender = (d: ModuleDef) => {
    for (const req of d.requires) {
      const requisito = MODULE_BY_KEY.get(req)!;
      if (!elegido(requisito, nuevo)) { nuevo[req] = true; alsoEnabled.push(req as ModuleKey); }
      encender(requisito);
    }
  };
  encender(def);
  return { ok: true, state: nuevo, alsoEnabled };
}

/**
 * Lo que está activo EN UNA SUCURSAL: lo del gimnasio, menos lo que esa sede
 * dejó de usar. Una sede solo puede apagar; nunca enciende lo que el gimnasio
 * tiene apagado. Las dependencias cuentan igual: sin Caja en la sede, su
 * Punto de venta tampoco.
 */
export function effectiveModulesAt(state: ModuleState, branchDisabled: ReadonlySet<string> | readonly string[]): ReadonlySet<ModuleKey> {
  const apagados = new Set(branchDisabled);
  const combinado: Record<string, boolean | undefined> = { ...state };
  for (const key of apagados) {
    const def = MODULE_BY_KEY.get(key);
    if (def && def.kind === 'optional' && def.scope === 'branch') combinado[key] = false;
  }
  return effectiveModules(combinado);
}

/** ¿Puede una sucursal dejar de usar este módulo? Solo lo opcional por sede. */
export function canDisableAtBranch(key: string): boolean {
  const def = MODULE_BY_KEY.get(key);
  return !!def && def.kind === 'optional' && def.scope === 'branch';
}

/**
 * PLANTILLAS DE ARRANQUE: con qué nace una marca nueva. Son puntos de
 * partida, no niveles de precio: después cada módulo se enciende o apaga
 * suelto. `off` dice qué se apaga respecto al valor por omisión del catálogo.
 */
export type ModuleTemplate = {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly off: readonly ModuleKey[];
};

export const MODULE_TEMPLATES = [
  { key: 'barrio', name: 'Gimnasio de barrio', description: 'Una sede, pesas y cardio. Sin clases, tienda, prospectos ni portal; cobra con corte de caja.', off: ['pos', 'classes', 'training', 'prospects', 'retention', 'biometrics', 'member_portal', 'intake'] },
  { key: 'tienda', name: 'Gimnasio con tienda', description: 'Venta de producto y visitas de un día; seguimiento de quien deja de venir y entrada por huella o rostro.', off: ['classes', 'training', 'prospects'] },
  { key: 'estudio', name: 'Estudio de clases', description: 'Clases con cupo y coaches; el socio reserva desde su teléfono. Sin tienda ni biometría.', off: ['pos', 'biometrics', 'training'] },
  { key: 'cadena', name: 'Cadena multi-sede', description: 'Todo encendido; cada sucursal apaga después lo que no usa.', off: [] },
] as const satisfies readonly ModuleTemplate[];

/** El estado inicial que deja una plantilla. */
export function templateState(key: string): ModuleState {
  const t = MODULE_TEMPLATES.find((x) => x.key === key);
  if (!t) throw new Error(`Plantilla desconocida: ${key}`);
  return Object.fromEntries(t.off.map((k) => [k, false]));
}
