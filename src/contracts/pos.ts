import { z } from 'zod';
import { Centavos, Fecha, Id, Instante } from './comun.js';
import { InventoryMovementTypeSchema, PaymentMethodSchema, PosSaleStatusSchema } from './enums.js';
import { Pagina } from './lista.js';

/**
 * TIENDA (`pos/pos.routes.ts`: `serializeProduct`, `serializeSale`). Antes el
 * tipo `Producto` estaba tres veces en el panel (8-19).
 */

/** Un producto del catálogo (de todo el gimnasio, sin sede). */
export const Product = z.object({
  id: Id,
  /** En mayúsculas. */
  sku: z.string(),
  name: z.string(),
  /** El precio de público. */
  priceCents: Centavos,
  priceLabel: z.string(),
  /** Precio para socios con membresía vigente (D-21); `null` = no tiene: todos pagan el de público. */
  memberPriceCents: Centavos.nullable(),
  /**
   * Lo que le cuesta al gimnasio (D-21); `null` = sin capturar. Solo viaja a
   * quien administra el catálogo (`pos:product:manage`): el mostrador no lo recibe.
   */
  costCents: Centavos.nullable().optional(),
  tracksInventory: z.boolean(),
  isActive: z.boolean(),
});
export type Product = z.infer<typeof Product>;

/** A qué precio sale una línea: el de público o el de socio. */
export const POS_PRICE_KINDS = ['PUBLIC', 'MEMBER'] as const;
export const PosPriceKind = z.enum(POS_PRICE_KINDS);
export type PosPriceKind = z.infer<typeof PosPriceKind>;

/**
 * `GET /products[?includeInactive=1][&memberId=]`: por nombre; sin el
 * parámetro, solo los activos. Con `memberId`, `memberPricing` dice si a ese
 * socio le toca el precio de socio HOY (lo decide el servidor al cobrar; esto
 * es para que la pantalla muestre el mismo total).
 */
export const ProductList = z.object({
  products: z.array(Product),
  memberPricing: z.object({ memberId: Id, applies: z.boolean() }).nullable().optional(),
});
export type ProductList = z.infer<typeof ProductList>;

/**
 * Cómo va la corrección de una venta (D-13, bloque 3.5): la marca «por
 * corregir» que deja recepción y, si ya se devolvió, su devolución.
 */
export const PosSaleCorrection = z.object({
  /** `null` si nadie la marcó o la marca ya se resolvió. */
  flag: z.object({ reason: z.string(), flaggedAt: Instante, flaggedByName: z.string().nullable() }).nullable(),
  /** La devolución de otro día, si la hubo: la venta sigue «completada» en su día. */
  returned: z.object({
    amountCents: Centavos, method: PaymentMethodSchema, businessDate: Fecha, reason: z.string(),
    returnRef: z.string().nullable(), approvedByName: z.string().nullable(),
  }).nullable(),
});
export type PosSaleCorrection = z.infer<typeof PosSaleCorrection>;

/** Una venta de mostrador. `POST /pos/sales` (201, también en el reintento) y `GET /pos/sales/:id`. */
export const PosSale = z.object({
  id: Id,
  branchId: Id,
  cashSessionId: Id,
  /** `null` = público general. */
  memberId: Id.nullable(),
  status: PosSaleStatusSchema,
  totalCents: Centavos,
  totalLabel: z.string(),
  /** Nulo solo si la venta fue a la cuenta del socio. */
  method: PaymentMethodSchema.nullable(),
  /** Nulo en transferencia. */
  folio: z.string().nullable(),
  /** Solo en una anulada. */
  voidReason: z.string().nullable(),
  soldAt: Instante,
  businessDate: Fecha,
  /** Sin nombre ni SKU: se cruzan con el catálogo. */
  lines: z.array(z.object({
    productId: Id,
    quantity: z.number().int(),
    unitPriceCents: Centavos,
    lineTotalCents: Centavos,
    /** A qué precio salió: `MEMBER` si se aplicó el precio de socio (D-21). */
    priceKind: PosPriceKind,
  })),
  /** Solo en `GET /pos/sales/:id` y en las rutas de corrección (D-13). */
  correction: PosSaleCorrection.optional(),
  /** Qué se puede hacer hoy con ella: anularla (mismo día, turno abierto) o devolverla (otro día). Solo en `GET /pos/sales/:id`. */
  canVoid: z.boolean().optional(),
  canReturn: z.boolean().optional(),
});
export type PosSale = z.infer<typeof PosSale>;

/** `GET /pos/sales/flagged`: las ventas que recepción marcó «por corregir» y nadie ha resuelto (D-13). */
export const FlaggedPosSales = z.object({
  items: z.array(z.object({
    saleId: Id, branchId: Id, folio: z.string().nullable(), totalCents: Centavos, method: PaymentMethodSchema.nullable(),
    businessDate: Fecha, soldAt: Instante, memberId: Id.nullable(),
    reason: z.string(), flaggedAt: Instante, flaggedByName: z.string().nullable(),
    /** `true` si todavía se puede anular (es de hoy y su turno sigue abierto); si no, toca devolución. */
    sameDay: z.boolean(),
  })),
});
export type FlaggedPosSales = z.infer<typeof FlaggedPosSales>;

/** `GET /pos/sales?branchId=`: las ventas de HOY (fecha de negocio) de esa sede, también las anuladas. */
export const PosSaleList = z.object({ sales: z.array(PosSale) });
export type PosSaleList = z.infer<typeof PosSaleList>;

/** `GET /inventory?branchId=`: existencias de la sede (solo productos que ya tuvieron movimiento). */
export const InventoryStock = z.object({
  branchId: Id,
  stock: z.array(z.object({
    productId: Id,
    /** Nulos si el producto ya se borró del catálogo. */
    sku: z.string().nullable(),
    name: z.string().nullable(),
    quantityOnHand: z.number().int(),
  })),
});
export type InventoryStock = z.infer<typeof InventoryStock>;

/** Un movimiento de inventario (compra, venta, ajuste, traspaso, merma): el libro que antes no se podía consultar (8-02). */
export const InventoryMovement = z.object({
  id: Id,
  branchId: Id,
  productId: Id,
  /** Nulos si el producto ya se borró del catálogo. */
  sku: z.string().nullable(),
  productName: z.string().nullable(),
  movementType: InventoryMovementTypeSchema,
  /** Firmado: positivo entra, negativo sale. */
  quantityDelta: z.number().int(),
  /** Obligatorio en ajuste, merma y traspaso; `null` en una venta. */
  reason: z.string().nullable(),
  /** La venta que lo originó, si fue una venta o su anulación. */
  posSaleId: Id.nullable(),
  createdByUserId: Id,
  /** Quién lo registró; `null` si ya no está en el personal. */
  createdByName: z.string().nullable(),
  at: Instante,
  businessDate: Fecha,
});
export type InventoryMovement = z.infer<typeof InventoryMovement>;

/** `GET /inventory/movements?branchId=&productId=&cursor=&limit=`: del más reciente al más viejo. */
export const InventoryMovementList = Pagina(InventoryMovement);
export type InventoryMovementList = z.infer<typeof InventoryMovementList>;
