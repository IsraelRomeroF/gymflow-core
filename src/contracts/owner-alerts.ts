import { z } from 'zod';
import { OWNER_ALERT_KINDS } from '../owner-alerts.js';
import { Centavos, Fecha, Id, Instante } from './comun.js';

/**
 * AVISOS A LA DUEÑA Y RESUMEN DEL LUNES (fase 4, bloque 4.2; D-05).
 * `GET /owner-alerts`, `POST /owner-alerts/seen` y `PUT /owner-alerts/preferences`.
 * Solo para el puesto Dueño: a cualquier otra persona le responden
 * `visible: false` y lo demás vacío, sin cifras.
 */
export const OwnerAlertKind = z.enum(OWNER_ALERT_KINDS);
export type OwnerAlertKind = z.infer<typeof OwnerAlertKind>;

/** Un renglón del detalle: lo que el teléfono no dice (quién abrió, quién cambió el precio). */
export const OwnerAlertLine = z.object({ label: z.string(), value: z.string() });
export type OwnerAlertLine = z.infer<typeof OwnerAlertLine>;

export const WeeklyFigures = z.object({
  entries: z.object({ total: z.number().int(), previous: z.number().int() }),
  members: z.object({ joined: z.number().int(), left: z.number().int() }),
  money: z.object({
    collectedCents: Centavos, previousCollectedCents: Centavos, outstandingCents: Centavos, overdueCents: Centavos,
    refunds: z.object({ count: z.number().int(), cents: Centavos }),
    discounts: z.number().int(), backdatedSales: z.number().int(), lostDebtCents: Centavos,
  }),
  cash: z.object({ variances: z.number().int(), shortCents: Centavos, overCents: Centavos, pendingReview: z.number().int() }),
  signatures: z.object({ requested: z.number().int(), approved: z.number().int(), rejected: z.number().int() }),
  awaiting: z.object({ approvals: z.number().int(), privacyNotice: z.number().int(), exMembersList: z.number().int() }),
  exceptions: z.object({ manualEntries: z.number().int(), overLimit: z.number().int(), withoutFace: z.number().int(), sharedPhoneChanges: z.number().int() }),
  audit: z.object({ intact: z.boolean().nullable(), checked: z.number().int() }),
});

/** Descuentos y devoluciones por persona contra lo normal (D-05 c): esta semana y su promedio de las cuatro anteriores. */
export const WeeklyPerson = z.object({
  name: z.string(), discounts: z.number().int(), refunds: z.number().int(),
  /** Promedio semanal (descuentos más devoluciones) de las cuatro semanas anteriores. */
  usual: z.number(),
});
export type WeeklyPerson = z.infer<typeof WeeklyPerson>;

export const WeeklySummary = z.object({
  id: Id,
  /** La semana resumida, de lunes a domingo (`to` es el domingo). */
  from: Fecha, to: Fecha,
  title: z.string(), body: z.string(),
  figures: WeeklyFigures,
  people: z.array(WeeklyPerson),
  createdAt: Instante, seen: z.boolean(),
});
export type WeeklySummary = z.infer<typeof WeeklySummary>;

export const OwnerAlert = z.object({
  id: Id, kind: OwnerAlertKind,
  title: z.string(), body: z.string(), url: z.string(),
  branchId: Id.nullable(),
  lines: z.array(OwnerAlertLine),
  occurredAt: Instante,
  /** A cuántos equipos salió. 0 = solo quedó en el panel (sin llaves, sin equipo, apagado o primera corrida). */
  pushDevices: z.number().int(),
  seen: z.boolean(),
});
export type OwnerAlert = z.infer<typeof OwnerAlert>;

export const OwnerAlertPreference = z.object({
  kind: OwnerAlertKind, label: z.string(), description: z.string(), inPanel: z.string(),
  /** ¿Suena en el teléfono? Apagado, el aviso sigue saliendo dentro del panel. */
  enabled: z.boolean(),
});
export type OwnerAlertPreference = z.infer<typeof OwnerAlertPreference>;

export const OwnerAlerts = z.object({
  visible: z.boolean(),
  /** ¿El servidor tiene llaves para avisar al teléfono? Sin ellas todo queda solo en el panel. */
  pushConfigured: z.boolean(),
  /** En cuántos equipos tiene activos los avisos quien pregunta. */
  devices: z.number().int(),
  unseen: z.number().int(),
  alerts: z.array(OwnerAlert),
  /** Los últimos resúmenes, el más reciente primero. */
  summaries: z.array(WeeklySummary),
  /** Cuándo toca el próximo resumen (lunes 7:00 del gimnasio). */
  nextSummaryAt: Instante.nullable(),
  preferences: z.array(OwnerAlertPreference),
  /** Lo que llega siempre y no se apaga por tipo (firmas, la cuenta con GymFlow). */
  always: z.array(z.object({ label: z.string(), description: z.string() })),
});
export type OwnerAlerts = z.infer<typeof OwnerAlerts>;

/** `POST /owner-alerts/seen`. */
export const OwnerAlertsSeen = z.object({ seen: z.number().int() });
export type OwnerAlertsSeen = z.infer<typeof OwnerAlertsSeen>;

/** `PUT /owner-alerts/preferences`. */
export const OwnerAlertPreferenceSaved = z.object({ kind: OwnerAlertKind, enabled: z.boolean() });
export type OwnerAlertPreferenceSaved = z.infer<typeof OwnerAlertPreferenceSaved>;
