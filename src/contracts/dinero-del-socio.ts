import { z } from 'zod';
import { Centavos, Fecha, Id } from './comun.js';
import { Payment } from './billing.js';

/**
 * DINERO DEL SOCIO, FASE 3 (bloque 3.5 · D-12 a D-16): lo que se le debe, lo
 * que se le puede perdonar sin firma, lo que queda a su favor al cancelar y
 * las devoluciones (`billing/perdon.routes.ts`, `billing/devolucion.routes.ts`).
 */

/** Cuánto se le puede perdonar a un socio sin la firma de la dueña (D-12). */
export const WaiverAllowance = z.object({
  /** Una mensualidad suya: el tope. `null` si nunca tuvo plan: todo perdón lleva firma. */
  monthlyCents: Centavos.nullable(),
  /** Lo ya perdonado sin firma en los últimos 30 días. */
  usedCents: Centavos,
  /** Lo que queda: perdonar hasta aquí no pide firma. */
  availableCents: Centavos,
  /** Los días de la ventana (30). */
  windowDays: z.number().int(),
});
export type WaiverAllowance = z.infer<typeof WaiverAllowance>;

/** `GET /members/:id/debt`: lo que debe hoy y qué pasaría al perdonárselo (D-12). */
export const MemberDebt = z.object({
  memberId: Id,
  outstandingCents: Centavos,
  /** Saldo a favor sin aplicar. */
  creditCents: Centavos,
  charges: z.array(z.object({
    id: Id, membershipId: Id.nullable(), concept: z.string(), dueDate: Fecha, balanceCents: Centavos,
  })),
  waiver: WaiverAllowance,
  /** ¿Perdonar TODO lo que debe hoy pide la firma de la dueña? */
  waiveAllNeedsApproval: z.boolean(),
});
export type MemberDebt = z.infer<typeof MemberDebt>;

/** `POST /members/:id/debt/waiver`: el adeudo perdonado, cargo por cargo y con su monto (D-12). */
export const DebtWaiverResult = z.object({
  memberId: Id,
  forgivenCents: Centavos,
  charges: z.array(z.object({ id: Id, concept: z.string(), forgivenCents: Centavos })),
  /** Quién firmó, si hizo falta. */
  approvedByUserId: Id.nullable(),
  outstandingCents: Centavos,
});
export type DebtWaiverResult = z.infer<typeof DebtWaiverResult>;

// ── D-13 · Devolver dinero ──────────────────────────────────────────────────

/** `POST /payments/:id/return`: el contra-asiento de la devolución (201; 200 si es el reintento del mismo envío). */
export const PaymentReturnResult = z.object({
  /** El contra-asiento: importe NEGATIVO, con el folio y el turno del que salió el dinero. */
  entry: Payment,
  /** Lo que todavía se le podría devolver de ese cobro. */
  remainingCents: Centavos,
});
export type PaymentReturnResult = z.infer<typeof PaymentReturnResult>;

/** `POST /members/:id/credit/return`: el saldo a favor devuelto en dinero (201; 200 en el reintento). */
export const CreditReturnResult = z.object({
  memberId: Id,
  returnedCents: Centavos,
  /** Un contra-asiento por cada pago del que salió el saldo. */
  entries: z.array(Payment),
  /** Lo que le queda a favor. */
  creditCents: Centavos,
});
export type CreditReturnResult = z.infer<typeof CreditReturnResult>;

// ── D-15 · Los topes del cajón ──────────────────────────────────────────────

/** `GET /cash/limits` y `PUT /cash/limits`: los topes del cajón del gimnasio (D-15). */
export const CashLimits = z.object({
  /** Fondo y gastos que se anotan con motivo y sin firma, por turno y por tipo. */
  pettyLimitCents: Centavos,
  /** Lo que recepción puede retirar o depositar por turno, siempre con firma. */
  withdrawalShiftLimitCents: Centavos,
  /** `true` si el gimnasio nunca los cambió: valen los de fábrica ($500 y $5,000). */
  isDefault: z.boolean(),
  /** Hasta dónde se pueden subir. */
  max: z.object({ pettyLimitCents: Centavos, withdrawalShiftLimitCents: Centavos }),
});
export type CashLimits = z.infer<typeof CashLimits>;
