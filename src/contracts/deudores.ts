import { z } from 'zod';
import { Centavos, Fecha, Id } from './comun.js';
import { Pagina } from './lista.js';

/**
 * QUIÉN DEBE (fase 4, bloque 4.15). `GET /portfolio/debtors`.
 *
 * Desde 4.11 la deuda de un socio dado de baja en su ficha sigue en «Por
 * cobrar» (D-12), pero el padrón no lista a ningún dado de baja: la cifra
 * subía y nadie podía ver de quién era. Esta lista dice quién debe, cuánto,
 * desde cuándo y si una parte está dada por perdida (D-18), incluidos los
 * dados de baja, para entrar a su ficha y cobrar o condonar.
 *
 * La lee quien ve la cartera Y los estados de cuenta (`billing:portfolio:read`
 * y `billing:statement:read`): la gerencia. La dueña ve la cartera sin nombres
 * (D-25): para ella esta ruta responde 403. Recepción no ve la cartera.
 *
 * Las fichas ANONIMIZADAS nunca salen renglón por renglón: solo su cifra
 * (`summary.anonymized`). Así la lista no dice de quién es una deuda que ya no
 * tiene dueño con nombre, y los totales siguen cuadrando con «Por cobrar».
 */

/** Una cifra de la cartera: lo cobrable («Por cobrar»), lo dado por perdido y cuántos socios. */
export const CifraDeDeudores = z.object({
  /** Lo que cuenta en «Por cobrar» (sin lo dado por perdido). */
  outstandingCents: Centavos,
  /** Lo dado por perdido (D-18): fuera de «Por cobrar», pero se sigue debiendo. */
  lostCents: Centavos,
  /** Socios con algo de lo de arriba. */
  members: z.number().int(),
});
export type CifraDeDeudores = z.infer<typeof CifraDeDeudores>;

/** Un socio que debe. */
export const Deudor = z.object({
  memberId: Id,
  memberCode: z.string(),
  fullName: z.string(),
  /** Su sede de casa (no la del cargo). */
  homeBranchId: Id.nullable(),
  /** Dado de baja en su ficha: sigue debiendo (D-12). */
  archived: z.boolean(),
  /** Lo que de él cuenta en «Por cobrar». */
  outstandingCents: Centavos,
  /** De eso, lo ya vencido. */
  overdueCents: Centavos,
  /** Lo suyo dado por perdido (D-18), fuera de «Por cobrar». */
  lostCents: Centavos,
  /** El vencimiento más antiguo de lo que debe (puede ser futuro: aún no vence). */
  oldestDueDate: Fecha,
});
export type Deudor = z.infer<typeof Deudor>;

export const PortfolioDebtors = Pagina(Deudor).extend({
  asOf: Fecha,
  /** La sede consultada, o `ORGANIZACION`. */
  scope: z.string(),
  includeArchived: z.boolean(),
  /**
   * Toda la cartera de la consulta (misma sede), sin importar el filtro de
   * dados de baja: `all.outstandingCents` es «Por cobrar» y `all.lostCents`,
   * «Dada por perdida». `archived` (dados de baja con nombre) y `anonymized`
   * (fichas anonimizadas) son partes de `all` que no se traslapan; lo demás es
   * de socios vivos.
   */
  summary: z.object({
    all: CifraDeDeudores,
    archived: CifraDeDeudores,
    anonymized: CifraDeDeudores,
    /** Lo que suma la lista con este filtro (todas sus páginas). */
    listed: CifraDeDeudores,
  }),
});
export type PortfolioDebtors = z.infer<typeof PortfolioDebtors>;
