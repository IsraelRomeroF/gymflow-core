/**
 * Retención: detectar la fuga ANTES del corte (F-22).
 *
 * El hecho que gobierna este módulo, confirmado en el discovery: **el socio
 * deja de venir semanas antes de dejar de pagar, y esa ventana es hoy
 * invisible**. Contactarlo dentro de ella es retención; después del corte, ya
 * es cobranza, y la cobranza recupera mucho menos.
 *
 * La decisión de diseño que lo hace útil: **los umbrales son RELATIVOS al
 * hábito de cada socio, no absolutos**. Quien viene cuatro veces por semana y
 * lleva diez días sin aparecer es una alarma; quien viene una vez por semana y
 * lleva diez días, no. Un umbral fijo de catorce días llega tarde para el
 * primero y produce ruido para el segundo — y una alerta con ruido se ignora,
 * que es peor que no tenerla.
 */

import { PLAZOS_DEL_SOCIO, type PlazosDelSocio } from './plazos-del-socio.js';

const MS_DIA = 86_400_000;

export type EngagementState =
  /** Recién inscrito: aún no hay hábito que medir. */
  | 'NEW'
  /** Pasó el margen inicial y casi no ha venido. La ventana de rescate. */
  | 'ONBOARDING_AT_RISK'
  /** Viene dentro de su propio patrón. */
  | 'REGULAR'
  /** Se está saliendo de su patrón. Aquí es donde se contacta. */
  | 'SLIPPING'
  /** Lleva mucho fuera de su patrón. */
  | 'DORMANT'
  /** Sin señales de vida. */
  | 'LOST';

/**
 * LOS UMBRALES INTERNOS DE LA REGLA DE HÁBITO (D15-03, D15-04, D15-07;
 * auditoría 8, informe 15). No son plazos que el gimnasio ajuste: afinan
 * cuándo hay un hábito que medir. Todo lo que aquí se declara se USA en
 * `classifyEngagement` o `expectedGapDays`: un umbral declarado y no aplicado
 * (15-17) es una promesa falsa.
 *
 * Los dos plazos de D-18 que usa esta regla («dejó de venir» a los 21 días y
 * «perdido» a los 60) NO están aquí: viven en `plazos-del-socio.ts`, que es
 * su única definición, y llegan por `EngagementInput.plazos` con lo que el
 * gimnasio tenga ajustado (bloque 4.4).
 */
export const RETENTION_THRESHOLDS = {
  /** Margen inicial antes de medir a un socio nuevo. */
  newMemberGraceDays: 14,
  /** Visitas mínimas esperadas en el primer mes y medio. */
  onboardingMinVisits: 4,
  onboardingWindowDays: 45,
  /** Visitas que hay que fallar para considerar que se está saliendo. */
  slippingMissedVisits: 2,
  dormantMissedVisits: 5,
  /**
   * Ninguna alerta por hábito antes de estos días sin venir (15-04): quien
   * viene a diario y faltó un puente de cuatro días con su fin de semana no
   * «afloja», descansó. Seis días cubren el puente más largo del calendario.
   */
  slippingMinDays: 6,
  /**
   * Tras descongelar la membresía, una semana antes de medirlo (D15-07):
   * quien pidió pausa no «dejó de venir», y al volver necesita retomar.
   */
  unfrozenGraceDays: 7,
  /**
   * Mínimo de visitas en la ventana de línea base para que exista un
   * «hábito» que comparar. Con menos, el intervalo medido es ruido (una
   * visita en seis semanas «mide» un hábito de cada 42 días y ese socio nunca
   * aflojaría, 15-17) y se usa el intervalo por defecto.
   */
  minVisitsForBaseline: 4,
  /**
   * La línea base se mide en las `baselineWeeks` semanas que terminan
   * `baselineLagDays` días antes de hoy: si entraran las últimas dos
   * semanas, dejar de venir bajaría la propia línea base y la alerta no
   * saltaría nunca. El repositorio arma su consulta con estos dos valores.
   */
  baselineWeeks: 6,
  baselineLagDays: 14,
  /** Si no hay hábito medible, se usa este intervalo por defecto. */
  fallbackExpectedGapDays: 7,
  /**
   * Un contacto registrado («le llamé») cuenta como hecho durante estos días:
   * mientras, el socio baja a «Ya contactados» y la lista no pide volver a
   * llamarle, salvo que su próximo paso ya toque.
   */
  contactValidDays: 14,
} as const;

export type EngagementInput = {
  readonly joinedAt: Date;
  readonly lastVisitAt: Date | null;
  readonly totalVisits: number;
  /**
   * Visitas por semana del propio socio, calculadas sobre su historial
   * EXCLUYENDO las últimas semanas: si se incluyeran, dejar de venir bajaría
   * la línea base y la alerta nunca saltaría.
   */
  readonly baselineVisitsPerWeek: number | null;
  /**
   * Cuándo se descongeló su membresía por última vez, si fue después de su
   * última visita (D15-07). Mientras estuvo congelado no «dejó de venir»: los
   * días sin venir se cuentan desde que se reanudó, con una semana de gracia.
   * `null` o ausente = sin pausa que considerar.
   */
  readonly resumedAt?: Date | null;
  /**
   * Los plazos del gimnasio (D-18): a cuántos días sin venir «dejó de venir»
   * y a cuántos se da por «perdido». Sin ellos valen los de fábrica.
   */
  readonly plazos?: Pick<PlazosDelSocio, 'dormantDays' | 'lostDays'>;
  readonly now: Date;
};

export type EngagementVerdict = {
  readonly state: EngagementState;
  readonly daysSinceLastVisit: number | null;
  readonly daysSinceJoined: number;
  /** Intervalo esperado entre visitas, según SU hábito. */
  readonly expectedGapDays: number;
  /** Cuántas visitas suyas se ha saltado. Es la medida que importa. */
  readonly missedVisits: number;
  /** ¿Merece que alguien lo llame? */
  readonly needsOutreach: boolean;
  readonly detail: string;
};

function dias(desde: Date, hasta: Date): number {
  return Math.floor((hasta.getTime() - desde.getTime()) / MS_DIA);
}

/**
 * Intervalo esperado entre visitas de ESTE socio.
 *
 * Sin hábito medible se usa un valor por defecto, pero se marca como tal:
 * tratar a un socio sin historial como si viniera semanalmente produciría
 * alertas inventadas.
 */
export function expectedGapDays(baselineVisitsPerWeek: number | null): number {
  const T = RETENTION_THRESHOLDS;
  if (baselineVisitsPerWeek === null || baselineVisitsPerWeek <= 0) {
    return T.fallbackExpectedGapDays;
  }
  // Con menos de `minVisitsForBaseline` visitas en la ventana no hay hábito
  // que medir (15-17): el intervalo saldría de una o dos visitas sueltas.
  const visitasEnVentana = Math.round(baselineVisitsPerWeek * T.baselineWeeks * 1e6) / 1e6;
  if (visitasEnVentana < T.minVisitsForBaseline) return T.fallbackExpectedGapDays;
  return 7 / baselineVisitsPerWeek;
}

export function classifyEngagement(input: EngagementInput): EngagementVerdict {
  const T = RETENTION_THRESHOLDS;
  const P = input.plazos ?? PLAZOS_DEL_SOCIO;
  const desdeAlta = dias(input.joinedAt, input.now);
  const desdeUltimaVisita = input.lastVisitAt === null ? null : dias(input.lastVisitAt, input.now);

  /**
   * Pausa (D15-07): si la membresía se descongeló después de su última
   * visita, los días «sin venir» se cuentan desde que se reanudó. Mientras
   * estuvo congelado no dejó de venir: pidió pausa.
   */
  const reanudo = input.resumedAt ?? null;
  const pausado = reanudo !== null && (input.lastVisitAt === null || input.lastVisitAt.getTime() < reanudo.getTime());
  const desdeReanudo = pausado ? dias(reanudo, input.now) : null;
  const desdeVisita = pausado ? desdeReanudo : desdeUltimaVisita;

  const brecha = expectedGapDays(input.baselineVisitsPerWeek);

  const falladas = desdeVisita === null
    ? Math.floor(desdeAlta / brecha)
    : Math.floor(desdeVisita / brecha);

  const base = { daysSinceLastVisit: desdeUltimaVisita, daysSinceJoined: desdeAlta, expectedGapDays: brecha, missedVisits: falladas };
  const sinVenir = pausado
    ? `Descongeló hace ${desdeReanudo} días y no ha vuelto`
    : `Lleva ${desdeVisita} días sin venir`;

  // Perdido gana sobre todo lo demás: da igual su hábito si lleva tanto sin venir (D-18: 60 días).
  if (desdeVisita !== null && desdeVisita >= P.lostDays) {
    return { ...base, state: 'LOST', needsOutreach: false,
      detail: desdeUltimaVisita === null ? `Se inscribió hace ${desdeAlta} días y NUNCA vino` : `Sin venir ${desdeUltimaVisita} días. Se da por perdido` };
  }
  if (desdeVisita === null && desdeAlta >= P.lostDays) {
    return { ...base, state: 'LOST', needsOutreach: false,
      detail: `Se inscribió hace ${desdeAlta} días y NUNCA vino` };
  }

  // Socio nuevo: todavía no hay hábito que medir.
  if (desdeAlta < T.newMemberGraceDays) {
    return { ...base, state: 'NEW', needsOutreach: false,
      detail: `Alta hace ${desdeAlta} días` };
  }

  // Recién descongelado: una semana para retomar antes de medirlo (D15-07).
  if (pausado && desdeReanudo !== null && desdeReanudo < T.unfrozenGraceDays) {
    return { ...base, state: 'REGULAR', needsOutreach: false,
      detail: desdeReanudo === 0 ? 'Descongeló hoy; tiene una semana para retomar' : `Descongeló hace ${desdeReanudo} días; tiene una semana para retomar` };
  }

  /**
   * Onboarding fallido: la ventana de rescate más valiosa del catálogo.
   * Un socio que no cogió el hábito en el primer mes y medio se va a ir,
   * y todavía está pagando — es decir, todavía se puede hacer algo.
   */
  if (desdeAlta <= T.onboardingWindowDays && input.totalVisits < T.onboardingMinVisits) {
    return { ...base, state: 'ONBOARDING_AT_RISK', needsOutreach: true,
      detail: `${input.totalVisits === 0 ? 'Ninguna visita' : input.totalVisits === 1 ? 'Una visita' : `${input.totalVisits} visitas`} en ${desdeAlta} días desde el alta. No ha cogido el hábito` };
  }

  if (desdeVisita === null) {
    return { ...base, state: 'DORMANT', needsOutreach: true,
      detail: `Se inscribió hace ${desdeAlta} días y no ha venido nunca` };
  }
  // Un fin de semana o un puente no es aflojar (15-04): antes de
  // `slippingMinDays` no hay alerta por hábito, venga como venga.
  if (desdeVisita < T.slippingMinDays) {
    return { ...base, state: 'REGULAR', needsOutreach: false, detail: 'Dentro de su rutina' };
  }
  // A los días de «dejó de venir» (D-18: 21) ya dejó de venir aunque su hábito
  // fuera flojo (15-03): quien venía cada 11 días no «afloja» a los 45, se fue.
  if (desdeVisita >= P.dormantDays || falladas >= T.dormantMissedVisits) {
    return { ...base, state: 'DORMANT', needsOutreach: true,
      detail: `${sinVenir}; suele venir cada ${cadaCuanto(brecha)}` };
  }
  if (falladas >= T.slippingMissedVisits) {
    return { ...base, state: 'SLIPPING', needsOutreach: true,
      detail: pausado ? `${sinVenir}; suele venir cada ${cadaCuanto(brecha)}` : `Se está saliendo de su rutina: ${desdeVisita} días sin venir, suele venir cada ${cadaCuanto(brecha)}` };
  }

  return { ...base, state: 'REGULAR', needsOutreach: false, detail: 'Dentro de su rutina' };
}

// ── Seguimiento («le llamé») ────────────────────────────────────────────────

/** Por dónde se contactó (`follow_ups.channel`). */
export const FOLLOW_UP_CHANNELS = ['CALL', 'WHATSAPP', 'VISIT', 'OTHER'] as const;
export type FollowUpChannel = (typeof FOLLOW_UP_CHANNELS)[number];

/**
 * Qué pasó (`follow_ups.outcome`). Prospecto: ¿se inscribe? Socio en riesgo: ¿regresa?
 * `TRIAL_VISIT` («Vino a probar») e `INTAKE_SENT` («Se le mandó el alta digital») son solo
 * de un interesado (bloque 2.4): cuáles valen para quién lo dice `PROSPECT_OUTCOMES`
 * (`captacion.ts`) y, para el socio en riesgo, `MEMBER_OUTCOMES`. `MESSAGE_SENT` («Se le mandó
 * mensaje») no lo elige nadie en un diálogo: lo anota la bandeja de salida al mandar un
 * «te extrañamos» desde Mensajes (bloque 2.9, 15-08).
 */
export const FOLLOW_UP_OUTCOMES = ['ANSWERED', 'NO_ANSWER', 'INTERESTED', 'NOT_INTERESTED', 'COMING_BACK', 'TRIAL_VISIT', 'INTAKE_SENT', 'MESSAGE_SENT'] as const;
/** Los resultados que valen para un socio en riesgo (Retención). */
export const MEMBER_OUTCOMES = ['COMING_BACK', 'ANSWERED', 'NO_ANSWER', 'NOT_INTERESTED', 'INTERESTED'] as const satisfies readonly (typeof FOLLOW_UP_OUTCOMES)[number][];
export type FollowUpOutcome = (typeof FOLLOW_UP_OUTCOMES)[number];

/**
 * Qué hace la lista de Retención con un socio según su último contacto:
 * pedir que se le llame, o dejarlo en «Ya contactados». La regla vivía en la
 * pantalla sin prueba (informe 15, §5). Reaparecer al día siguiente tras «no
 * contestó» y cerrar solo como «volvió» (15-07) son de la fase 2.
 */
export type ContactStatus = 'POR_LLAMAR' | 'CONTACTADO';

export function contactStatus(
  last: { readonly createdAt: Date | string; readonly nextStepOn: string | null } | null | undefined,
  /** Hoy en el gimnasio, `AAAA-MM-DD`. */
  today: string,
  now: Date = new Date(),
): ContactStatus {
  if (!last) return 'POR_LLAMAR';
  // Le toca el próximo paso (hoy o ya pasó): vuelve a la lista.
  if (last.nextStepOn && last.nextStepOn <= today) return 'POR_LLAMAR';
  const hace = now.getTime() - new Date(last.createdAt).getTime();
  return hace < RETENTION_THRESHOLDS.contactValidDays * MS_DIA ? 'CONTACTADO' : 'POR_LLAMAR';
}

/**
 * Prioridad de contacto.
 *
 * Recepción no puede llamar a doscientas personas: la lista tiene que venir
 * ordenada por dónde está el retorno. Pesa el valor del socio (antigüedad y
 * cuota) por la urgencia de su estado.
 */
export type OutreachCandidate = {
  readonly memberId: string;
  readonly state: EngagementState;
  readonly missedVisits: number;
  readonly tenureDays: number;
  readonly monthlyValueCents: bigint;
};

const URGENCIA: Readonly<Record<EngagementState, number>> = {
  ONBOARDING_AT_RISK: 100,   // la ventana más corta y la más recuperable
  SLIPPING: 80,              // todavía está en su rutina, solo se desvía
  DORMANT: 40,               // recuperable, pero cuesta más
  LOST: 0,
  NEW: 0,
  REGULAR: 0,
};

export function outreachPriority(c: OutreachCandidate): number {
  const urgencia = URGENCIA[c.state];
  if (urgencia === 0) return 0;
  // La antigüedad pondera hasta duplicar: perder a alguien de tres años
  // cuesta más que perder a alguien de tres meses.
  const antiguedad = 1 + Math.min(c.tenureDays / 730, 1);
  const valor = Number(c.monthlyValueCents) / 100_000;
  return urgencia * antiguedad * (1 + valor);
}

export function rankOutreach(candidates: readonly OutreachCandidate[]): OutreachCandidate[] {
  return [...candidates]
    .filter((c) => URGENCIA[c.state] > 0)
    .sort((a, b) => {
      const d = outreachPriority(b) - outreachPriority(a);
      return d !== 0 ? d : a.memberId.localeCompare(b.memberId);
    });
}

// ── Pantalla de excepción ───────────────────────────────────────────────────

/**
 * Las TRES acciones del mostrador.
 *
 * Tres y no más: la pantalla se usa con un socio delante y una cola detrás. El
 * criterio del sprint es resolver el rechazo en veinte segundos, y eso no se
 * consigue con un menú.
 */
export type ExceptionAction = 'COLLECT_AND_OPEN' | 'GRANT_ONCE' | 'REFUSE';

export type ExceptionOption = {
  readonly action: ExceptionAction;
  readonly label: string;
  readonly requiresReason: boolean;
  readonly primary: boolean;
};

/**
 * Qué se le ofrece a recepción según por qué se rechazó.
 *
 * El botón principal cambia con el motivo: ante una deuda, cobrar; ante
 * cualquier otro rechazo levantable, dejar pasar. Poner siempre el mismo
 * primero haría que se pulsara sin leer.
 */
export function exceptionOptions(input: {
  readonly reason: string;
  readonly overridable: boolean;
  readonly outstandingCents: bigint | null;
}): ExceptionOption[] {
  if (!input.overridable) {
    return [{ action: 'REFUSE', label: 'No dejar pasar', requiresReason: false, primary: true }];
  }

  const puedeCobrar = input.reason === 'MEMBERSHIP_PAST_DUE'
    && input.outstandingCents !== null && input.outstandingCents > 0n;

  return [
    ...(puedeCobrar
      ? [{ action: 'COLLECT_AND_OPEN' as const, label: 'Cobrar y abrir', requiresReason: false, primary: true }]
      : []),
    {
      action: 'GRANT_ONCE',
      label: 'Dejar pasar por hoy',
      // El motivo es lo que convierte el favor en un dato.
      requiresReason: true,
      primary: !puedeCobrar,
    },
    { action: 'REFUSE', label: 'No dejar pasar', requiresReason: false, primary: false },
  ];
}

/** "cada 3 días", "cada semana": nunca "cada 10.5" (UX5-G-06). */
function cadaCuanto(dias: number): string {
  const d = Math.max(1, Math.round(dias));
  if (d === 1) return 'día';
  if (d === 7) return 'semana';
  if (d >= 13 && d <= 15) return 'dos semanas';
  return `${d} días`;
}
