import { z } from 'zod';
import { Centavos, Fecha, Id } from './comun.js';

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
  /** De esas, las que tienen su precio escrito (casi todas: cada venta lo deja). Desde D-19 un cambio de precio también lo mueve: ver `priceChange`. */
  withAgreedPrice: z.number().int(),
  /** De esas, las que no tienen precio escrito (anteriores a DM-05): pagan el de lista del día de su cuota. */
  withoutAgreedPrice: z.number().int(),
  /** Paquetes de visitas vivos (por pagar, activos o en pausa) vendidos ahí. */
  livePacks: z.number().int(),
});
export type PlanImpactAtBranch = z.infer<typeof PlanImpactAtBranch>;

/**
 * LO QUE HACE UN CAMBIO DE PRECIO (fase 3 · bloque 3.6 · D-19): subir (o
 * bajar) el precio de un plan le cambia a TODOS en su siguiente pago. A cada
 * membresía viva vendida donde rige el precio de lista se le suma la misma
 * diferencia; la que paga hoy el de lista queda exacto en el nuevo. Solo
 * conservan su precio las marcadas «conserva su precio» (`priceProtected`), y
 * aun esas cambian si quien confirma lo decide (`includeProtected`).
 * Lo ya cobrado y las cuotas ya emitidas no cambian.
 */
export const PlanPriceChangePreview = z.object({
  fromPriceCents: Centavos,
  toPriceCents: Centavos,
  /** `to − from`: positivo si sube. */
  deltaCents: Centavos,
  /** Membresías vivas a las que les cambia en su siguiente pago (sin contar las protegidas). */
  touched: z.number().int(),
  /** De esas, las que hoy pagan el precio de lista: pasan exacto al nuevo. */
  touchedAtListPrice: z.number().int(),
  /** De esas, las que pagan otro precio y no están protegidas: se les suma la misma diferencia. */
  touchedAtOtherPrice: z.number().int(),
  /** Lo que cambia la suma de sus cuotas por periodo (con signo), entre las tocadas. */
  touchedDeltaCents: Centavos,
  /** Las que conservan su precio: no cambian salvo que se decida incluirlas. */
  protected: z.number().int(),
  /** Lo que cambiaría la suma de sus cuotas si se incluyen. */
  protectedDeltaCents: Centavos,
  /** Vendidas en sucursales con precio propio: este cambio no las toca. */
  atOwnPriceBranches: z.number().int(),
  /** El primer día en que alguien de las tocadas paga el precio nuevo (el fin del periodo más próximo); `null` si no hay. */
  firstPaymentOn: Fecha.nullable(),
  /** De las tocadas, las que no tienen celular: no se les puede avisar por WhatsApp. */
  touchedWithoutPhone: z.number().int(),
});
export type PlanPriceChangePreview = z.infer<typeof PlanPriceChangePreview>;

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
  /** Solo con `?newPriceCents=` y un precio distinto al de hoy: a quién le cambia y cuánto (D-19). */
  priceChange: PlanPriceChangePreview.nullable().optional(),
});
export type PlanImpact = z.infer<typeof PlanImpact>;

/** Una membresía que conserva su precio. */
export const ProtectedPrice = z.object({
  membershipId: Id,
  memberId: Id,
  memberCode: z.string(),
  memberName: z.string(),
  /** Sucursal de venta; `null` si no tiene. */
  branchId: Id.nullable(),
  /** Lo que paga por periodo. */
  agreedPriceCents: Centavos,
  /** El precio de lista del plan en su sucursal hoy. */
  listPriceCents: Centavos,
  /** Por qué conserva su precio. */
  reason: z.string().nullable(),
});
export type ProtectedPrice = z.infer<typeof ProtectedPrice>;

/** `GET /plans/:id/protected-prices`: quiénes conservan su precio en ese plan (hasta 200; `total` las cuenta todas). */
export const ProtectedPrices = z.object({ total: z.number().int(), items: z.array(ProtectedPrice) });
export type ProtectedPrices = z.infer<typeof ProtectedPrices>;

/** `PUT /memberships/:id/price-protection`: cómo quedó la marca. */
export const PriceProtectionResult = z.object({
  membershipId: Id,
  priceProtected: z.boolean(),
  /** Lo que paga por periodo (al marcarla queda escrito el que pagaba ese día). */
  agreedPriceCents: Centavos.nullable(),
  reason: z.string().nullable(),
});
export type PriceProtectionResult = z.infer<typeof PriceProtectionResult>;
