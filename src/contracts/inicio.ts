import { z } from 'zod';
import { Centavos, Id, Instante } from './comun.js';

/**
 * EL INICIO COMO BANDEJA (auditoría 8, bloque 2.1; hallazgos 1-01, 5-12).
 *
 * `GET /me/home` arma en el servidor lo que a esta persona le toca hoy: un
 * renglón por asunto, solo si lo puede resolver (su permiso, en sus sedes) y
 * su módulo está encendido. El panel pone las palabras, el icono y el destino
 * de cada `key`; el servidor decide qué existe, cuánto es y en qué orden.
 */

/**
 * Los asuntos de la bandeja, en su orden de urgencia:
 *  - `signatures`  firmas que YO pedí y siguen esperando al dueño (`until`: cuándo vence la primera);
 *  - `door`        rechazos de hoy en la puerta que nadie ha resuelto;
 *  - `registers`   cajas que siguen abiertas desde un día anterior (`detail`: cuáles);
 *  - `variances`   cortes con más de $20 de diferencia que la gerencia no ha revisado (D-17; bloque 4.3):
 *                   solo para quien los revisa (`cash:variance:approve`); `amountCents` es lo que falta;
 *  - `biometrics`  plantillas de un lector revocadas hace más de 30 días sin confirmar su borrado;
 *  - `debts`       membresías suspendidas con periodos atrasados: adeudo por decidir (`amountCents`);
 *  - `texts`       textos obligatorios sin publicar (`detail`: cuáles);
 *  - `classes`     clases de hoy que faltan y no tienen coach;
 *  - `intakes`     altas digitales por revisar;
 *  - `coachless`   socios dados de alta en los últimos 7 días que siguen sin coach (D-29; bloque 3.16): solo
 *                   para quien puede ponérselo y si el gimnasio tiene algún coach activo; `detail` trae hasta
 *                   cuatro nombres;
 *  - `contactChanges` socios que cambiaron su celular o su correo desde el portal y nadie del mostrador lo ha
 *                   confirmado con ellos (D-36; bloque 4.8): para quien da acceso al portal en esa sede;
 *                   `detail` trae hasta cuatro nombres, los más antiguos primero;
 *  - `prospects`  interesados nuevos a los que nadie ha contactado;
 *  - `retention`   socios en riesgo (la cifra de Retención).
 */
export const ASUNTOS_DEL_INICIO = [
  'signatures', 'door', 'registers', 'variances', 'biometrics', 'debts', 'texts', 'classes', 'intakes', 'coachless', 'contactChanges', 'prospects', 'retention',
] as const;
export const AsuntoDelInicio = z.enum(ASUNTOS_DEL_INICIO);
export type AsuntoDelInicio = z.infer<typeof AsuntoDelInicio>;

export const RenglonDelInicio = z.object({
  key: AsuntoDelInicio,
  /** Cuántos. Un renglón en cero no viaja. */
  count: z.number().int().positive(),
  tone: z.enum(['danger', 'warn', 'info']),
  /** El dinero del asunto, cuando lo tiene y quien mira puede verlo. */
  amountCents: Centavos.nullable(),
  /** Nombres cortos para la segunda línea (las cajas, los textos). */
  detail: z.array(z.string()),
  /** Hasta cuándo: el vencimiento más próximo. */
  until: Instante.nullable(),
  /**
   * De `detail`, lo que ya no depende de quien mira sino de otra persona (3.12): en `texts`, el
   * aviso de privacidad que la gerencia ya pidió publicar y espera la firma de la dueña (D-25).
   */
  waiting: z.array(z.string()).optional(),
});
export type RenglonDelInicio = z.infer<typeof RenglonDelInicio>;

export const MeHome = z.object({
  asOf: Instante,
  /** Ordenados por urgencia: primero lo que detiene al mostrador. */
  items: z.array(RenglonDelInicio),
  /** Asuntos que le tocan pero no se pudieron revisar: con alguno aquí, no se dice «Todo al día». */
  unchecked: z.array(AsuntoDelInicio),
});
export type MeHome = z.infer<typeof MeHome>;

/**
 * POR RESOLVER EN LA PUERTA (5-05, 5-12): `GET /access/pending`. Los rechazos
 * de HOY que siguen sin resolver: el último de cada socio en cada sede, si
 * después no entró y nadie lo resolvió (cobrar y abrir, renovar y abrir o
 * dejar pasar). Se resuelve con `GET /access/decisions/:id/exception`.
 */
export const AccessPendingItem = z.object({
  decisionId: Id,
  branchId: Id,
  memberId: Id,
  memberName: z.string(),
  memberCode: z.string(),
  /** El motivo del rechazo (`DENIAL_REASON`). */
  reason: z.string().nullable(),
  at: Instante,
  /** Cuántas veces lo rechazó la puerta hoy en esa sede. */
  attempts: z.number().int().positive(),
});
export type AccessPendingItem = z.infer<typeof AccessPendingItem>;

export const AccessPending = z.object({
  asOf: Instante,
  pending: z.array(AccessPendingItem),
  /** Cuántos hay en total: la lista viaja recortada a los más recientes. */
  total: z.number().int(),
});
export type AccessPending = z.infer<typeof AccessPending>;
