import { allocate, money, type Money } from './money.js';
import type { ChargeType } from './billing.js';
import type { PlanDuration } from './membership.js';

/**
 * Indicadores núcleo (§20).
 *
 * La decisión que gobierna este módulo es distinguir **tres cifras que hoy el
 * dueño confunde en una sola**:
 *
 *   · COBRADO   — dinero que entró. Es lo que ve en la caja.
 *   · DEVENGADO — dinero GANADO en el periodo. Es el resultado real.
 *   · DIFERIDO  — dinero cobrado que todavía NO se ha ganado. Es un PASIVO.
 *
 * Confundirlas es el error más caro que permite un sistema de gimnasio: vender
 * cien anualidades en enero parece un mes extraordinario y en realidad crea
 * once meses de obligación de servicio. Un dueño que decide contratar personal
 * mirando lo cobrado se compromete con dinero que ya debe.
 */

// ── Reconocimiento por tipo de cargo (ADR-024) ──────────────────────────────

export type RecognitionRule =
  /** Se gana al emitirse: el bien o servicio se entrega en el acto. */
  | 'IMMEDIATE'
  /** Se gana repartido a lo largo del periodo que cubre. */
  | 'OVER_PERIOD'
  /** Se gana al CONSUMIRSE, visita a visita. Hasta entonces es pasivo. */
  | 'ON_CONSUMPTION'
  /** No es ingreso: no se cuenta en ninguna cifra de resultado. */
  | 'EXCLUDED';

export const RECOGNITION: Readonly<Record<ChargeType, RecognitionRule>> = {
  MEMBERSHIP_PERIOD: 'OVER_PERIOD',
  VISIT_PACK: 'ON_CONSUMPTION',
  DAY_PASS: 'IMMEDIATE',
  CLASS_SINGLE: 'IMMEDIATE',
  POS_SALE: 'IMMEDIATE',
  SIGNUP_FEE: 'IMMEDIATE',
  NO_SHOW_PENALTY: 'IMMEDIATE',
  PRORATION_ADJUSTMENT: 'IMMEDIATE',
  MANUAL_ADJUSTMENT: 'IMMEDIATE',
  /**
   * Saldo migrado de BDKGYM. NO es ingreso de GymFlow: representa deuda que ya
   * existía. Contarlo inflaría el primer mes con dinero ganado por el sistema
   * anterior y arruinaría cualquier comparación posterior.
   */
  OPENING_BALANCE: 'EXCLUDED',
};

export function recognitionOf(type: ChargeType): RecognitionRule {
  return RECOGNITION[type];
}

// ── Normalización a valor mensual ───────────────────────────────────────────

/**
 * Longitud media del mes × 10⁴ (365.25 / 12 = 30.4375 días).
 *
 * OJO: esto es para NORMALIZAR el MRR, nunca para prorratear un cobro. El
 * prorrateo usa días REALES del periodo (ADR-006) porque afecta a lo que paga
 * una persona; la normalización usa una media porque compara planes de
 * duraciones distintas. Mezclarlas produce cobros incorrectos.
 */
const DIAS_POR_MES_E4 = 304_375n;

/** División entera con redondeo al más cercano, mitad hacia arriba. */
function divRedondeada(dividendo: bigint, divisor: bigint): bigint {
  if (divisor <= 0n) throw new Error('divisor inválido');
  const negativo = dividendo < 0n;
  const abs = negativo ? -dividendo : dividendo;
  const q = (abs * 2n + divisor) / (divisor * 2n);
  return negativo ? -q : q;
}

/**
 * Valor MENSUAL equivalente de un plan.
 *
 * Devuelve `null` para los planes que no son recurrentes: un paquete de
 * visitas no tiene valor mensual porque no se renueva solo, y meterlo en el
 * MRR lo convertiría en una cifra que no predice nada.
 */
export function monthlyValueOf(price: Money, duration: PlanDuration): Money | null {
  if (duration.value <= 0) throw new Error('La duración del plan debe ser positiva');
  const v = BigInt(duration.value);

  switch (duration.unit) {
    case 'MONTH':
      return money(divRedondeada(price.cents, v), price.currency);
    case 'DAY':
      return money(divRedondeada(price.cents * DIAS_POR_MES_E4, v * 10_000n), price.currency);
    case 'WEEK':
      return money(divRedondeada(price.cents * DIAS_POR_MES_E4, v * 70_000n), price.currency);
    case 'VISIT':
      return null;
    default:
      return null;
  }
}

// ── Prepago: cuatro estados del dinero ──────────────────────────────────────

export type PrepaidSplit = {
  /** Lo que entró por el paquete. */
  readonly collected: Money;
  /** Ganado por visitas ya consumidas. */
  readonly earned: Money;
  /** Ganado por visitas CADUCADAS: el servicio ya no se prestará. */
  readonly expired: Money;
  /** Todavía debido al socio. Es PASIVO, no ingreso. */
  readonly deferred: Money;
};

/**
 * Reparte lo cobrado por un paquete entre ganado, caducado y diferido.
 *
 * El residuo de la división se asigna a la ÚLTIMA visita, de modo que cuando
 * el paquete se agota la suma es exactamente lo cobrado. Repartirlo por igual
 * dejaría céntimos colgando como pasivo eterno.
 */
export function splitPrepaid(input: {
  readonly collected: Money;
  readonly visitsIncluded: number;
  readonly visitsConsumed: number;
  readonly visitsExpired: number;
}): PrepaidSplit {
  const { collected, visitsIncluded, visitsConsumed, visitsExpired } = input;
  if (visitsIncluded <= 0) throw new Error('El paquete debe incluir al menos una visita');
  if (visitsConsumed < 0 || visitsExpired < 0) throw new Error('Las visitas no pueden ser negativas');
  if (visitsConsumed + visitsExpired > visitsIncluded) {
    throw new Error('Consumidas más caducadas no pueden superar las incluidas');
  }

  const incluidas = BigInt(visitsIncluded);
  const unidad = collected.cents / incluidas;              // trunca a propósito
  const consumidas = BigInt(visitsConsumed);
  const caducadas = BigInt(visitsExpired);
  const cerradas = consumidas + caducadas;

  // El paquete CERRADO (agotado o caducado) se reconoce íntegro, y el residuo
  // se reparte por resto mayor entre consumidas y caducadas. Asignarlo a ciegas
  // a una de las dos hacía que un paquete usado por completo apareciera con un
  // centavo "caducado" que nunca caducó.
  if (cerradas === incluidas) {
    const [ganado, caducado] = allocate(collected, [visitsConsumed, visitsExpired]);
    return {
      collected,
      earned: ganado!,
      expired: caducado!,
      deferred: money(0n, collected.currency),
    };
  }

  const ganado = money(unidad * consumidas, collected.currency);
  const caducado = money(unidad * caducadas, collected.currency);
  return {
    collected,
    earned: ganado,
    expired: caducado,
    deferred: money(collected.cents - ganado.cents - caducado.cents, collected.currency),
  };
}

// ── Devengo de un cargo de periodo dentro de una ventana ────────────────────

export type DateRange = { readonly from: Date; readonly to: Date };

const MS_DIA = 86_400_000;

function diasEntre(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_DIA);
}

/**
 * Parte de un cargo de periodo que se GANA dentro de la ventana consultada.
 *
 * Los periodos son semiabiertos `[inicio, fin)` igual que en el motor de
 * membresías, así que el solape se calcula sin días duplicados ni huecos.
 */
export function accruedInWindow(input: {
  readonly amount: Money;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly window: DateRange;
}): Money {
  const { amount, periodStart, periodEnd, window } = input;
  const totalDias = diasEntre(periodStart, periodEnd);
  if (totalDias <= 0) return money(0n, amount.currency);

  const desde = periodStart > window.from ? periodStart : window.from;
  const hasta = periodEnd < window.to ? periodEnd : window.to;
  const solape = diasEntre(desde, hasta);
  if (solape <= 0) return money(0n, amount.currency);
  if (solape >= totalDias) return amount;

  return money(divRedondeada(amount.cents * BigInt(solape), BigInt(totalDias)), amount.currency);
}

// ── Cifras del tablero ──────────────────────────────────────────────────────

export type BranchKpi = {
  readonly branchId: string | null;
  readonly collectedCents: bigint;
  readonly accruedCents: bigint;
  readonly activeMembers: number;
  readonly outstandingCents: bigint;
};

/**
 * Ordena las sucursales para el comparativo.
 *
 * Por ingreso DEVENGADO, no por cobrado: una sede que vendió tres anualidades
 * el martes encabezaría el ranking por cobrado sin haber ganado más que las
 * demás, y el dueño premiaría a quien no debe.
 */
export function rankBranches(rows: readonly BranchKpi[]): BranchKpi[] {
  return [...rows].sort((a, b) => {
    if (b.accruedCents !== a.accruedCents) return b.accruedCents > a.accruedCents ? 1 : -1;
    return (a.branchId ?? '').localeCompare(b.branchId ?? '');
  });
}

/** Morosidad: proporción de la cartera que ya venció. */
export function delinquencyRate(overdueCents: bigint, outstandingCents: bigint): number {
  if (outstandingCents <= 0n) return 0;
  return Number((overdueCents * 10_000n) / outstandingCents) / 10_000;
}
