import { z } from 'zod';
import { Centavos, Fecha, Id, Instante } from './comun.js';

/**
 * LOS PLAZOS DEL SOCIO Y «RECUPERAR» (D-18; auditoría 8, fase 4, bloque 4.4).
 * Rutas en `memberships/plazos.routes.ts` y `retention/retention.routes.ts`.
 * Los valores de fábrica, los límites y las frases viven en
 * `plazos-del-socio.ts` del núcleo: ninguna pantalla escribe su número.
 */

/** Los seis plazos que rigen en el gimnasio (lo ajustado o, sin ajuste, lo de fábrica). */
export const MemberTermValues = z.object({
  /** Días sin venir para «dejó de venir». */
  dormantDays: z.number().int(),
  /** Días de terminada la membresía, sin renovar, para contar como baja. */
  churnDays: z.number().int(),
  /** Días sin venir para darlo por perdido. */
  lostDays: z.number().int(),
  /** Meses que se le busca en «Recuperar». */
  winbackMonths: z.number().int(),
  /** Días para cancelar sola una venta que nadie cobró. */
  unpaidSaleDays: z.number().int(),
  /** Días de suspendida para terminar la membresía y dar su deuda por perdida. */
  lostDebtDays: z.number().int(),
});
export type MemberTermValues = z.infer<typeof MemberTermValues>;

/**
 * `GET /member-terms`: los plazos del gimnasio, los de fábrica y cuáles tiene
 * ajustados. `PUT /member-terms/retention` (gerencia, con motivo) y
 * `PUT /member-terms/debt` (gerencia, con motivo y la firma de la dueña)
 * responden lo mismo.
 */
export const MemberTerms = z.object({
  terms: MemberTermValues,
  defaults: MemberTermValues,
  /** Las llaves que el gimnasio ajustó (las demás valen lo de fábrica). */
  customized: z.array(z.string()),
  /** Cuándo y quién los cambió por última vez; `null` si nunca. */
  updatedAt: Instante.nullable(),
  updatedByName: z.string().nullable(),
});
export type MemberTerms = z.infer<typeof MemberTerms>;

/** Por qué alguien está en «Recuperar»: se perdió (sigue con membresía y no viene) o está de baja. */
export const WINBACK_CAUSES = ['LOST', 'ARCHIVED', 'CANCELED', 'EXPIRED'] as const;
export const WinbackCauseSchema = z.enum(WINBACK_CAUSES);
export type WinbackCause = z.infer<typeof WinbackCauseSchema>;

/** Una persona a la que se le busca en «Recuperar». */
export const WinbackMember = z.object({
  memberId: Id,
  memberCode: z.string(),
  fullName: z.string(),
  homeBranchId: Id.nullable(),
  phoneE164: z.string().nullable(),
  cause: WinbackCauseSchema,
  /** Desde qué día se le cuenta como perdido o de baja. */
  since: Fecha,
  /** Hasta qué día (inclusive) sigue en «Recuperar». */
  until: Fecha,
  /** Su última visita; `null` si nunca vino. */
  lastVisitOn: Fecha.nullable(),
  /** El plan que tiene (perdido) o el último que tuvo (baja). */
  planName: z.string().nullable(),
  /** El motivo con que se canceló su membresía, si se anotó. */
  reason: z.string().nullable(),
  /** `true` si lo dieron de baja en su ficha: para volver hay que reactivarlo. */
  archived: z.boolean(),
});
export type WinbackMember = z.infer<typeof WinbackMember>;

/**
 * `GET /retention/winback?branchId=&limit=`: a quién se le busca todavía.
 * `total` es cuántos hay ANTES del recorte por `limit`; `counts` dice cuántos
 * por causa (siempre las cuatro llaves).
 */
export const WinbackList = z.object({
  asOf: Fecha,
  terms: MemberTermValues,
  total: z.number().int(),
  counts: z.object({ LOST: z.number().int(), ARCHIVED: z.number().int(), CANCELED: z.number().int(), EXPIRED: z.number().int() }),
  members: z.array(WinbackMember),
});
export type WinbackList = z.infer<typeof WinbackList>;

/**
 * `GET /members/:id/standing`: si el socio está de baja según D-18, desde
 * cuándo y por qué. Es el dato «está de baja desde», calculado: nadie lo
 * guarda y ninguna regla de conservación lo usa todavía (ver el informe 4.4).
 */
export const MemberStanding = z.object({
  memberId: Id,
  /** El día de la sede con que se calculó. */
  asOf: Fecha,
  /** `null` = no está de baja. */
  churn: z.object({
    cause: z.enum(['ARCHIVED', 'CANCELED', 'EXPIRED']),
    since: Fecha,
    /** Solo `EXPIRED`: el día en que terminó su membresía. */
    endedOn: Fecha.nullable(),
  }).nullable(),
  /** Si su membresía terminó y aún no pasa el plazo: el día en que contará como baja. */
  churnsOn: Fecha.nullable(),
  /** Lo que debe y ya se dio por perdido (sigue cobrable, fuera de «Por cobrar»). Siempre `"0"` para quien no ve el estado de cuenta (el coach). */
  lostDebtCents: Centavos,
});
export type MemberStanding = z.infer<typeof MemberStanding>;
