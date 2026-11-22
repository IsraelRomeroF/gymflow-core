import { z } from 'zod';
import type { AccessOutcome, DenialReason } from '../access.js';
import type { ChargeStatus, ChargeType, PaymentMethodType, PaymentStatus } from '../billing.js';
import type { BiometricModality, EnrollmentGap } from '../biometrics.js';
import type { CashMovementType, CashSessionStatus } from '../cash.js';
import type { MembershipStatus, VisitPackStatus } from '../membership.js';
import type { InventoryMovementType, PosSaleStatus } from '../pos.js';
import { FOLLOW_UP_CHANNELS, FOLLOW_UP_OUTCOMES, type EngagementState, type ExceptionAction } from '../retention.js';

/**
 * Los códigos que viajan en los contratos, como listas para Zod. Cada lista
 * se comprueba contra el tipo del dominio: si el núcleo agrega un estado y
 * aquí falta (o sobra uno), el núcleo deja de compilar.
 */

/** `true` solo si A y B son exactamente el mismo tipo. */
type Igual<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
/** Falla al compilar si la lista no cubre exactamente el tipo. */
function exacta<T>() {
  return <const L extends readonly [T, ...T[]]>(lista: L & (Igual<L[number], T> extends true ? unknown : 'la lista no coincide con el tipo del dominio')) => lista;
}

/** Estado del socio. En la base es el enum `MemberStatus` (el núcleo no tiene tipo propio). */
export const MEMBER_STATUSES = ['PROSPECT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];
export const MemberStatusSchema = z.enum(MEMBER_STATUSES);

export const MEMBERSHIP_STATUSES = exacta<MembershipStatus>()(['PENDING', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'FROZEN', 'SUSPENDED', 'CANCELED', 'EXPIRED']);
export const MembershipStatusSchema = z.enum(MEMBERSHIP_STATUSES);

export const VISIT_PACK_STATUSES = exacta<VisitPackStatus>()(['PENDING_PAYMENT', 'ACTIVE', 'EXHAUSTED', 'EXPIRED', 'FROZEN']);
export const VisitPackStatusSchema = z.enum(VISIT_PACK_STATUSES);

export const PAYMENT_METHODS = exacta<PaymentMethodType>()(['CASH', 'CARD_TERMINAL', 'CARD_ON_FILE', 'SPEI_TRANSFER', 'OXXO_REF', 'CREDIT_NOTE']);
export const PaymentMethodSchema = z.enum(PAYMENT_METHODS);

export const PAYMENT_STATUSES = exacta<PaymentStatus>()(['INITIATED', 'PROCESSING', 'REQUIRES_ACTION', 'SUCCEEDED', 'FAILED', 'UNKNOWN', 'CANCELED', 'REVERSED']);
export const PaymentStatusSchema = z.enum(PAYMENT_STATUSES);

export const CHARGE_TYPES = exacta<ChargeType>()([
  'MEMBERSHIP_PERIOD', 'SIGNUP_FEE', 'VISIT_PACK', 'DAY_PASS', 'CLASS_SINGLE', 'NO_SHOW_PENALTY', 'POS_SALE',
  'PRORATION_ADJUSTMENT', 'OPENING_BALANCE', 'MANUAL_ADJUSTMENT',
]);
export const ChargeTypeSchema = z.enum(CHARGE_TYPES);

export const CHARGE_STATUSES = exacta<ChargeStatus>()(['DRAFT', 'OPEN', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID', 'WRITTEN_OFF']);
export const ChargeStatusSchema = z.enum(CHARGE_STATUSES);

export const CASH_SESSION_STATUSES = exacta<CashSessionStatus>()(['OPEN', 'CLOSED', 'RECONCILED']);
export const CashSessionStatusSchema = z.enum(CASH_SESSION_STATUSES);

export const CASH_MOVEMENT_TYPES = exacta<CashMovementType>()(['FLOAT_IN', 'WITHDRAWAL', 'EXPENSE', 'DEPOSIT', 'CORRECTION']);
export const CashMovementTypeSchema = z.enum(CASH_MOVEMENT_TYPES);

export const POS_SALE_STATUSES = exacta<PosSaleStatus>()(['COMPLETED', 'VOIDED']);
export const PosSaleStatusSchema = z.enum(POS_SALE_STATUSES);

export const INVENTORY_MOVEMENT_TYPES = exacta<InventoryMovementType>()(['PURCHASE', 'SALE', 'SALE_VOIDED', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT', 'SHRINKAGE']);
export const InventoryMovementTypeSchema = z.enum(INVENTORY_MOVEMENT_TYPES);

export const ACCESS_OUTCOMES = exacta<AccessOutcome>()(['GRANTED', 'DENIED']);
export const AccessOutcomeSchema = z.enum(ACCESS_OUTCOMES);

export const DENIAL_REASONS = exacta<DenialReason>()([
  'MEMBER_UNKNOWN', 'MEMBER_ARCHIVED', 'NO_MEMBERSHIP', 'MEMBERSHIP_PAST_DUE', 'MEMBERSHIP_FROZEN', 'MEMBERSHIP_SUSPENDED',
  'MEMBERSHIP_ENDED', 'BRANCH_NOT_ALLOWED', 'OUTSIDE_TIME_WINDOW', 'NO_VISITS_LEFT', 'VISIT_PACK_EXPIRED', 'VISIT_PACK_UNPAID',
  'CREDENTIAL_REVOKED', 'CREDENTIAL_EXPIRED', 'DUPLICATE_SCAN',
]);
export const DenialReasonSchema = z.enum(DENIAL_REASONS);

export const BIOMETRIC_MODALITIES = exacta<BiometricModality>()(['FACE', 'FINGERPRINT']);
export const BiometricModalitySchema = z.enum(BIOMETRIC_MODALITIES);

export const ENROLLMENT_GAPS = exacta<EnrollmentGap>()(['NO_CONSENT', 'NO_BRANCH', 'NO_ALGORITHM', 'NO_ENROLLER', 'REVOKED']);
export const EnrollmentGapSchema = z.enum(ENROLLMENT_GAPS);

export const EXCEPTION_ACTIONS = exacta<ExceptionAction>()(['COLLECT_AND_OPEN', 'GRANT_ONCE', 'REFUSE']);
export const ExceptionActionSchema = z.enum(EXCEPTION_ACTIONS);

/** El hábito de un socio en Retención (`classifyEngagement`). */
export const ENGAGEMENT_STATES = exacta<EngagementState>()(['NEW', 'ONBOARDING_AT_RISK', 'REGULAR', 'SLIPPING', 'DORMANT', 'LOST']);
export const EngagementStateSchema = z.enum(ENGAGEMENT_STATES);

/** Canal y resultado de «le llamé» (`follow_ups`): las listas viven en el dominio (`retention.ts`). */
export const FollowUpChannelSchema = z.enum(FOLLOW_UP_CHANNELS);
export const FollowUpOutcomeSchema = z.enum(FOLLOW_UP_OUTCOMES);
