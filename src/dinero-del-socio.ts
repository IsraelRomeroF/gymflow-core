import type { PlanDuration } from './membership.js';
import { money, prorate } from './money.js';

/**
 * EL DINERO DEL SOCIO (auditoría 8, fase 3, bloque 3.5 · D-12 a D-16).
 *
 * Las reglas que deciden cuánto se perdona sin firma, cuánto queda a favor al
 * cancelar, qué se puede sacar del cajón y hasta cuándo se guarda una clase
 * apartada. Puras: la base la mira quien las llama.
 */

// ── D-12 · Nada se borra solo ───────────────────────────────────────────────

/** Ventana en la que se suma lo perdonado sin firma a un mismo socio. */
export const DIAS_DEL_TOPE_DE_PERDON = 30;

/**
 * «Una mensualidad del socio»: lo que paga por 30 días de su plan.
 *
 * Un plan mensual vale su precio; uno de varios meses (trimestre, anualidad)
 * se divide entre sus meses, para que el tope de una anualidad de $6,500 no
 * sea $6,500. Una semana, una visita o un paquete valen su precio tal cual
 * (nunca más que eso: no se «mensualiza» hacia arriba).
 */
export function mensualidadDe(priceCents: bigint, duration: PlanDuration): bigint {
  if (priceCents <= 0n) return 0n;
  if (duration.unit === 'MONTH' && duration.value > 1) return prorate(money(priceCents), 1, duration.value).cents;
  const dias = duration.unit === 'DAY' ? duration.value : duration.unit === 'WEEK' ? duration.value * 7 : 0;
  if (dias > 31) return prorate(money(priceCents), 30, dias).cents;
  return priceCents;
}

export type PerdonSinFirma = {
  /** Lo que todavía se le puede perdonar a este socio sin la firma de la dueña. */
  readonly disponibleCents: bigint;
  /** ¿Este importe pasa sin firma? */
  readonly sinFirma: boolean;
};

/**
 * D-12 (a): la gerencia perdona sola hasta una mensualidad del socio; arriba,
 * con la firma de la dueña. El tope es POR SOCIO y se gasta: lo ya perdonado
 * sin firma en los últimos 30 días cuenta, para que cinco perdones de una
 * mensualidad no sean cinco mensualidades sin firma. Lo que la dueña firmó no
 * gasta el tope. Sin mensualidad conocida (el socio nunca tuvo plan) no hay
 * tope: todo perdón lleva firma.
 */
export function perdonSinFirma(input: {
  readonly mensualidadCents: bigint | null;
  readonly perdonadoSinFirmaCents: bigint;
  readonly montoCents: bigint;
}): PerdonSinFirma {
  const tope = input.mensualidadCents ?? 0n;
  const gastado = input.perdonadoSinFirmaCents > 0n ? input.perdonadoSinFirmaCents : 0n;
  const disponibleCents = tope > gastado ? tope - gastado : 0n;
  return { disponibleCents, sinFirma: input.montoCents > 0n && input.montoCents <= disponibleCents };
}

/**
 * ¿Qué pasa con una cuota SIN NINGÚN PAGO cuando su membresía se cierra? (D-12)
 *
 *   · `KEEP`: se queda como deuda. Es la regla: el periodo ya empezó, el socio
 *     tuvo su lugar y nadie decidió perdonarla.
 *   · `VOID`: se anula por regla, porque nunca hubo nada que cobrar: la venta
 *     jamás se cobró ni dio acceso (D-18), o el periodo todavía no empieza
 *     (renovó por adelantado sin pagar y canceló antes).
 *
 * Antes toda cuota sin pagos se anulaba al cancelar o dar de baja, sin firma.
 */
export function cuotaAlCerrar(input: {
  /** La membresía nunca dejó de estar «por activar»: nunca se cobró ni abrió la puerta. */
  readonly nuncaActiva: boolean;
  readonly periodStart: Date | null;
  readonly today: Date;
}): 'KEEP' | 'VOID' {
  if (input.nuncaActiva) return 'VOID';
  if (input.periodStart !== null && input.periodStart.getTime() > input.today.getTime()) return 'VOID';
  return 'KEEP';
}

// ── D-15 · El efectivo del cajón ────────────────────────────────────────────

/** Fondo y gastos del cajón que se anotan con motivo y sin firma, por turno y por tipo. Ajustable por gimnasio. */
export const TOPE_FONDO_Y_GASTO_CHICO_CENTS = 50_000n;
/** Lo que recepción puede retirar a la caja fuerte o depositar por turno, siempre con firma. Ajustable por gimnasio. */
export const TOPE_RETIRO_POR_TURNO_CENTS = 500_000n;
/** Hasta dónde puede ajustar un gimnasio sus topes. */
export const LIMITES_DE_LOS_TOPES_DEL_CAJON = { pettyMaxCents: 1_000_000n, withdrawalMaxCents: 10_000_000n } as const;

export type MovimientoDelCajon = 'FLOAT_IN' | 'WITHDRAWAL' | 'EXPENSE' | 'DEPOSIT' | 'CORRECTION';

/**
 * Qué puesto tiene tope de retiro por turno: recepción lo tiene (su
 * `maxCashWithdrawalCents` trae un importe), la gerencia no (nulo) y quien lo
 * trae en cero no retira.
 */
export type TopeDeRetiroDelPuesto = 'SIN_TOPE' | 'CON_TOPE' | 'NO_PUEDE';

export function topeDeRetiroDelPuesto(maxCashWithdrawalCents: bigint | null): TopeDeRetiroDelPuesto {
  return maxCashWithdrawalCents === null ? 'SIN_TOPE' : maxCashWithdrawalCents === 0n ? 'NO_PUEDE' : 'CON_TOPE';
}

export type ReglaDelCajon =
  | { readonly outcome: 'ALLOW' }
  | { readonly outcome: 'REQUIRE_APPROVAL'; readonly porQue: string }
  | { readonly outcome: 'DENY'; readonly porQue: string };

/**
 * D-15 (a) y choque 5: qué se puede hacer con el efectivo del cajón sin la
 * firma de la dueña, con ella, y qué no.
 *
 *  · FONDO y GASTO: con motivo y SIN firma mientras lo anotado sin firma en el
 *    turno, de ese tipo, no pase del tope chico ($500). Arriba, con firma. El
 *    tope es por turno y no por movimiento: si no, bastaría partir un gasto
 *    de $2,000 en cinco de $400.
 *  · RETIRO a la caja fuerte y DEPÓSITO: SIEMPRE con firma. Recepción, además,
 *    hasta su tope por turno ($5,000, acumulado): arriba no lo hace ni con
 *    firma, lo hace la gerencia.
 *  · CORRECCIÓN: siempre con firma, y solo quien no tiene tope (la gerencia).
 */
export function reglaDelCajon(input: {
  readonly tipo: MovimientoDelCajon;
  readonly montoCents: bigint;
  /** Lo ya anotado sin firma en este turno, de este mismo tipo (fondo o gasto). */
  readonly sinFirmaEnElTurnoCents: bigint;
  /** Lo que esta persona ya retiró o depositó en este turno. */
  readonly retiradoEnElTurnoCents: bigint;
  readonly topeChicoCents: bigint;
  readonly topeRetiroCents: bigint;
  readonly puesto: TopeDeRetiroDelPuesto;
  readonly firmado: boolean;
}): ReglaDelCajon {
  const conFirma: ReglaDelCajon = input.firmado ? { outcome: 'ALLOW' } : { outcome: 'REQUIRE_APPROVAL', porQue: '' };
  switch (input.tipo) {
    case 'FLOAT_IN':
    case 'EXPENSE': {
      if (input.sinFirmaEnElTurnoCents + input.montoCents <= input.topeChicoCents) return { outcome: 'ALLOW' };
      return input.firmado ? { outcome: 'ALLOW' } : {
        outcome: 'REQUIRE_APPROVAL',
        porQue: input.tipo === 'EXPENSE' ? 'Pasa de lo que se puede gastar del cajón sin firma en este turno' : 'Pasa del fondo que se puede anotar sin firma en este turno',
      };
    }
    case 'WITHDRAWAL':
    case 'DEPOSIT': {
      if (input.puesto === 'NO_PUEDE') return { outcome: 'DENY', porQue: 'Tu puesto no retira ni deposita efectivo' };
      if (input.puesto === 'CON_TOPE' && input.retiradoEnElTurnoCents + input.montoCents > input.topeRetiroCents) {
        return { outcome: 'DENY', porQue: 'Pasa de lo que tu puesto puede retirar o depositar en un turno: lo hace la gerencia' };
      }
      return conFirma.outcome === 'ALLOW' ? conFirma : { outcome: 'REQUIRE_APPROVAL', porQue: 'Retirar o depositar efectivo siempre lleva la firma de quien da la segunda firma' };
    }
    case 'CORRECTION': {
      if (input.puesto !== 'SIN_TOPE') return { outcome: 'DENY', porQue: 'Una corrección del cajón la hace la gerencia' };
      return conFirma.outcome === 'ALLOW' ? conFirma : { outcome: 'REQUIRE_APPROVAL', porQue: 'Una corrección del cajón siempre lleva firma' };
    }
  }
}

// ── D-16 · La clase suelta apartada sin pagar ───────────────────────────────

/** Cuánto antes de la clase se libera un lugar apartado que nadie pagó. */
export const MINUTOS_DE_APARTADO = 60;

export type ApartadoDeClase =
  /** Se aparta sin pagar y se guarda hasta `holdUntil`. */
  | { readonly outcome: 'HOLD'; readonly holdUntil: Date }
  /** Solo pagando en el momento. */
  | { readonly outcome: 'PAY_NOW'; readonly porQue: 'OWES_MEMBERSHIP' | 'HOLD_CLOSED' };

/**
 * D-16 (b): una clase suelta se aparta sin pagar y el lugar se guarda hasta
 * una hora antes; sin pago se libera y no debe nada; si llega, se cobra al
 * pasar lista. Dos casos solo se apartan PAGANDO en el momento: quien debe su
 * mensualidad, y la clase que empieza en menos de una hora (ya no hay tiempo
 * de guardarla).
 */
export function apartadoDeClaseSuelta(input: { readonly startsAt: Date; readonly now: Date; readonly debeSuMensualidad: boolean }): ApartadoDeClase {
  if (input.debeSuMensualidad) return { outcome: 'PAY_NOW', porQue: 'OWES_MEMBERSHIP' };
  const holdUntil = new Date(input.startsAt.getTime() - MINUTOS_DE_APARTADO * 60_000);
  if (holdUntil.getTime() <= input.now.getTime()) return { outcome: 'PAY_NOW', porQue: 'HOLD_CLOSED' };
  return { outcome: 'HOLD', holdUntil };
}

/** ¿Ya toca liberar ese apartado? Justo a la hora ya se libera. */
export function apartadoVencido(holdUntil: Date | null, now: Date): boolean {
  return holdUntil !== null && holdUntil.getTime() <= now.getTime();
}

// ── D-14 · El plan pagado por adelantado vence y se vuelve a vender ─────────

/** Con cuántos días de anticipación se le avisa al socio que su plan pagado por adelantado termina y no se renueva solo. */
export const DIAS_DE_AVISO_DE_PREPAGO = 15;
