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
  /**
   * D-17 (bloque 4.3). El descuadre es de quien ABRIÓ el turno, lo corte quien
   * lo corte: `responsibleUserId` es siempre `openedByUserId`, dicho con su
   * nombre para que la hoja no obligue a deducirlo.
   */
  responsibleUserId: Id,
  responsibleName: z.string().nullable(),
  /**
   * La revisión de la diferencia: `PENDING` si el corte cerró con más de $20
   * de diferencia (falte o sobre) y la gerencia no lo ha revisado; `REVIEWED`
   * cuando lo cerró con su nota; `null` si no la necesita (cuadró, quedó
   * dentro de la tolerancia, el turno sigue abierto o el corte es anterior a la regla).
   */
  varianceStatus: z.enum(['PENDING', 'REVIEWED']).nullable(),
  varianceReviewedByUserId: Id.nullable(),
  varianceReviewedByName: z.string().nullable(),
  varianceReviewedAt: Instante.nullable(),
  varianceReviewNote: z.string().nullable(),
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
  /**
   * El retiro es un «Retiro del dueño» (bloque 4.3): salió del cajón y en el
   * mismo acto quedó anotado en Movimientos (`operating_expenses`, `OWNER_DRAW`).
   */
  ownerDraw: z.boolean(),
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

// ── D-17 · Caja, fase 4 (bloque 4.3) ────────────────────────────────────────

/**
 * `GET /cash-sessions/:id/allowance`: lo que a ESTA persona le queda por mover
 * en ESTE turno, para decirlo ANTES de pedir la firma (defecto D1 de 3.13: el
 * 403 llegaba después de que la dueña tecleaba su contraseña).
 *
 * No revela nada del corte ciego: son topes y lo ya anotado, no el efectivo.
 */
export const CashShiftAllowance = z.object({
  sessionId: Id,
  withdrawal: z.object({
    /** `SIN_TOPE` la gerencia; `CON_TOPE` recepción; `NO_PUEDE` un puesto con el retiro en cero. */
    role: z.enum(['SIN_TOPE', 'CON_TOPE', 'NO_PUEDE']),
    /** El tope del gimnasio por turno para un puesto con tope; `null` sin tope. */
    limitCents: Centavos.nullable(),
    /** Lo que esta persona ya retiró o depositó en este turno. */
    usedCents: Centavos,
    /** Lo que le queda: un importe mayor NO pasa ni con firma. `null` = sin tope. */
    remainingCents: Centavos.nullable(),
  }),
  /** Fondo y gasto chico sin firma: lo que queda del tope del turno, por tipo. */
  petty: z.object({
    limitCents: Centavos,
    floatInRemainingCents: Centavos,
    expenseRemainingCents: Centavos,
  }),
});
export type CashShiftAllowance = z.infer<typeof CashShiftAllowance>;

/** Una caja que sigue abierta. `stale`: se abrió en un día de negocio anterior al de hoy de su sede (amaneció sin cortar). */
export const UnclosedCashSession = z.object({
  id: Id,
  branchId: Id,
  branchName: z.string(),
  registerName: z.string(),
  openedByUserId: Id,
  openedByName: z.string().nullable(),
  openedAt: Instante,
  businessDate: Fecha,
  stale: z.boolean(),
});
export type UnclosedCashSession = z.infer<typeof UnclosedCashSession>;

/**
 * `GET /cash/alerts[?branchId=]`: lo que la caja tiene sin resolver, en las
 * sedes de quien pregunta. Lo leen la vista «Cortes» de la dueña y el Inicio
 * de la gerencia; el aviso al teléfono de la dueña (bloque 4.2) sale del mismo
 * servicio (`CashAlertsService`).
 */
export const CashAlerts = z.object({
  asOf: Instante,
  /** Todas las abiertas, la más vieja primero. Las que amanecieron sin cortar traen `stale`. */
  open: z.array(UnclosedCashSession),
  /** Cuántas de `open` son de un día anterior. */
  staleCount: z.number().int(),
  pendingVariances: z.object({
    count: z.number().int(),
    /** Suma de los faltantes por revisar, en positivo. */
    shortageCents: Centavos,
    /** Suma de los sobrantes por revisar. */
    overageCents: Centavos,
    /** El día de negocio del más antiguo. */
    oldestBusinessDate: Fecha.nullable(),
  }),
});
export type CashAlerts = z.infer<typeof CashAlerts>;

/** `POST /cash-sessions/:id/owner-draw` (201): el retiro del cajón y su anotación en Movimientos, hechos juntos. */
export const OwnerDrawFromDrawer = z.object({
  movement: CashMovement,
  /** El «Retiro del dueño» que quedó en Movimientos. */
  expenseId: Id,
  /** El mes en que quedó anotado (AAAA-MM). */
  month: z.string(),
});
export type OwnerDrawFromDrawer = z.infer<typeof OwnerDrawFromDrawer>;
