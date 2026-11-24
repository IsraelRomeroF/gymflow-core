/**
 * LOS PLAZOS DEL SOCIO (D-18; auditoría 8, fase 4, bloque 4.4).
 *
 * UNA sola definición de cada plazo del ciclo del socio que se va y de la
 * deuda que ya no se cobra. Antes cada pantalla y cada job traía su número
 * (21 y 60 en Retención, 14 y 90 en los jobs de membresías, «baja» solo como
 * el acto de la ficha, «Recuperar» sin existir): aquí están los seis, con su
 * valor de fábrica, sus límites, quién los ajusta y la frase con que se dicen.
 *
 *   21 días sin venir .......... «dejó de venir»
 *   30 días de terminada ....... «baja» (o el día en que se cancela)
 *   60 días sin venir .......... «perdido»
 *   6 meses .................... se le busca en «Recuperar»
 *   7 días ..................... la venta sin cobrar se cancela
 *   90 días suspendida ......... su deuda se da por perdida
 *
 * Son valores POR GIMNASIO: sin ajuste valen los de fábrica. Los cuatro de
 * retención los ajusta la gerencia, con motivo; los dos de la deuda, solo con
 * la firma de la dueña (dar dinero por perdido es control, como firmar).
 *
 * Este archivo no importa nada: sirve igual en el navegador.
 */

/** Los seis plazos, ya resueltos (lo del gimnasio o, sin ajuste, lo de fábrica). */
export type PlazosDelSocio = {
  /** Días sin venir para «dejó de venir», venga como viniera. */
  readonly dormantDays: number;
  /** Días que lleva terminada una membresía sin renovar para que el socio cuente como baja. */
  readonly churnDays: number;
  /** Días sin venir para darlo por «perdido»: sale de «A quién llamar» y pasa a «Recuperar». */
  readonly lostDays: number;
  /** Meses que se le busca en «Recuperar» desde que se perdió o se dio de baja. */
  readonly winbackMonths: number;
  /** Días que una venta puede quedarse sin cobrar antes de cancelarse sola. */
  readonly unpaidSaleDays: number;
  /** Días que lleva suspendida una membresía para terminarla y dar su deuda por perdida. */
  readonly lostDebtDays: number;
};

export type PlazoKey = keyof PlazosDelSocio;

/** Quién ajusta cada plazo: `retention` la gerencia con motivo; `debt` solo con la firma de la dueña. */
export type GrupoDePlazo = 'retention' | 'debt';

/** LOS VALORES DE FÁBRICA: los que Israel decidió en D-18. El único lugar donde están escritos. */
export const PLAZOS_DEL_SOCIO: PlazosDelSocio = {
  dormantDays: 21,
  churnDays: 30,
  lostDays: 60,
  winbackMonths: 6,
  unpaidSaleDays: 7,
  lostDebtDays: 90,
};

export type DefinicionDePlazo = {
  readonly key: PlazoKey;
  readonly group: GrupoDePlazo;
  readonly unit: 'days' | 'months';
  readonly min: number;
  readonly max: number;
  /** El nombre corto del campo. */
  readonly label: string;
  /** Qué decide, en una frase para quien lo ajusta. */
  readonly hint: string;
};

/**
 * Cada plazo con sus límites. Los mínimos evitan lo que rompería otra regla:
 * «dejó de venir» no puede bajar de una semana (antes de seis días no hay
 * alerta por hábito) y la deuda no se da por perdida antes de un mes.
 */
export const DEFINICION_DE_PLAZOS: readonly DefinicionDePlazo[] = [
  { key: 'dormantDays', group: 'retention', unit: 'days', min: 7, max: 60, label: 'Dejó de venir', hint: 'Días sin venir para marcarlo «Dejó de venir», venga como viniera.' },
  { key: 'lostDays', group: 'retention', unit: 'days', min: 14, max: 180, label: 'Perdido', hint: 'Días sin venir para darlo por perdido: sale de «A quién llamar» y pasa a «Recuperar».' },
  { key: 'churnDays', group: 'retention', unit: 'days', min: 1, max: 120, label: 'Baja', hint: 'Días que lleva terminada su membresía sin renovar para contarlo como baja. Quien cancela es baja ese mismo día.' },
  { key: 'winbackMonths', group: 'retention', unit: 'months', min: 1, max: 24, label: 'Recuperar', hint: 'Meses que se le sigue buscando en «Recuperar» desde que se perdió o se dio de baja.' },
  { key: 'unpaidSaleDays', group: 'debt', unit: 'days', min: 1, max: 60, label: 'Venta sin cobrar', hint: 'Días que una venta puede quedarse sin cobrar antes de cancelarse sola.' },
  { key: 'lostDebtDays', group: 'debt', unit: 'days', min: 30, max: 365, label: 'Deuda que se da por perdida', hint: 'Días que lleva suspendida una membresía para terminarla y sacar su deuda de «Por cobrar». La deuda no se borra: sigue en su estado de cuenta y se puede cobrar.' },
];

export const PLAZO_KEYS: readonly PlazoKey[] = DEFINICION_DE_PLAZOS.map((d) => d.key);

/** Los plazos de un grupo (`retention` o `debt`), en el orden en que se muestran. */
export function plazosDelGrupo(group: GrupoDePlazo): readonly DefinicionDePlazo[] {
  return DEFINICION_DE_PLAZOS.filter((d) => d.group === group);
}

/**
 * Los plazos que rigen: lo que el gimnasio guardó o, donde no guardó nada (o
 * guardó algo que ya no es válido), lo de fábrica. Nunca falla: un valor
 * fuera de límites en la base no puede tirar la lista de Retención.
 */
export function resolverPlazos(guardado?: Partial<Record<PlazoKey, number | null | undefined>> | null): PlazosDelSocio {
  const salida: Record<PlazoKey, number> = { ...PLAZOS_DEL_SOCIO };
  for (const d of DEFINICION_DE_PLAZOS) {
    const v = guardado?.[d.key];
    if (typeof v === 'number' && Number.isInteger(v) && v >= d.min && v <= d.max) salida[d.key] = v;
  }
  // «Perdido» siempre va después de «dejó de venir»: si lo guardado se cruza, manda lo de fábrica.
  if (salida.lostDays <= salida.dormantDays) {
    salida.dormantDays = PLAZOS_DEL_SOCIO.dormantDays;
    salida.lostDays = PLAZOS_DEL_SOCIO.lostDays;
  }
  return salida;
}

/**
 * Lo que no deja guardar un ajuste, en frases para el pie del diálogo. Vacío
 * si todo está bien. `propuesto` trae solo los plazos que se cambian; los
 * demás se toman de `vigentes` para comprobar los cruces.
 */
export function erroresDePlazos(propuesto: Partial<Record<PlazoKey, number>>, vigentes: PlazosDelSocio = PLAZOS_DEL_SOCIO): string[] {
  const errores: string[] = [];
  for (const d of DEFINICION_DE_PLAZOS) {
    const v = propuesto[d.key];
    if (v === undefined) continue;
    const unidad = d.unit === 'months' ? 'meses' : 'días';
    if (!Number.isInteger(v)) errores.push(`«${d.label}» va en ${unidad} enteros.`);
    else if (v < d.min || v > d.max) errores.push(`«${d.label}» va de ${d.min} a ${d.max} ${unidad}.`);
  }
  const final = { ...vigentes, ...propuesto };
  if (final.lostDays <= final.dormantDays) errores.push('«Perdido» tiene que ser más días que «Dejó de venir».');
  return errores;
}

/** ¿Cambia algo? Para no asentar en la bitácora un guardado que dejó todo igual. */
export function plazosCambiados(antes: PlazosDelSocio, despues: PlazosDelSocio): PlazoKey[] {
  return PLAZO_KEYS.filter((k) => antes[k] !== despues[k]);
}

// ── Interesados (D-31; bloque 4.7, edición puntual de ese bloque) ────────────

/**
 * LOS PLAZOS DEL INTERESADO. No es un socio y por eso no va en
 * `PlazosDelSocio` (ni se ajusta por gimnasio: D-31 dice 60 días), pero vive
 * en este archivo para que todos los plazos estén escritos en un solo lugar.
 * Los leen `captacion.ts` (la regla del cierre solo), el job
 * `prospects.auto-close` y las pantallas de Prospectos.
 */
export const PLAZOS_DEL_INTERESADO = {
  /** Días sin contacto ni fecha pendiente para que un interesado abierto se cierre solo (se puede reabrir). */
  autoCloseDays: 60,
  /**
   * Días de aviso: con cuánta anticipación la fila dice «se cierra solo el…»
   * y cuánto espera el cierre solo para EMPEZAR en un gimnasio que ya tenía
   * interesados viejos (su primera corrida no cierra a nadie).
   */
  autoCloseNoticeDays: 7,
} as const;

// ── Fechas de calendario (AAAA-MM-DD), sin zona: el día de la sede ───────────

const MS_DIA = 86_400_000;
const aFecha = (iso: string): Date => new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
const aIso = (d: Date): string => d.toISOString().slice(0, 10);

/** `dia` más (o menos) `n` días de calendario. */
export function sumarDias(dia: string, n: number): string {
  return aIso(new Date(aFecha(dia).getTime() + n * MS_DIA));
}

/** `dia` más (o menos) `n` meses de calendario; el 31 de un mes corto cae en su último día. */
export function sumarMeses(dia: string, n: number): string {
  const d = aFecha(dia);
  const destino = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const ultimo = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
  destino.setUTCDate(Math.min(d.getUTCDate(), ultimo));
  return aIso(destino);
}

// ── Baja ─────────────────────────────────────────────────────────────────────

/**
 * Por qué cuenta como baja:
 *  - `ARCHIVED`: alguien lo dio de baja en su ficha (el acto «Dar de baja»).
 *  - `CANCELED`: su membresía se canceló y no tiene otra.
 *  - `EXPIRED`: su membresía terminó, pasó el plazo de baja y no renovó.
 */
export type CausaDeBaja = 'ARCHIVED' | 'CANCELED' | 'EXPIRED';

export type BajaDelSocio = {
  readonly cause: CausaDeBaja;
  /** Desde qué día está de baja (día de la sede). */
  readonly since: string;
  /** Solo `EXPIRED`: el día en que terminó la membresía (la baja es `churnDays` después). */
  readonly endedOn: string | null;
};

export type DatosParaLaBaja = {
  /** El día en que lo dieron de baja en su ficha, si pasó. */
  readonly archivedOn: string | null;
  /** ¿Tiene hoy una membresía sin terminar (por activar, vigente, en gracia, congelada o suspendida)? */
  readonly hasLiveMembership: boolean;
  /**
   * La última membresía TERMINADA que llegó a dar acceso (una venta que nunca
   * se cobró no cuenta: no fue socio por ella). `null` si no tiene ninguna.
   */
  readonly lastEnded: { readonly status: 'CANCELED' | 'EXPIRED'; readonly endedOn: string } | null;
  /** Hoy en la sede, `AAAA-MM-DD`. */
  readonly today: string;
  readonly churnDays: number;
};

/**
 * ¿ESTÁ DE BAJA, Y DESDE CUÁNDO? (D-18: «baja = cancelada, o vencida 30 días
 * sin renovar».) La regla, en orden:
 *  1. Lo dieron de baja en su ficha: baja desde ese día.
 *  2. Tiene una membresía sin terminar: no es baja (aunque deba o esté suspendida).
 *  3. Su última membresía se canceló: baja desde el día de la cancelación.
 *  4. Su última membresía terminó: baja desde `churnDays` días después, y solo
 *     cuando ese día ya llegó. Antes está «sin plan», todavía no de baja.
 *  5. Nunca tuvo una membresía que diera acceso: no es baja (nunca fue socio con plan).
 */
export function bajaDelSocio(d: DatosParaLaBaja): BajaDelSocio | null {
  if (d.archivedOn) return { cause: 'ARCHIVED', since: d.archivedOn.slice(0, 10), endedOn: null };
  if (d.hasLiveMembership || !d.lastEnded) return null;
  const termino = d.lastEnded.endedOn.slice(0, 10);
  if (d.lastEnded.status === 'CANCELED') return { cause: 'CANCELED', since: termino, endedOn: null };
  const desde = sumarDias(termino, d.churnDays);
  return desde <= d.today.slice(0, 10) ? { cause: 'EXPIRED', since: desde, endedOn: termino } : null;
}

/** Las palabras de cada causa, iguales en Retención, la ficha y los reportes. */
export const CAUSA_DE_BAJA: Readonly<Record<CausaDeBaja, string>> = {
  ARCHIVED: 'Lo dieron de baja',
  CANCELED: 'Canceló su membresía',
  EXPIRED: 'Su membresía terminó y no renovó',
};

// ── Recuperar ────────────────────────────────────────────────────────────────

/** Hasta qué día (inclusive) se le busca en «Recuperar» a quien se perdió o se dio de baja el día `since`. */
export function recuperarHasta(since: string, winbackMonths: number): string {
  return sumarMeses(since, winbackMonths);
}

/** ¿Sigue en «Recuperar» hoy? */
export function enRecuperar(since: string, today: string, winbackMonths: number): boolean {
  return since.slice(0, 10) <= today.slice(0, 10) && today.slice(0, 10) <= recuperarHasta(since, winbackMonths);
}

// ── Frases ───────────────────────────────────────────────────────────────────

const dias = (n: number) => (n === 1 ? '1 día' : `${n} días`);
const meses = (n: number) => (n === 1 ? '1 mes' : `${n} meses`);

/** Cómo se dice el valor de un plazo («21 días», «6 meses»). */
export function plazoEnPalabras(key: PlazoKey, valor: number): string {
  return key === 'winbackMonths' ? meses(valor) : dias(valor);
}

/**
 * Las frases con que TODAS las pantallas dicen los plazos (ninguna escribe su
 * número): Retención, la ficha, el Tablero, el estado de cuenta y las guías.
 */
export function frasesDePlazos(p: PlazosDelSocio): Readonly<Record<PlazoKey, string>> {
  return {
    dormantDays: `A los ${dias(p.dormantDays)} sin venir «dejó de venir», venga como viniera.`,
    lostDays: `A los ${dias(p.lostDays)} sin venir se da por perdido: sale de «A quién llamar» y pasa a «Recuperar».`,
    churnDays: `Es baja quien canceló su membresía, o quien lleva ${dias(p.churnDays)} con la membresía terminada sin renovar.`,
    winbackMonths: `A quien se perdió o se dio de baja se le busca ${meses(p.winbackMonths)} en «Recuperar».`,
    unpaidSaleDays: `Una venta que nadie cobró se cancela sola a los ${dias(p.unpaidSaleDays)}.`,
    lostDebtDays: `A los ${dias(p.lostDebtDays)} de suspendida, la membresía termina y su deuda se da por perdida: sale de «Por cobrar», sigue en el estado de cuenta del socio y se puede cobrar.`,
  };
}
