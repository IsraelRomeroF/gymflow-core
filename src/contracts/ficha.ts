import { z } from 'zod';
import { Centavos, Fecha, Id, Instante } from './comun.js';
import { PaymentMethodSchema, PosSaleStatusSchema } from './enums.js';
import { Pagina } from './lista.js';

/**
 * LA FICHA DEL SOCIO (auditoría 8, bloque 2.2): lo que la ficha lee de nuevo.
 *
 *  - Las compras de la tienda ligadas al socio (8-01): el punto de venta
 *    prometía «queda en su ficha» y nada las leía.
 *  - La historia (3-11): una línea de tiempo con lo que pasó con el socio,
 *    armada con la bitácora, sus entradas, los contactos y los avisos.
 */

// ── Compras de la tienda ────────────────────────────────────────────────────

/** Una venta de mostrador ligada al socio, con el nombre de cada producto y quién la cobró. */
export const MemberPosSale = z.object({
  id: Id,
  branchId: Id,
  status: PosSaleStatusSchema,
  totalCents: Centavos,
  /** Nulo solo si la venta fue a la cuenta del socio. */
  method: PaymentMethodSchema.nullable(),
  /** Nulo en transferencia. */
  folio: z.string().nullable(),
  /** Solo en una anulada. */
  voidReason: z.string().nullable(),
  soldAt: Instante,
  businessDate: Fecha,
  /** Quien la cobró; `null` si la cuenta ya no existe. */
  soldByName: z.string().nullable(),
  /** D-13 (bloque 3.5): sigue marcada «por corregir». */
  flagged: z.boolean().optional(),
  /** D-13: el día en que se devolvió (la venta sigue «completada» en su día); `null` si no se devolvió. */
  returnedOn: Fecha.nullable().optional(),
  lines: z.array(z.object({
    productId: Id,
    /** `null` si el producto ya se borró del catálogo. */
    name: z.string().nullable(),
    quantity: z.number().int(),
    unitPriceCents: Centavos,
    lineTotalCents: Centavos,
  })),
});
export type MemberPosSale = z.infer<typeof MemberPosSale>;

/**
 * `GET /members/:id/pos-sales?cursor=&limit=`: sus compras, la más reciente
 * primero, también las anuladas (dicen que se anularon). `spentCents` suma
 * TODAS las que no se anularon, no solo las de esta página.
 */
export const MemberPosSales = Pagina(MemberPosSale).extend({ spentCents: Centavos });
export type MemberPosSales = z.infer<typeof MemberPosSales>;

// ── Historia ────────────────────────────────────────────────────────────────

/**
 * De qué habla cada renglón de la historia. `DINERO` solo lo recibe quien ve
 * estados de cuenta; `PUERTA`, quien ve asistencias; `CONTACTO`, quien ve los
 * datos de contacto; `FIRMAS`, quien ve consentimientos.
 */
export const HISTORY_KINDS = ['DINERO', 'MEMBRESIA', 'PUERTA', 'CONTACTO', 'FIRMAS', 'DATOS'] as const;
export const HistoryKindSchema = z.enum(HISTORY_KINDS);
export type HistoryKind = z.infer<typeof HistoryKindSchema>;

/** Un renglón de la historia del socio. */
export const MemberHistoryItem = z.object({
  /** Único dentro de la historia (el origen va de prefijo). */
  id: z.string(),
  at: Instante,
  kind: HistoryKindSchema,
  /** De dónde sale: la bitácora, sus pasos por la puerta (un renglón por día y sede), un contacto registrado o un aviso de su portal. */
  source: z.enum(['AUDIT', 'VISIT', 'CONTACT', 'NOTICE']),
  /** La clave de la acción cuando viene de la bitácora. */
  action: z.string().nullable(),
  /** Quién lo hizo: una persona del personal, «El socio» o «El sistema». */
  actorName: z.string(),
  /** Qué pasó, sin el nombre del socio («registró un cobro de $650.00», «Entró», «Llamada · Contestó»). */
  phrase: z.string(),
  /** Lo que se dijo o el detalle: la nota del contacto, el texto del aviso, cómo entró. */
  detail: z.string().nullable(),
  amountCents: Centavos.nullable(),
  /** El motivo escrito al hacerlo. */
  reason: z.string().nullable(),
  approverName: z.string().nullable(),
  branchId: Id.nullable(),
});
export type MemberHistoryItem = z.infer<typeof MemberHistoryItem>;

/**
 * `GET /members/:id/history?kind=&cursor=&limit=`: la historia, lo más
 * reciente primero. `kinds` dice qué partes puede ver quien pregunta: la
 * pantalla solo ofrece esos filtros y no dice «sin movimientos de dinero» a
 * quien no los recibe.
 */
export const MemberHistory = z.object({
  items: z.array(MemberHistoryItem),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  kinds: z.array(HistoryKindSchema),
});
export type MemberHistory = z.infer<typeof MemberHistory>;
