import { addDays, nextPeriod, type PlanDuration } from './membership.js';

/**
 * EL AVISO DE UN AUMENTO DE PRECIO (auditoría 8, fase 4, bloque 4.20; P-14).
 *
 * Un AUMENTO del precio de un plan pide un mínimo de `DIAS_DE_AVISO_DE_AUMENTO`
 * días entre el día en que se guarda y el primer cobro con el precio nuevo, para
 * cada socio. Es lo mismo que ya se le da a quien pagó por adelantado (D-14).
 *
 * La regla, la más conservadora de las que cumplen eso:
 *
 *   · El aumento RIGE desde `hoy + 15` (`rigeDesde`).
 *   · Una cuota sale al precio nuevo solo si su periodo empieza en ese día o
 *     después Y se emite en ese día o después. Quien renueva por adelantado
 *     antes de esa fecha paga ese periodo al precio de antes; un periodo
 *     atrasado que empezó antes también.
 *   · A quien su cuota le nace antes de esos 15 días, el primer cobro con el
 *     precio nuevo es su siguiente ciclo (o el que siga, si el ciclo es más corto).
 *
 * Una BAJADA no espera: rige desde el mismo día, como siempre (D-19).
 * «Conserva su precio» no cambia: el aumento sigue sin llegarle salvo que se
 * decida incluirla (D-19, bloque 3.6).
 */
export const DIAS_DE_AVISO_DE_AUMENTO = 15;

/** Desde qué día rige un cambio de precio guardado `hoy` (día del gimnasio): un aumento, 15 días después; una bajada, hoy. */
export function rigeDesde(hoy: Date, fromPriceCents: bigint, toPriceCents: bigint): Date {
  return toPriceCents > fromPriceCents ? addDays(hoy, DIAS_DE_AVISO_DE_AUMENTO) : hoy;
}

/**
 * ¿Esta cuota ya sale con el aumento? Su periodo empieza `inicio` y se emite
 * `emitidaEl` (el día del gimnasio). Las dos fechas tienen que alcanzar
 * `rige`: así nadie paga el precio nuevo antes de los 15 días, ni renovando
 * por adelantado ni poniéndose al corriente de un periodo viejo.
 */
export function cuotaConAumento(input: { readonly inicio: Date; readonly emitidaEl: Date; readonly rige: Date }): boolean {
  return input.inicio.getTime() >= input.rige.getTime() && input.emitidaEl.getTime() >= input.rige.getTime();
}

/**
 * El día en que un socio paga por primera vez el precio nuevo, si su
 * membresía sigue como hoy: el inicio del primer periodo que empieza en `rige`
 * o después, recorriendo sus periodos desde el que sigue al actual
 * (`siguienteInicio` = fin del periodo actual). Es una PREVISIÓN para la
 * pantalla y el aviso: si la membresía se congela o se mueve, el cobro solo
 * puede llegar después, nunca antes (la emisión aplica `cuotaConAumento`).
 * `null` si el plan no tiene periodos (paquetes de visitas).
 */
export function primerCobroConAumento(input: {
  readonly siguienteInicio: Date; readonly duracion: PlanDuration; readonly diaDeCorte: number; readonly rige: Date;
}): Date | null {
  if (input.duracion.unit === 'VISIT' || input.duracion.value <= 0) return null;
  // El periodo que sigue al actual empieza en `siguienteInicio`; cada vuelta, un ciclo más (con el ancla, ADR-006).
  let periodo = nextPeriod({ start: input.siguienteInicio, end: input.siguienteInicio }, input.duracion, input.diaDeCorte);
  for (let vuelta = 0; vuelta < 1000 && periodo.start.getTime() < input.rige.getTime(); vuelta++) {
    periodo = nextPeriod(periodo, input.duracion, input.diaDeCorte);
  }
  return periodo.start.getTime() >= input.rige.getTime() ? periodo.start : null;
}

/** Un cambio de precio que tocó a una membresía, en el orden en que se guardaron (4.20). */
export type CambioDeLaMembresia = {
  readonly id: string;
  readonly fromPriceCents: bigint;
  readonly toPriceCents: bigint;
  /** Desde qué día rige; `null` = rigió al guardarse (bajadas y cambios anteriores a 4.20). */
  readonly appliesFrom: Date | null;
  /** El aumento ya llegó con una cuota. */
  readonly llego: boolean;
};

/** ¿Es un aumento con aviso que todavía no llega? */
const esPorLlegar = (c: CambioDeLaMembresia) => c.appliesFrom !== null && c.toPriceCents > c.fromPriceCents && !c.llego;

/**
 * EL PRECIO DE UNA CUOTA CON AUMENTOS POR LLEGAR (4.20, P-14).
 *
 * Sin aumentos por llegar, la cuota sale a `base` (lo que paga hoy, la regla
 * de siempre). Con alguno, se mira la historia desde el primero que espera:
 *
 *   · rige para esta cuota todo cambio que ya llegó, que rigió al guardarse
 *     (una bajada) o cuyo «rige desde» alcanza la cuota (`cuotaConAumento`);
 *   · el precio es el del ÚLTIMO cambio que rige (o, si ninguno, el de antes
 *     del primer aumento que espera), y nunca más que el «antes» de un
 *     aumento que todavía no rige: así una bajada guardada después de un
 *     aumento se aplica ya, pero no adelanta el aumento.
 *
 * `llegan` son los aumentos que esta cuota ya lleva: quien la emite deja su constancia.
 */
export function precioConAumentos(input: {
  readonly base: bigint; readonly cambios: readonly CambioDeLaMembresia[]; readonly inicio: Date; readonly emitidaEl: Date;
}): { precio: bigint; llegan: string[] } {
  const primero = input.cambios.findIndex(esPorLlegar);
  if (primero < 0) return { precio: input.base, llegan: [] };
  const desde = input.cambios.slice(primero);
  const rige = (c: CambioDeLaMembresia) => c.appliesFrom === null || c.llego
    || cuotaConAumento({ inicio: input.inicio, emitidaEl: input.emitidaEl, rige: c.appliesFrom });
  const vigentes = desde.filter(rige);
  let precio = vigentes.length > 0 ? vigentes[vigentes.length - 1]!.toPriceCents : desde[0]!.fromPriceCents;
  for (const c of desde) if (!rige(c) && c.fromPriceCents < precio) precio = c.fromPriceCents;
  return { precio, llegan: desde.filter((c) => esPorLlegar(c) && rige(c)).map((c) => c.id) };
}

/** Lo que pagará cuando lleguen todos los aumentos guardados: el último cambio si alguno espera; si no, `base`. */
export function precioAlFinal(base: bigint, cambios: readonly CambioDeLaMembresia[]): bigint {
  return cambios.some(esPorLlegar) ? cambios[cambios.length - 1]!.toPriceCents : base;
}
