import { z } from 'zod';
import { Centavos, Fecha, Id, Instante } from './comun.js';
import { MemberStatusSchema, MembershipStatusSchema } from './enums.js';

/**
 * SOCIOS (`members/members.routes.ts`, `serializeMember`; el resumen de acceso
 * en `memberships/membership.routes.ts`).
 *
 * Antes el panel tenía el tipo `Member` escrito a mano en seis lugares (2-13,
 * 27-09), cada uno con otros campos opcionales.
 *
 * Lo que su puesto no ve llega en `null`, y `hidden` dice QUÉ se ocultó
 * (2.13): un `null` con su parte en `hidden` es «no visible para tu puesto»,
 * no «no tiene». El contacto (`phoneE164`, `email`, `emergencyContact*`) pide
 * `members:update` o `members:create` en la sede de casa del socio, y el
 * saldo (`balanceCents`) pide `billing:statement:read` ahí. El coach nunca
 * los recibe; recepción, solo de los socios de su sede.
 */

/** Las partes de un socio que se ocultan por permiso: `contact` (teléfono, correo y contacto de emergencia) y `balance` (el saldo). */
export const MEMBER_HIDDEN_PARTS = ['contact', 'balance'] as const;
export type MemberHiddenPart = (typeof MEMBER_HIDDEN_PARTS)[number];

/** Un socio como lo devuelven la búsqueda, el padrón y la ficha. */
export const MemberSummary = z.object({
  id: Id,
  /** CEN-00042: prefijo de la sede de alta y un número. */
  memberCode: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phoneE164: z.string().nullable(),
  email: z.string().nullable(),
  birthDate: Fecha.nullable(),
  status: MemberStatusSchema,
  homeBranchId: Id.nullable(),
  /** Desde cuándo viene (ISO con hora). */
  joinedAt: Instante,
  emergencyContactName: z.string().nullable(),
  emergencyContactPhone: z.string().nullable(),
  anonymizedAt: Instante.nullable(),
  /** Lo que debe: positivo = debe, negativo = saldo a favor. `null` = su puesto no ve el dinero de ese socio. */
  balanceCents: Centavos.nullable(),
  /** Lo que el servidor ocultó a quien pregunta. Vacío: lo ve todo, y un `null` es «no tiene». */
  hidden: z.array(z.enum(MEMBER_HIDDEN_PARTS)),
});
export type MemberSummary = z.infer<typeof MemberSummary>;

/**
 * `GET /members/search?q=&limit=`: por nombre, código o teléfono, con
 * parecido. Incluye dados de baja (`status: 'ARCHIVED'`). La búsqueda no lee
 * el contacto de emergencia ni la anonimización: llegan siempre en `null`.
 */
export const MemberSearchResult = MemberSummary.extend({
  /** De 0 a 1, con tres decimales: ordena los resultados. */
  similarity: z.number(),
});
export type MemberSearchResult = z.infer<typeof MemberSearchResult>;

export const MemberSearchResponse = z.object({
  /** Lo que se buscó, tal como llegó. */
  query: z.string(),
  elapsedMs: z.number(),
  results: z.array(MemberSearchResult),
});
export type MemberSearchResponse = z.infer<typeof MemberSearchResponse>;

/**
 * `GET /members?status=&branchId=&withDebt=&q=&limit=&cursor=`: el padrón,
 * de 50 en 50 por apellido. Sin dados de baja. `nextCursor` viene siempre que
 * la página llegó llena, aunque la siguiente salga vacía.
 */
export const MemberListPage = z.object({
  members: z.array(MemberSummary),
  /** Cuántos hay con esos filtros (sin contar el cursor). */
  total: z.number().int(),
  nextCursor: z.string().nullable(),
});
export type MemberListPage = z.infer<typeof MemberListPage>;

/** `GET /members/:id`: la ficha. Incluye dados de baja y anonimizados. */
export const MemberDetail = MemberSummary.extend({
  /** Su coach asignado; `null` = sin coach. */
  coachUserId: Id.nullable(),
});
export type MemberDetail = z.infer<typeof MemberDetail>;

// ── ¿Puede entrar hoy? GET /members/access-summary?ids= ─────────────────────

export const AccessSummaryMembership = z.object({
  /** La membresía viva más reciente: nunca cancelada ni terminada. */
  status: MembershipStatusSchema.exclude(['CANCELED', 'EXPIRED']),
  planName: z.string().nullable(),
  /** El último día que cubre su periodo actual (no el fin semiabierto). */
  coveredThrough: Fecha,
  /** El último día de un periodo SALDADO (pago o condonación); un abono no lo cubre. */
  paidThrough: Fecha.nullable(),
  /** Hasta cuándo entra debiendo (gracia, ADR-012). */
  graceUntil: Fecha.nullable(),
});
export type AccessSummaryMembership = z.infer<typeof AccessSummaryMembership>;

export const AccessSummaryPack = z.object({
  status: z.enum(['ACTIVE', 'PENDING_PAYMENT']),
  visitsLeft: z.number().int(),
  expiresOn: Fecha.nullable(),
});
export type AccessSummaryPack = z.infer<typeof AccessSummaryPack>;

export const AccessSummaryItem = z.object({
  memberId: Id,
  membership: AccessSummaryMembership.nullable(),
  pack: AccessSummaryPack.nullable(),
  /** Su pase del día de HOY, pagado (1.8): la sede donde abre. `null` si no trae. */
  dayPass: z.object({ branchId: Id, validOn: Fecha }).nullable(),
  /** La misma regla que la puerta (`grantsAccess` y la política de mora del gimnasio); con pase de hoy, en la sede del pase. */
  canEnter: z.boolean(),
});
export type AccessSummaryItem = z.infer<typeof AccessSummaryItem>;

/** Uno por cada id pedido, en el mismo orden; un id ajeno vuelve vacío y con `canEnter: false`. */
export const AccessSummaryResponse = z.object({
  /** Política del gimnasio: ¿entra quien está en gracia? */
  allowAccessWhilePastDue: z.boolean(),
  members: z.array(AccessSummaryItem),
});
export type AccessSummaryResponse = z.infer<typeof AccessSummaryResponse>;
