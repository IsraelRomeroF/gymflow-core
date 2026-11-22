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
  priceCents: Centavos,
  priceLabel: z.string(),
  tracksInventory: z.boolean(),
  isActive: z.boolean(),
});
export type Product = z.infer<typeof Product>;

/** `GET /products[?includeInactive=1]`: por nombre; sin el parámetro, solo los activos. */
export const ProductList = z.object({ products: z.array(Product) });
export type ProductList = z.infer<typeof ProductList>;

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
  })),
});
export type PosSale = z.infer<typeof PosSale>;

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
