import { z } from 'zod';

/**
 * UNA PÁGINA DE UNA LISTA (auditoría 8: 3-04, 4-15, 9-14, 10-01, 8-02; A2 T6).
 *
 * Regla: una lista NUNCA esconde filas sin decirlo. Antes el estado de cuenta
 * cortaba en 50 cargos y 50 pagos, los interesados en 50 y las altas en 50 o
 * 100, y la pantalla no tenía cómo saberlo. Cada lista larga de la API viaja
 * ahora como una página: lo que cabe, cuántos hay en total, y un cursor
 * opaco para pedir la siguiente («Cargar más»).
 *
 * El cursor lo arma la API con la ordenación de esa lista (fecha e id del
 * último renglón); el panel lo devuelve tal cual en `?cursor=`. Un cursor
 * inventado o viejo responde 422, nunca una página a medias.
 */
export function Pagina<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    /** Cuántos hay en total con esos filtros, contando los que no vienen en esta página. */
    total: z.number().int(),
    /** Para pedir la siguiente página (`?cursor=`); `null` si esta es la última. */
    nextCursor: z.string().nullable(),
    /** Hay más después de esta página: la pantalla pinta «Cargar más». */
    hasMore: z.boolean(),
  });
}
export type Pagina<T> = { items: T[]; total: number; nextCursor: string | null; hasMore: boolean };

/**
 * Lo que falta de una lista cuya primera página ya viene dentro de otra
 * respuesta (el estado de cuenta trae `charges` y `payments` y, aparte,
 * `pages.charges` y `pages.payments`): cuántos hay y cómo pedir los demás.
 */
export const RestoDeLista = z.object({
  total: z.number().int(),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type RestoDeLista = z.infer<typeof RestoDeLista>;

/** Tamaño de página si la pantalla no pide otro, y el máximo que la API acepta en `?limit=`. */
export const PAGINA_POR_OMISION = 50;
export const PAGINA_MAXIMA = 200;

/**
 * EL CURSOR. Opaco para la pantalla; por dentro, el valor de ordenación del
 * último renglón (una fecha o un instante en texto) y su id, que desempata.
 * Con eso la página siguiente es «lo que va después de este renglón», y no
 * se salta ni repite filas aunque entren nuevas mientras se navega (con
 * `offset` sí pasaba).
 */
export type PartesDelCursor = { readonly orden: string; readonly id: string };

export function armarCursor(orden: string, id: string): string {
  return btoa(JSON.stringify([orden, id])).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** `null` si el texto no es un cursor de la API (inventado, cortado o viejo): la ruta responde 422. */
export function leerCursor(cursor: string): PartesDelCursor | null {
  if (!cursor || cursor.length > 400 || !/^[A-Za-z0-9_-]+$/.test(cursor)) return null;
  try {
    const v: unknown = JSON.parse(atob(cursor.replace(/-/g, '+').replace(/_/g, '/')));
    if (!Array.isArray(v) || v.length !== 2) return null;
    const [orden, id] = v as unknown[];
    if (typeof orden !== 'string' || typeof id !== 'string') return null;
    // Una fecha (`AAAA-MM-DD`) o un instante ISO, y un UUID: nada más entra a la consulta.
    if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z)?$/.test(orden) || Number.isNaN(Date.parse(orden))) return null;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
    return { orden, id };
  } catch {
    return null;
  }
}

/**
 * De `limit + 1` renglones leídos a una página: si llegó el de más, hay otra
 * página y el cursor es el último renglón que SÍ se entrega.
 */
export function cortarPagina<T>(filas: readonly T[], limit: number, cursorDe: (ultima: T) => string): { items: T[]; nextCursor: string | null; hasMore: boolean } {
  const hasMore = filas.length > limit;
  const items = hasMore ? filas.slice(0, limit) : [...filas];
  const ultima = items.at(-1);
  return { items, hasMore, nextCursor: hasMore && ultima !== undefined ? cursorDe(ultima) : null };
}
