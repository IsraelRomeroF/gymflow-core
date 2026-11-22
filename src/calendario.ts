import { businessDateIn, isoDate } from './time.js';

/**
 * CALENDARIO DEL GIMNASIO (auditoría 8, 27-07): reglas de fecha que panel,
 * portal y API tienen que contar igual. No es presentación (eso es
 * `lib/format.ts` de cada app): es qué día ES en el gimnasio y qué día cubre
 * un periodo.
 *
 * Todas las fechas de calendario van como texto `AAAA-MM-DD`, sin hora: así
 * no se mueven de zona. `new Date('2026-09-01')` es medianoche UTC y en
 * México ya sería el 31 de agosto.
 *
 * Sin I/O y sin `node:`: lo importan panel y portal desde
 * `@gymflow/core/calendario`.
 */

/** Una fecha de calendario `AAAA-MM-DD`. */
export type FechaDeCalendario = string;

const FECHA = /^(\d{4})-(\d{2})-(\d{2})/;

/** ¿Es una fecha de calendario válida (`AAAA-MM-DD`, día que existe)? */
export function esFechaDeCalendario(texto: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return isoDate(d) === texto;
}

/**
 * HOY EN LA ZONA DEL GIMNASIO (13-12, 14-20, 26-06): la fecha que corre en
 * esa zona, no la que marca la computadora. Una PC del mostrador con otra
 * zona, o la dueña de viaje, veían «hoy» corrido un día en los bordes. Es la
 * misma cuenta que hace el servidor al escribir (`businessDateIn`).
 */
export function hoyEn(zona: string, ahora: Date = new Date()): FechaDeCalendario {
  return isoDate(businessDateIn(zona, ahora));
}

/** Suma (o resta) días a una fecha de calendario sin moverla de zona. Acepta también un ISO con hora: toma su fecha. */
export function masDias(fecha: string, dias: number): FechaDeCalendario {
  const m = FECHA.exec(fecha);
  if (!m) throw new RangeError(`Fecha no reconocida: «${fecha}»`);
  return isoDate(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + dias)));
}

/**
 * ÚLTIMO DÍA CUBIERTO de un periodo. La API da el fin semiabierto (ese día
 * ya no está pagado): mostrarlo tal cual decía «vigente hasta el 29» a quien
 * solo tenía hasta el 28.
 */
export function ultimoDia(finExclusivo: string): FechaDeCalendario {
  return masDias(finExclusivo, -1);
}

/** Días de calendario de `desde` a `hasta` (negativo si `hasta` va antes). */
export function diasEntre(desde: string, hasta: string): number {
  const a = FECHA.exec(desde);
  const b = FECHA.exec(hasta);
  if (!a || !b) throw new RangeError(`Fecha no reconocida: «${a ? hasta : desde}»`);
  const ms = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3])) - Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  return Math.round(ms / 86_400_000);
}

/** El primer día del mes de una fecha (`2026-11-19` → `2026-11-01`). */
export function inicioDeMes(fecha: string): FechaDeCalendario {
  const m = FECHA.exec(fecha);
  if (!m) throw new RangeError(`Fecha no reconocida: «${fecha}»`);
  return `${m[1]}-${m[2]}-01`;
}

/** El primer día del mes siguiente (`2026-12-31` → `2027-01-01`): el fin semiabierto de un mes. */
export function inicioDelMesSiguiente(fecha: string): FechaDeCalendario {
  const m = FECHA.exec(fecha);
  if (!m) throw new RangeError(`Fecha no reconocida: «${fecha}»`);
  return isoDate(new Date(Date.UTC(Number(m[1]), Number(m[2]), 1)));
}

/**
 * ¿EL MES YA TERMINÓ EN TODAS LAS SEDES? (13-12, 14-04; A3 T9). Un mes
 * `AAAA-MM` se puede cerrar cuando su primer día siguiente ya llegó en CADA
 * sede: con Frontera en `America/Tijuana`, a las 23:00 del 31 en la Ciudad
 * de México allá todavía es día 31 y un cobro de ese mes puede estar por
 * entrar. Recibe «hoy» en cada sede (`hoyEn(zonaDe(sede, gimnasio))`); sin
 * sedes, no hay forma de saberlo y responde `false`. Es la misma regla para
 * el botón del Tablero y para `POST /reports/monthly-close`.
 */
export function mesTerminado(mes: string, hoyEnCadaSede: readonly FechaDeCalendario[]): boolean {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(mes);
  if (!m) throw new RangeError(`Mes no reconocido: «${mes}» (se espera AAAA-MM)`);
  if (hoyEnCadaSede.length === 0) return false;
  const fin = inicioDelMesSiguiente(`${mes}-01`);
  return hoyEnCadaSede.every((hoy) => hoy.slice(0, 10) >= fin);
}

/**
 * La zona de una sucursal: la suya o, si no tiene, la del gimnasio
 * (`timezone: null` = hereda). Es la regla de la API (`effectiveTimezone`).
 */
export function zonaDe(sede: { readonly timezone: string | null } | null | undefined, gimnasio: { readonly timezone: string }): string {
  return sede?.timezone ?? gimnasio.timezone;
}

/** Las zonas de México para elegir la de un gimnasio o una sucursal (DP-09), con el nombre que entiende quien la elige. */
export const ZONAS_DE_MEXICO: ReadonlyArray<readonly [zona: string, nombre: string]> = [
  ['America/Mexico_City', 'Centro (CDMX, Guadalajara, Monterrey)'],
  ['America/Tijuana', 'Pacífico Norte (Tijuana)'],
  ['America/Hermosillo', 'Sonora'],
  ['America/Mazatlan', 'Pacífico (Mazatlán, La Paz)'],
  ['America/Chihuahua', 'Chihuahua'],
  ['America/Cancun', 'Sureste (Cancún)'],
  ['America/Merida', 'Mérida'],
];
