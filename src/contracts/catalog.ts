import { z } from 'zod';
import { Centavos, Id } from './comun.js';

/**
 * EL CATÁLOGO: lo que un cambio en un plan se lleva por delante
 * (`catalog/plans.routes.ts`, fase 2 · bloque 2.7, hallazgo 16-04).
 */

/** El plan en UNA sucursal de venta: si se vende ahí hoy, a cuánto, y quién lo tiene comprado ahí. */
export const PlanImpactAtBranch = z.object({
  /** `null`: lo vendido sin sucursal de venta (importaciones viejas). */
  branchId: Id.nullable(),
  name: z.string(),
  /** La sucursal sigue abierta. */
  isOpen: z.boolean(),
  /** Se vende ahí hoy. */
  isAvailable: z.boolean(),
  /** El precio de lista ahí hoy: el propio de la sede si lo tiene, si no el del plan. */
  listPriceCents: Centavos,
  /** La sede tiene precio propio (distinto del precio base del plan). */
  hasOwnPrice: z.boolean(),
  /** Membresías vivas (ni canceladas ni vencidas) vendidas ahí. */
  liveMemberships: z.number().int(),
  /** De esas, las que renuevan a su precio pactado: un cambio del precio de lista no las toca hoy. */
  withAgreedPrice: z.number().int(),
  /** De esas, las que no tienen precio pactado: pagan el de lista del día de su cuota. */
  withoutAgreedPrice: z.number().int(),
  /** Paquetes de visitas vivos (por pagar, activos o en pausa) vendidos ahí. */
  livePacks: z.number().int(),
});
export type PlanImpactAtBranch = z.infer<typeof PlanImpactAtBranch>;

/** `GET /plans/:id/impact`: a quién toca subir el precio, apagar una sede o desactivar el plan. */
export const PlanImpact = z.object({
  planId: Id,
  isActive: z.boolean(),
  priceCents: Centavos,
  liveMemberships: z.number().int(),
  withAgreedPrice: z.number().int(),
  withoutAgreedPrice: z.number().int(),
  livePacks: z.number().int(),
  /** Una fila por sucursal del gimnasio (abierta, o cerrada con algo vivo), y una sin sucursal si hace falta. */
  branches: z.array(PlanImpactAtBranch),
});
export type PlanImpact = z.infer<typeof PlanImpact>;
