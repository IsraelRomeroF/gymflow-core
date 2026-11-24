import { z } from 'zod';
import { Fecha, Id, Instante } from './comun.js';
import { EngagementStateSchema, FollowUpChannelSchema, FollowUpOutcomeSchema } from './enums.js';
import { MemberTermValues } from './plazos.js';

/**
 * RETENCIÓN Y SEGUIMIENTO (`retention/retention.routes.ts`,
 * `follow-ups/follow-ups.routes.ts`; auditoría 8, informe 15, bloque 1.15).
 *
 * Antes la pantalla de Retención tenía sus propios `Alerta` y `Reporte`
 * escritos a mano y el Tablero otro `counts` sin tipo (15-19 del consolidado).
 */

/** Cuántos socios hay en cada estado de hábito. Siempre las seis llaves, con cero si no hay. */
export const RetentionCounts = z.object({
  NEW: z.number().int(),
  ONBOARDING_AT_RISK: z.number().int(),
  REGULAR: z.number().int(),
  SLIPPING: z.number().int(),
  DORMANT: z.number().int(),
  LOST: z.number().int(),
});
export type RetentionCounts = z.infer<typeof RetentionCounts>;

/** Un socio al que hay que llamar, como lo pinta la fila de Retención. */
export const RetentionAlert = z.object({
  memberId: Id,
  memberCode: z.string(),
  fullName: z.string(),
  homeBranchId: Id.nullable(),
  phoneE164: z.string().nullable(),
  /** Solo `ONBOARDING_AT_RISK`, `SLIPPING` o `DORMANT`: los demás no se llaman. */
  state: EngagementStateSchema,
  /** `null` = nunca ha venido. Los días REALES desde su última visita, aunque haya estado congelado. */
  daysSinceLastVisit: z.number().int().nullable(),
  /** Cuántas visitas SUYAS se ha saltado. La cifra que importa. */
  missedVisits: z.number().int(),
  /** Cada cuántos días suele venir, con un decimal. */
  expectedGapDays: z.number(),
  tenureDays: z.number().int(),
  /** La frase de la fila («Lleva 23 días sin venir; suele venir cada semana»). */
  detail: z.string(),
});
export type RetentionAlert = z.infer<typeof RetentionAlert>;

/**
 * `GET /retention/alerts?branchId=&limit=`: a quién llamar hoy, en orden de
 * dónde está el retorno. Congelados y membresías sin activar no entran
 * (D15-07, 15-05). `total` es cuántos hay en la lista ANTES del recorte por
 * `limit`; si `outreach.length < total`, la pantalla lo dice.
 */
export const RetentionAlerts = z.object({
  /** El día del gimnasio con el que se contó. */
  asOf: Fecha,
  counts: RetentionCounts,
  total: z.number().int(),
  outreach: z.array(RetentionAlert),
  /** Los plazos del gimnasio con que se armó la lista (D-18, bloque 4.4): la pantalla dice estos, no los suyos. */
  terms: MemberTermValues,
});
export type RetentionAlerts = z.infer<typeof RetentionAlerts>;

/**
 * `GET /retention/summary?branchId=`: las cifras SIN NOMBRES, para la dueña
 * (D15-01, ADR-039), el Inicio y el Tablero. `atRisk` es la suma de los tres
 * estados que se llaman.
 */
export const RetentionSummary = z.object({
  asOf: Fecha,
  /** `null` = todo el gimnasio. */
  branchId: Id.nullable(),
  counts: RetentionCounts,
  atRisk: z.number().int(),
});
export type RetentionSummary = z.infer<typeof RetentionSummary>;

/** Un contacto registrado («le llamé»), igual para un prospecto que para un socio en riesgo. */
export const FollowUpContact = z.object({
  id: Id,
  channel: FollowUpChannelSchema,
  outcome: FollowUpOutcomeSchema,
  note: z.string().nullable(),
  /** El próximo paso, como día de calendario; `null` = sin próximo paso. */
  nextStepOn: Fecha.nullable(),
  createdAt: Instante,
  /** Quién lo hizo; `null` si la cuenta ya no existe. */
  createdByName: z.string().nullable(),
});
export type FollowUpContact = z.infer<typeof FollowUpContact>;

/**
 * `GET /members/follow-ups/latest?ids=`: el último contacto y cuántos van, por
 * socio. Solo vienen los socios de las sedes donde quien pide tiene el
 * permiso (15-13); los que nunca se contactaron no aparecen.
 */
export const FollowUpLatest = z.object({
  latest: z.array(z.object({ memberId: Id, count: z.number().int(), last: FollowUpContact })),
});
export type FollowUpLatest = z.infer<typeof FollowUpLatest>;
