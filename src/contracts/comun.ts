import { z } from 'zod';

/**
 * PIEZAS COMUNES DE LOS CONTRATOS (auditoría 8: 28-11, 27-09).
 *
 * Lo que viaja por el cable, no lo que hay en la base: el dinero va en
 * centavos como TEXTO (`"125050"`, ADR-005: un `number` lo degradaría a punto
 * flotante), los instantes como ISO con zona (`toISOString()`), las fechas de
 * calendario como `AAAA-MM-DD` y los ids como UUID en texto.
 */

/** Centavos enteros en texto, con signo: `"125050"` son $1,250.50; `"-15000"`, una devolución. */
export const Centavos = z.string().regex(/^-?\d+$/, 'Centavos enteros en texto');
export type Centavos = z.infer<typeof Centavos>;

/** Un instante, como lo escribe `Date.toISOString()`: `2026-11-19T18:20:00.000Z`. */
export const Instante = z.iso.datetime({ offset: true });
export type Instante = z.infer<typeof Instante>;

/** Una fecha de calendario sin hora: `2026-11-19`. No se mueve de zona. */
export const Fecha = z.iso.date();
export type Fecha = z.infer<typeof Fecha>;

/** El id de un registro (UUID en texto). */
export const Id = z.guid();
export type Id = z.infer<typeof Id>;

/**
 * Un rango de fechas con fin SEMIABIERTO: `to` ya no entra («7 días» de hoy
 * es `from` = hace seis días, `to` = mañana).
 */
export const RangoDeFechas = z.object({ from: Fecha, to: Fecha });
export type RangoDeFechas = z.infer<typeof RangoDeFechas>;

/**
 * El cuerpo de un error de la API (`platform/http/error-handler.plugin.ts`).
 *
 * - `message` siempre viene y es lo que se le muestra a la persona.
 * - `error` es el código estable para decidir qué hacer: el de
 *   `DomainErrorCode` (`VALIDATION`, `CONFLICT`, `REQUIRE_APPROVAL`…) o el de
 *   otro error (`RATE_LIMITED`, `NOT_FOUND`, `INTERNAL`, `FST_ERR_…`).
 * - `detail`: la explicación de un 403 (`forbidden()` deja `message` en
 *   «Operación no permitida» y el porqué aquí), la de un 428, o un código
 *   estable (`MODULE_HAS_DEPENDENTS`, `LAST_REGISTER`). Nunca JSON.
 * - `issues`: solo el 422 de Zod, con el campo que falló (`path` relativo al
 *   cuerpo: `amountCents`, `lines.0.quantity`).
 * - `reason`: solo el 401 de una sesión que terminó (por qué; bloque 1.12).
 * - `retryAfterSeconds`: solo el 429, junto al encabezado `Retry-After`.
 * - `status`: solo los errores que vienen de la base (409 o 422).
 */
export const ErrorDeLaApi = z.object({
  error: z.string(),
  message: z.string(),
  requestId: z.string(),
  detail: z.string().optional(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  reason: z.string().optional(),
  retryAfterSeconds: z.number().int().optional(),
  status: z.number().int().optional(),
});
export type ErrorDeLaApi = z.infer<typeof ErrorDeLaApi>;
