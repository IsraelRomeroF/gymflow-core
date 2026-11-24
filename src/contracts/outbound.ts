import { z } from 'zod';
import { Fecha, Id, Instante } from './comun.js';

/**
 * BANDEJA DE SALIDA (`outbound/outbound.routes.ts`; auditoría 8, fase 2,
 * bloque 2.9; hallazgos 25-10, 15-08 y 28-14).
 *
 * Los mensajes que el gimnasio le debe a un socio (un pago por vencer, una
 * suspensión, «te extrañamos») nacen en el servidor, en `outbound_messages`,
 * y recepción los manda con un toque desde una lista: el enlace `wa.me` con
 * el texto ya escrito. Nada sale solo (D-34). El canal es una columna para
 * que un proveedor sea, después, otro enviador de la misma bandeja.
 */

/**
 * Por qué se le escribe al socio, en su orden de urgencia:
 *  - `MEMBERSHIP_SUSPENDED` se le agotó la gracia y ya no entra;
 *  - `PAYMENT_OVERDUE`      tiene un cargo vencido (hasta 7 días);
 *  - `PAYMENT_DUE_SOON`     un cargo suyo vence en 1 a 3 días, o su membresía se renueva (y nace su cuota) en 1 a 3 días;
 *  - `MEMBERSHIP_ENDING`    su plan prepagado termina en 1 a 3 días y no se renueva solo;
 *  - `WE_MISS_YOU`          Retención lo tiene en riesgo (no arrancó, afloja o dejó de venir);
 *  - `PRICE_CHANGE`         su plan cambió de precio y lo pagará en su siguiente pago (D-19, bloque 3.6).
 */
export const OUTBOUND_KINDS = ['MEMBERSHIP_SUSPENDED', 'PAYMENT_OVERDUE', 'PAYMENT_DUE_SOON', 'MEMBERSHIP_ENDING', 'WE_MISS_YOU', 'PRICE_CHANGE'] as const;
export const OutboundKind = z.enum(OUTBOUND_KINDS);
export type OutboundKind = z.infer<typeof OutboundKind>;

/** Los motivos de dinero: de estos, un socio tiene a lo más UN mensaje pendiente (el más grave). */
export const OUTBOUND_MONEY_KINDS: readonly OutboundKind[] = ['MEMBERSHIP_SUSPENDED', 'PAYMENT_OVERDUE', 'PAYMENT_DUE_SOON', 'MEMBERSHIP_ENDING'];

/**
 * En qué va el mensaje:
 *  - `PENDING`   por mandar;
 *  - `SENT`      alguien abrió WhatsApp con el texto (quién y cuándo);
 *  - `DISMISSED` alguien decidió no mandarlo;
 *  - `EXPIRED`   ya no hace falta: el socio pagó, volvió, se quedó sin celular, lo
 *                reemplazó uno más grave o pasaron 10 días sin mandarse.
 */
export const OUTBOUND_STATUSES = ['PENDING', 'SENT', 'DISMISSED', 'EXPIRED'] as const;
export const OutboundStatus = z.enum(OUTBOUND_STATUSES);
export type OutboundStatus = z.infer<typeof OutboundStatus>;

/** Por dónde sale. Hoy solo el enlace `wa.me` que abre recepción. */
export const OUTBOUND_CHANNELS = ['WHATSAPP_LINK'] as const;

/** Un mensaje como lo pinta la fila de «Mensajes». */
export const OutboundMessage = z.object({
  id: Id,
  kind: OutboundKind,
  status: OutboundStatus,
  memberId: Id,
  memberCode: z.string(),
  memberName: z.string(),
  /** La sede de casa del socio HOY; `null` = sin sede. */
  branchId: Id.nullable(),
  /** El celular al que se manda (E.164). Un pendiente siempre lo trae. */
  phoneE164: z.string().nullable(),
  /** De qué es, en una línea («Mensualidad · $600.00 · vence el 24 de noviembre»). */
  detail: z.string(),
  /**
   * El texto. De un pendiente, armado con los datos de HOY; de uno mandado, el
   * que se mandó (queda guardado).
   */
  text: z.string(),
  createdAt: Instante,
  /** Cuándo se mandó, se descartó o caducó; `null` mientras está pendiente. */
  resolvedAt: Instante.nullable(),
  resolvedByName: z.string().nullable(),
});
export type OutboundMessage = z.infer<typeof OutboundMessage>;

/** Cuántos pendientes hay de cada motivo. Siempre todas las llaves. */
export const OutboundCounts = z.object({
  MEMBERSHIP_SUSPENDED: z.number().int(),
  PAYMENT_OVERDUE: z.number().int(),
  PAYMENT_DUE_SOON: z.number().int(),
  MEMBERSHIP_ENDING: z.number().int(),
  WE_MISS_YOU: z.number().int(),
  PRICE_CHANGE: z.number().int(),
});
export type OutboundCounts = z.infer<typeof OutboundCounts>;

/**
 * `GET /outbound/messages?branchId=&limit=&kind=`: lo que está por mandar en
 * las sedes de quien pide, lo más grave primero, y lo mandado hoy. `limit`
 * recorta CADA motivo (por omisión, 50): `counts` dice cuántos hay de verdad. Solo viajan
 * los pendientes cuyo hecho sigue vivo (quien ya pagó no aparece aunque el
 * job todavía no lo haya cerrado). Los «te extrañamos» solo viajan a quien
 * puede anotar seguimientos de Retención en esa sede.
 */
export const OutboundMessages = z.object({
  /** El día del gimnasio con el que se armaron los textos. */
  asOf: Fecha,
  /** Cuántos pendientes hay en total, ANTES del recorte por `limit` y sin mirar `kind`. */
  total: z.number().int(),
  counts: OutboundCounts,
  pending: z.array(OutboundMessage),
  /** Los mandados hoy (día del gimnasio), el más reciente primero. */
  sentToday: z.array(OutboundMessage),
});
export type OutboundMessages = z.infer<typeof OutboundMessages>;

/**
 * `GET /outbound/summary`: las cifras de la campana (y del renglón del Inicio
 * cuando lo tenga), sin nombres. Mismo alcance y misma cuenta que la lista.
 */
export const OutboundSummary = z.object({
  total: z.number().int(),
  counts: OutboundCounts,
  /** Cuántos se mandaron hoy en esas sedes. */
  sentToday: z.number().int(),
});
export type OutboundSummary = z.infer<typeof OutboundSummary>;

/** `POST /members/:id/outbound-messages/mark`: el mensaje como quedó. */
export const OutboundMarked = z.object({ message: OutboundMessage });
export type OutboundMarked = z.infer<typeof OutboundMarked>;
