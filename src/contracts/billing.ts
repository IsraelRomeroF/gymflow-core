import { z } from 'zod';
import { Centavos, Fecha, Id, Instante } from './comun.js';
import { ChargeStatusSchema, ChargeTypeSchema, MembershipStatusSchema, PaymentMethodSchema, PaymentStatusSchema } from './enums.js';
import { Pagina, RestoDeLista } from './lista.js';

/**
 * DINERO DEL SOCIO: cargos, pagos, estado de cuenta, recibo y membresías
 * (`billing/billing.serializers.ts`, `billing/charges.routes.ts`,
 * `billing/payments.routes.ts`, `memberships/membership.routes.ts`).
 *
 * Todo importe va en centavos como texto. Cada importe con `…Label` trae
 * además el texto ya formateado (`$1,234.50`, `-$50.00`).
 */

/** Un cargo (`serializeCharge`). */
export const Charge = z.object({
  id: Id,
  memberId: Id,
  membershipId: Id.nullable(),
  branchId: Id.nullable(),
  chargeType: ChargeTypeSchema,
  status: ChargeStatusSchema,
  /** El periodo va con fin semiabierto: «Mensualidad · 2026-11-19 a 2026-12-19» cubre hasta el 18. */
  concept: z.string(),
  subtotalCents: Centavos,
  taxCents: Centavos,
  discountCents: Centavos,
  /** Subtotal + impuesto − descuento. */
  amountCents: Centavos,
  allocatedCents: Centavos,
  adjustedCents: Centavos,
  /**
   * Importe − asignado − ajustado, nunca negativo, y 0 en un cargo anulado
   * (`VOID`) o castigado (`WRITTEN_OFF`): ya no se debe (1.3). Lo que se
   * debe en total es `MemberStatement.outstandingCents`.
   */
  balanceCents: Centavos,
  amountLabel: z.string(),
  periodStart: Fecha.nullable(),
  periodEnd: Fecha.nullable(),
  dueDate: Fecha,
  createdAt: Instante,
});
export type Charge = z.infer<typeof Charge>;

/** Un pago o un contra-asiento (`serializePayment`). */
export const Payment = z.object({
  id: Id,
  memberId: Id,
  branchId: Id.nullable(),
  method: PaymentMethodSchema,
  status: PaymentStatusSchema,
  /** NEGATIVO en una reversa o un reembolso. */
  amountCents: Centavos,
  /** Lo que le queda HOY sin aplicar a ningún cargo. */
  unappliedCents: Centavos,
  amountLabel: z.string(),
  externalRef: z.string().nullable(),
  /** Solo cobros en efectivo o terminal en una sede con Caja. */
  folio: z.string().nullable(),
  cashSessionId: Id.nullable(),
  receivedAt: Instante,
  businessDate: Fecha,
  reversesPaymentId: Id.nullable(),
  reversalReason: z.string().nullable(),
});
export type Payment = z.infer<typeof Payment>;

/** La membresía que importa para cobrar y abrir la puerta (viva o suspendida). */
export const CollectionMembership = z.object({
  id: Id,
  status: MembershipStatusSchema.exclude(['CANCELED', 'EXPIRED']),
  /** ¿Pasa hoy? La misma regla que la puerta. */
  canEnter: z.boolean(),
  /** El último día de un periodo SALDADO (3-01). */
  paidThrough: Fecha.nullable(),
});
export type CollectionMembership = z.infer<typeof CollectionMembership>;

/** Qué le falta pagar para entrar (`serializeEstadoParaCobro`). */
export const CollectionState = z.object({
  membership: CollectionMembership.nullable(),
  /** Solo si hoy no pasa y hay una cuota o inscripción abierta: lo que debe cubrir para entrar. */
  toEnterCents: Centavos.nullable(),
});
export type CollectionState = z.infer<typeof CollectionState>;

// ── Estado de cuenta ────────────────────────────────────────────────────────

/** Un ajuste sobre un cargo (`serializeAdjustment`): descuento, condonación, recargo o corrección, con quién lo autorizó. */
export const ChargeAdjustment = z.object({
  id: Id,
  chargeId: Id,
  adjustmentType: z.enum(['DISCOUNT', 'WAIVER', 'LATE_FEE', 'CORRECTION']),
  /** Siempre positivo: un ajuste solo rebaja la deuda. */
  amountCents: Centavos,
  reasonCode: z.string().nullable(),
  reason: z.string(),
  approvedByUserId: Id.nullable(),
  /** El nombre de quien autorizó, para leerlo sin ir a la bitácora; `null` si no hizo falta firma. */
  approvedByName: z.string().nullable(),
  createdAt: Instante,
});
export type ChargeAdjustment = z.infer<typeof ChargeAdjustment>;

/** `GET /charges/:id/adjustments`. */
export const ChargeAdjustmentList = z.object({ adjustments: z.array(ChargeAdjustment) });
export type ChargeAdjustmentList = z.infer<typeof ChargeAdjustmentList>;

/**
 * CÓMO QUEDÓ SALDADO un cargo (3-06). El estado dice `PAID` tanto si el socio
 * pagó como si se le perdonó todo (una condonación total deja el cargo PAID, no
 * WRITTEN_OFF). Panel, portal y descarga ARCO leen esto y dicen la misma palabra.
 */
export const SETTLED_BY = ['PAYMENT', 'WAIVER', 'DISCOUNT', 'MIXED', 'CORRECTION'] as const;
export const SettledBySchema = z.enum(SETTLED_BY);
export type SettledBy = z.infer<typeof SettledBySchema>;

/** Un cargo en el estado de cuenta: el cargo más cómo quedó saldado y sus ajustes, plegables. */
export const StatementCharge = Charge.extend({
  /**
   * `PAYMENT` lo pagó; `WAIVER` se le condonó (también los `WRITTEN_OFF`);
   * `DISCOUNT` se saldó solo con descuento; `MIXED` pagó una parte y el resto
   * se descontó o condonó; `CORRECTION` lo cubrió una corrección sin dinero
   * ni perdón (el crédito por los días no usados al cambiar de plan). `null`
   * mientras deba algo, o si se anuló (`VOID`).
   *
   * Es la palabra para la PANTALLA. Para ingresos y «pagado hasta» la regla es
   * `liquidadoPor` del núcleo, más gruesa: su `PAYMENT` junta `PAYMENT` y
   * `MIXED`; su `WAIVER`, `WAIVER` y `DISCOUNT`; su `REFUND_CORRECTION` es
   * `CORRECTION`. Un castigado aquí dice `WAIVER` y allá no cuenta.
   */
  settledBy: SettledBySchema.nullable(),
  adjustments: z.array(ChargeAdjustment),
});
export type StatementCharge = z.infer<typeof StatementCharge>;

/** Un pago en el estado de cuenta: quién lo cobró y qué cargos cubrió (3-05). */
export const StatementPayment = Payment.extend({
  collectedByUserId: Id.nullable(),
  /** Quien lo registró; `null` si lo registró el sistema (domiciliación, portal) o ya no existe. */
  collectedByName: z.string().nullable(),
  /** A qué se aplicó, con el concepto del cargo. Vacío si quedó todo a favor. En un contra-asiento los importes van en negativo: lo que dejó de cubrir. */
  covers: z.array(z.object({ chargeId: Id, concept: z.string(), amountCents: Centavos })),
});
export type StatementPayment = z.infer<typeof StatementPayment>;

/** `GET /members/:id/statement/charges?cursor=&limit=`: la siguiente página de cargos, por vencimiento descendente. */
export const StatementChargesPage = Pagina(StatementCharge);
export type StatementChargesPage = z.infer<typeof StatementChargesPage>;
/** `GET /members/:id/statement/payments?cursor=&limit=`: la siguiente página de pagos, por fecha de cobro descendente. */
export const StatementPaymentsPage = Pagina(StatementPayment);
export type StatementPaymentsPage = z.infer<typeof StatementPaymentsPage>;

/**
 * `GET /members/:id/statement?limit=`: el estado de cuenta del socio para el personal.
 *
 * `charges` y `payments` siguen siendo listas (las leen el cobro, la venta y
 * los recorridos): traen la PRIMERA página, lo más reciente. `pages` dice
 * cuántos hay en total y cómo pedir los demás; antes se cortaban en 50 y 50
 * sin avisar (3-04, 4-15).
 */
export const MemberStatement = z.object({
  memberId: Id,
  /** Lo que debe de los cargos abiertos; nunca negativo. */
  outstandingCents: Centavos,
  /** Saldo a favor sin aplicar. */
  creditCents: Centavos,
  /** Debe menos a favor. NEGATIVO = tiene saldo a favor. */
  netBalanceCents: Centavos,
  netBalanceLabel: z.string(),
  /**
   * Los cargos más recientes por vencimiento (50 por omisión), también
   * anulados y condonados, MÁS todo cargo con deuda aunque sea más viejo: lo
   * que se debe nunca queda fuera de la primera respuesta. Al pedir las
   * páginas siguientes, esos cargos viejos vuelven a venir en su lugar: la
   * pantalla junta por `id`.
   */
  charges: z.array(StatementCharge),
  /** Los pagos más recientes por fecha de cobro, con contra-asientos y cualquier estado. */
  payments: z.array(StatementPayment),
  /** Cuántos cargos y pagos hay en total y el cursor de la página que sigue a esta. */
  pages: z.object({ charges: RestoDeLista, payments: RestoDeLista }),
  /** La fecha de negocio de la sede de casa del socio: «hoy le toca pagar» se dice con ella. */
  today: Fecha,
  cobro: CollectionState,
});
export type MemberStatement = z.infer<typeof MemberStatement>;

/** `POST /members/:id/payments`: 201 al cobrar, 200 en un reintento con la misma `idempotencyKey` (mismo cuerpo). */
export const RecordPaymentResult = z.object({
  payment: Payment,
  /** A qué cargos se aplicó. En un reintento, todas las asignaciones actuales del pago. */
  allocations: z.array(z.object({ chargeId: Id, amountCents: Centavos })),
  unappliedCents: Centavos,
  /** Saldo a favor que se aplicó antes de repartir el pago. */
  creditAppliedCents: Centavos,
  created: z.boolean(),
  /** Cómo queda para entrar después de cobrar. */
  membership: CollectionMembership.nullable(),
  toEnterCents: Centavos.nullable(),
});
export type RecordPaymentResult = z.infer<typeof RecordPaymentResult>;

/**
 * `POST /members/:id/credit/apply` (2.13): aplica el saldo a favor del socio a
 * lo que debe, SIN cobro. No entra dinero: lo que ya había pagado de más se
 * reparte entre sus cargos abiertos, del más antiguo al más nuevo. Repetirla
 * no hace nada (`appliedCents: "0"`).
 */
export const ApplyCreditResult = z.object({
  /** Lo que se aplicó en esta llamada. */
  appliedCents: Centavos,
  /** Saldo a favor que le queda. */
  creditCents: Centavos,
  /** Lo que sigue debiendo. */
  outstandingCents: Centavos,
  /** Cómo queda para entrar. */
  membership: CollectionMembership.nullable(),
  toEnterCents: Centavos.nullable(),
});
export type ApplyCreditResult = z.infer<typeof ApplyCreditResult>;

/** `GET /payments/:id/receipt`: lo que se imprime. */
export const PaymentReceipt = z.object({
  payment: Payment,
  /** `null` si el socio ya está dado de baja. */
  member: z.object({ id: Id, memberCode: z.string(), fullName: z.string() }).nullable(),
  /** Una por asignación del pago. */
  lines: z.array(z.object({ concept: z.string(), amountCents: Centavos })),
  /** Qué membresía cubre y hasta cuándo; `null` si no cubre ninguna o es un contra-asiento. */
  coverage: z.object({ planName: z.string().nullable(), paidThrough: Fecha.nullable() }).nullable(),
  /** Quién lo cobró (3-05; bloque 2.2): `null` si lo registró el sistema (domiciliación, portal) o la cuenta ya no existe. */
  collectedByName: z.string().nullable(),
  /**
   * El aviso de un cambio de precio de su plan (D-19, bloque 3.6): `UPCOMING`
   * si lo pagará desde su siguiente pago, `APPLIED` si este es el primer pago
   * al precio nuevo. `null` (o ausente) si no hay nada que avisar.
   */
  priceNotice: z.object({
    kind: z.enum(['UPCOMING', 'APPLIED']),
    planName: z.string().nullable(),
    fromPriceCents: Centavos,
    toPriceCents: Centavos,
  }).nullable().optional(),
});
export type PaymentReceipt = z.infer<typeof PaymentReceipt>;

// ── Membresías ──────────────────────────────────────────────────────────────

/** Una membresía (`serialize` de `memberships/membership.routes.ts`). */
export const Membership = z.object({
  id: Id,
  memberId: Id,
  planId: Id,
  soldAtBranchId: Id.nullable(),
  status: MembershipStatusSchema,
  startDate: Fecha,
  currentPeriodStart: Fecha,
  /** Fin SEMIABIERTO: este día ya no está cubierto. */
  currentPeriodEnd: Fecha,
  /** El último día del periodo en curso, PAGADO O NO: la vigencia que mira la puerta. */
  coveredThrough: Fecha,
  /** Solo en el historial del socio: el último día de cuotas saldadas (3-01). */
  paidThrough: Fecha.nullable().optional(),
  /** Solo en el historial y de una suspendida: periodos que no recorrió (4-08). */
  missedPeriods: z.number().int().nullable().optional(),
  billingAnchorDay: z.number().int(),
  graceUntil: Fecha.nullable(),
  autoRenew: z.boolean(),
  frozenDaysUsedThisYear: z.number().int(),
  frozenSince: Fecha.nullable(),
  frozenUntil: Fecha.nullable(),
  replacesMembershipId: Id.nullable(),
  cancellationReason: z.string().nullable(),
  /** Derivado del estado, nunca guardado. */
  grantsAccess: z.boolean(),
});
export type Membership = z.infer<typeof Membership>;

/** `GET /members/:id/memberships`: el historial, con «pagado hasta» y atrasos de cada una. */
export const MemberMemberships = z.array(Membership.extend({
  paidThrough: Fecha.nullable(),
  missedPeriods: z.number().int().nullable(),
}));
export type MemberMemberships = z.infer<typeof MemberMemberships>;
