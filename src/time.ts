/**
 * Los cinco conceptos temporales del sistema (§3, ADR-006).
 *
 * El error más caro de un sistema de gimnasio es confundir el INSTANTE con la
 * FECHA DE NEGOCIO. Un check-in a las 23:50 del martes y otro a las 00:10 del
 * miércoles son instantes contiguos, pero pertenecen a días de corte
 * distintos — y el gerente espera verlos separados.
 */

/**
 * Fecha local de negocio en la zona indicada, como `Date` a medianoche UTC.
 * Se calcula AL ESCRIBIR y se denormaliza: agrupar por día con
 * `occurredAt AT TIME ZONE` mata los índices.
 */
export function businessDateIn(timezone: string, at: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00.000Z`);
}

export function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/**
 * Ancla de día con recorte NO destructivo (ADR-006).
 *
 * El ancla se guarda una vez y NUNCA se recalcula desde la fecha efectiva
 * anterior. El error clásico: ancla 31 → 31-ene → 28-feb → y el sistema
 * "recuerda" el 28 y sigue cobrando el 28 de marzo. El socio pierde tres días
 * de servicio al año y nadie lo detecta.
 *
 * Correcto: 31-ene → 28-feb → 31-mar → 30-abr → 31-may.
 */
export function anchoredDate(anchorDay: number, year: number, month1to12: number): Date {
  if (anchorDay < 1 || anchorDay > 31) throw new RangeError('anchorDay debe estar entre 1 y 31');
  const day = Math.min(anchorDay, daysInMonth(year, month1to12));
  return new Date(Date.UTC(year, month1to12 - 1, day));
}

/** Siguiente fecha de corte, calculada SIEMPRE desde el ancla original. */
export function nextAnchoredDate(anchorDay: number, from: Date, monthsAhead = 1): Date {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + 1 + monthsAhead;
  const targetYear = year + Math.floor((month - 1) / 12);
  const targetMonth = ((month - 1) % 12) + 1;
  return anchoredDate(anchorDay, targetYear, targetMonth);
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ── Hora de pared → instante ────────────────────────────────────────────────

/** Desfase de la zona respecto a UTC, en minutos, EN ese instante. */
function offsetMinutesAt(timezone: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  // `hour` puede venir como 24 a medianoche en algunos ICU; 24 % 24 = 0.
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return (asUtc - utcMs) / 60_000;
}

/**
 * Cómo se resolvió una hora de pared que no es única.
 *
 * `SHIFTED` — esa hora NO EXISTE (salto de primavera): se adelanta al primer
 * instante válido. `AMBIGUOUS` — ocurre DOS veces (vuelta de otoño): se toma
 * la primera. Ambas se devuelven marcadas porque una clase que se mueve sola
 * una hora es exactamente el tipo de fallo que nadie atribuye al software.
 */
export type WallTimeResolution = 'EXACT' | 'SHIFTED' | 'AMBIGUOUS';

export type ResolvedWallTime = { readonly at: Date; readonly resolution: WallTimeResolution };

/**
 * Hora de pared LOCAL de una zona → instante UTC.
 *
 * Existe por el horario de verano, y en México eso no es teórico: casi todo el
 * país lo abolió en 2022, **pero la franja fronteriza del norte lo sigue**
 * (`America/Tijuana`, `America/Ciudad_Juarez`). Guardar "la clase de las 7:00"
 * con un desfase fijo significa que dos veces al año esa sucursal —y solo esa—
 * abre las clases una hora antes o después, y nadie lo relaciona con el
 * cambio de hora.
 *
 * Por eso el desfase se resuelve EN LA FECHA de cada ocurrencia, nunca una vez
 * por horario.
 */
export function resolveWallTime(
  timezone: string,
  year: number, month1to12: number, day: number,
  hour: number, minute: number,
): ResolvedWallTime {
  const wall = Date.UTC(year, month1to12 - 1, day, hour, minute);

  // Los dos desfases posibles alrededor de esa fecha. La ventana es ancha a
  // propósito: el instante real está a hasta 14 h del valor de pared, así que
  // sondear ±6 h podría caer entero al mismo lado de un cambio de hora y no
  // verlo. Ninguna zona real cambia dos veces en 52 h.
  const PROBE_MS = 26 * 3_600_000;
  const before = offsetMinutesAt(timezone, wall - PROBE_MS);
  const after = offsetMinutesAt(timezone, wall + PROBE_MS);

  const rendersBack = (utcMs: number) => utcMs + offsetMinutesAt(timezone, utcMs) * 60_000 === wall;

  const candidates = before === after ? [before] : [before, after];
  const valid = candidates.map((o) => wall - o * 60_000).filter(rendersBack);

  // Dos instantes distintos que se ven igual en el reloj de pared: la hora se
  // repite. Se toma la primera, como hace todo el mundo.
  if (valid.length > 1) return { at: new Date(Math.min(...valid)), resolution: 'AMBIGUOUS' };
  if (valid.length === 1) return { at: new Date(valid[0]!), resolution: 'EXACT' };

  // Ninguno vale: esa hora NO EXISTE. Se adelanta al primer instante válido
  // usando el desfase ANTERIOR al salto, que es el que empuja hacia delante.
  return { at: new Date(wall - before * 60_000), resolution: 'SHIFTED' };
}
