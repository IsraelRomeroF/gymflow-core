import { z } from 'zod';
import { Centavos, Fecha, Id, Instante } from './comun.js';
import { CashMovementTypeSchema, CashSessionStatusSchema, PaymentMethodSchema } from './enums.js';

/**
 * CAJA (`cash/cash.routes.ts`: `serializeSession`, `serializeMovement`,
 * `serializeReport`). Antes `Caja`, `Turno` y `Corte` vivían a mano en
 * `gymflow-web/lib/caja.ts`.
 */

/** Una caja registradora. `GET /cash-registers` → `{ registers }` (también las inactivas). */
export const CashRegister = z.object({
  id: Id,
  branchId: Id,
  /** En mayúsculas. */
  code: z.string(),
  name: z.string(),
  isActive: z.boolean(),
});
export type CashRegister = z.infer<typeof CashRegister>;

export const CashRegisterList = z.object({ registers: z.array(CashRegister) });
export type CashRegisterList = z.infer<typeof CashRegisterList>;

/** Un turno de caja. `POST /cash-sessions` (201) lo devuelve recién abierto. */
export const CashSession = z.object({
  id: Id,
  branchId: Id,
  cashRegisterId: Id,
  status: CashSessionStatusSchema,
  /** MORNING, EVENING o NIGHT (en la base es texto libre). */
  shiftLabel: z.string().nullable(),
  businessDate: Fecha,
  openedByUserId: Id,
  openedByName: z.string().nullable(),
  closedByUserId: Id.nullable(),
  closedByName: z.string().nullable(),
  openingFloatCents: Centavos,
  /** Nulos mientras el turno está abierto: se escriben al cerrar. */
  expectedCashCents: Centavos.nullable(),
  countedCashCents: Centavos.nullable(),
  /** Contado − esperado: negativo = faltante. */
  varianceCents: Centavos.nullable(),
  varianceReason: z.string().nullable(),
  /** Corte ciego: el primer conteo, fijo aunque se cuente otra vez (puede llegar con el turno abierto). */
  firstCountedCashCents: Centavos.nullable(),
  countAttempts: z.number().int(),
  openedAt: Instante,
  closedAt: Instante.nullable(),
});
export type CashSession = z.infer<typeof CashSession>;

/** `GET /cash-sessions?status=&businessDate=&branchId=`: hasta 100, el más reciente primero. */
export const CashSessionList = z.object({ sessions: z.array(CashSession) });
export type CashSessionList = z.infer<typeof CashSessionList>;

/**
 * `GET /cash-sessions/open-lite?branchId=`: las cajas abiertas de la sede
 * para ELEGIR en cuál entra un cobro (7-03). Lo pide quien cobra
 * (`payments:record`), lleve Caja o no: solo nombres, sin cortes ni esperado.
 */
export const OpenCashSessionLite = z.object({
  id: Id,
  cashRegisterId: Id,
  registerCode: z.string(),
  registerName: z.string(),
  openedByUserId: Id,
  openedByName: z.string().nullable(),
  openedAt: Instante,
});
export type OpenCashSessionLite = z.infer<typeof OpenCashSessionLite>;
export const OpenCashSessionsLite = z.object({ sessions: z.array(OpenCashSessionLite) });
export type OpenCashSessionsLite = z.infer<typeof OpenCashSessionsLite>;

/** Un movimiento del cajón que no es un cobro. */
export const CashMovement = z.object({
  id: Id,
  movementType: CashMovementTypeSchema,
  /** Con signo: negativo = sale del cajón. */
  amountCents: Centavos,
  amountLabel: z.string(),
  reason: z.string(),
  createdByUserId: Id,
  approvedByUserId: Id.nullable(),
  at: Instante,
});
export type CashMovement = z.infer<typeof CashMovement>;

const PorMetodo = z.array(z.object({ method: PaymentMethodSchema, amountCents: Centavos }));

/**
 * `GET /cash-sessions/:id`: el corte del turno.
 *
 * CORTE CIEGO (`blind: true`): con el turno abierto y sin
 * `cash:variance:approve` (recepción), quien cuenta no ve cuánto debería
 * haber. Llegan en `null` lo cobrado y lo esperado, y sin la fila de
 * efectivo en `byMethod`. El fondo y los movimientos sí se ven. Un turno
 * cerrado nunca es ciego.
 */
export const ShiftReport = z.object({
  session: CashSession,
  register: z.object({ id: Id, code: z.string(), name: z.string() }),
  /** Cobros y ventas sumados por método (las reversas restan). */
  byMethod: PorMetodo,
  /** Lo que aporta cada módulo; hoy solo el punto de venta (`POS`). */
  contributions: z.array(z.object({ source: z.string(), byMethod: PorMetodo })),
  totalCollectedCents: Centavos.nullable(),
  cashCollectedCents: Centavos.nullable(),
  /** Suma con signo de los movimientos del cajón. */
  movementsCents: Centavos,
  movements: z.array(CashMovement),
  expectedCashCents: Centavos.nullable(),
  expectedCashLabel: z.string().nullable(),
  blind: z.boolean(),
  countedCashCents: Centavos.nullable(),
  varianceCents: Centavos.nullable(),
});
export type ShiftReport = z.infer<typeof ShiftReport>;

/** `POST /cash-sessions/:id/close`: el turno cerrado con su diferencia (nunca nula: `"0"` si cuadró). */
export const CloseCashSessionResult = CashSession.extend({
  varianceCents: Centavos,
  varianceLabel: z.string(),
  varianceKind: z.enum(['EXACT', 'SHORT', 'OVER']),
});
export type CloseCashSessionResult = z.infer<typeof CloseCashSessionResult>;
