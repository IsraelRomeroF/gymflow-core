import { masDias } from './calendario.js';
import { formatMoney, money } from './money.js';
import { businessDateIn, isoDate, resolveWallTime } from './time.js';

/**
 * AVISOS AL TELÉFONO DE LA DUEÑA Y RESUMEN DEL LUNES (auditoría 8, fase 4,
 * bloque 4.2; decisión D-05, opción c: «alertas al momento + resumen del lunes
 * 7:00; cada aviso se puede apagar»).
 *
 * Aquí vive lo que no necesita base de datos, para que la API, el panel y las
 * pruebas digan lo mismo:
 *
 *  - EL CATÁLOGO: qué avisos existen, cómo se llaman y quién los manda. Son
 *    pocos a propósito: lo que D-05 enumeró (caja abierta después del cierre,
 *    corte con diferencia, tope de pases, fallos con la contraseña, solicitud
 *    de privacidad por vencer; la factura de GymFlow ya avisa por su cuenta y
 *    llega siempre, ver `OWNER_ALERTS_ALWAYS`) y lo que hoy espera a la
 *    dueña o mueve dinero sin que ella se entere (su firma en el aviso de
 *    privacidad y en la lista de exsocios, la cuarta insistencia de una firma,
 *    un cambio de precio, la deuda que salió de «Por cobrar»).
 *  - LOS TEXTOS: lo que suena en el teléfono NO lleva nombres de socios (la
 *    pantalla bloqueada la ve cualquiera); el detalle se lee dentro del panel.
 *  - EL LUNES: qué semana resume y desde qué instante toca, con la hora del
 *    gimnasio y no la del servidor.
 *
 * Sin costo (D-34): son notificaciones del navegador con las llaves del propio
 * servidor. Sin llaves o sin dirección fija el teléfono no suena, y por eso
 * todo aviso existe también dentro del panel.
 *
 * Las solicitudes de firma y los avisos de la cuenta con GymFlow NO están en
 * este catálogo: llegan siempre que el equipo tenga los avisos activos
 * (`OWNER_ALERTS_ALWAYS` dice por qué).
 */

/** Quién arma y manda cada aviso. */
export type OwnerAlertOrigin =
  /** El job `audit.anomaly-scan` (cada 15 minutos): queda en la lista de avisos del panel. */
  | 'scan'
  /** El job `alerts.weekly-summary`: el resumen del lunes. */
  | 'weekly'
  /** El módulo que ya lo mandaba antes de este bloque; aquí solo se puede apagar. Su lugar en el panel es el suyo. */
  | 'own';

export const OWNER_ALERT_KINDS = [
  'CASH_UNCLOSED',
  'CASH_VARIANCE',
  'ENTRY_EXCEPTIONS_OVER_LIMIT',
  'PRIVACY_REQUEST_DUE',
  'NOTICE_SIGNATURE_PENDING',
  'SIGNATURE_INSISTENCE',
  'PLAN_PRICE_CHANGE',
  'DEBT_LOST',
  'WEEKLY_SUMMARY',
  'PASSWORD_FAILS',
  'EXMEMBERS_LIST',
] as const;
export type OwnerAlertKind = (typeof OWNER_ALERT_KINDS)[number];

export const esOwnerAlertKind = (v: unknown): v is OwnerAlertKind => typeof v === 'string' && (OWNER_ALERT_KINDS as readonly string[]).includes(v);

export type OwnerAlertSpec = {
  /** Cómo se llama en «Qué avisos recibo». */
  readonly label: string;
  /** Cuándo suena, en una frase. */
  readonly description: string;
  readonly origin: OwnerAlertOrigin;
  /** Dónde se ve dentro del panel aunque el teléfono no suene. */
  readonly inPanel: string;
};

export const OWNER_ALERT_CATALOG: Readonly<Record<OwnerAlertKind, OwnerAlertSpec>> = {
  CASH_UNCLOSED: {
    label: 'Caja sin cortar',
    description: 'Una caja amaneció abierta: nadie hizo el corte al cerrar.',
    origin: 'scan', inPanel: 'Avisos y Cortes de caja',
  },
  CASH_VARIANCE: {
    label: 'Corte con diferencia',
    description: 'Un corte cerró con una diferencia mayor a la tolerancia y queda por revisar.',
    origin: 'scan', inPanel: 'Avisos y Cortes de caja',
  },
  ENTRY_EXCEPTIONS_OVER_LIMIT: {
    label: 'Tope de pases',
    description: 'Alguien dejó pasar por excepción más veces de las que su puesto permite en un día.',
    origin: 'scan', inPanel: 'Avisos y Bitácora',
  },
  PRIVACY_REQUEST_DUE: {
    label: 'Solicitud de privacidad por vencer',
    description: 'A una solicitud de un socio sobre sus datos le quedan 5 días o menos del plazo de ley.',
    origin: 'scan', inPanel: 'Avisos e Inicio',
  },
  NOTICE_SIGNATURE_PENDING: {
    label: 'Aviso de privacidad por firmar',
    description: 'La gerencia pidió publicar un aviso de privacidad nuevo y espera tu firma.',
    origin: 'scan', inPanel: 'Avisos, Inicio y Textos de consentimiento',
  },
  SIGNATURE_INSISTENCE: {
    label: 'Insistencia con una firma',
    description: 'Alguien pidió por cuarta vez en una hora la misma autorización.',
    origin: 'scan', inPanel: 'Avisos y Bitácora',
  },
  PLAN_PRICE_CHANGE: {
    label: 'Cambio de precio',
    description: 'Cambió el precio de un plan.',
    origin: 'scan', inPanel: 'Avisos y Bitácora',
  },
  DEBT_LOST: {
    label: 'Deuda dada por perdida',
    description: 'El cierre de la noche sacó deuda de «Por cobrar» por haber cumplido el plazo.',
    origin: 'scan', inPanel: 'Avisos y Bitácora',
  },
  WEEKLY_SUMMARY: {
    label: 'Resumen del lunes',
    description: 'Cada lunes a las 7:00, la semana en cifras.',
    origin: 'weekly', inPanel: 'Avisos',
  },
  PASSWORD_FAILS: {
    label: 'Fallos con tu contraseña',
    description: 'Alguien tecleó mal tu contraseña varias veces al pedir una firma, o unas firmas quedaron en pausa.',
    origin: 'own', inPanel: 'Bitácora',
  },
  EXMEMBERS_LIST: {
    label: 'Lista de exsocios por firmar',
    description: 'Se armó la lista mensual de exsocios que cumplieron el plazo de conservación.',
    origin: 'own', inPanel: 'Inicio y Autorizaciones',
  },
};

/**
 * LO QUE LLEGA SIEMPRE mientras el equipo tenga los avisos activos (no se
 * apaga por tipo): se enseña en «Qué avisos recibo» para que la lista sea
 * completa.
 *  - Las solicitudes de firma: el mostrador está esperando la respuesta.
 *  - La cuenta con GymFlow: es un aviso de cobro y su entrega cuenta para la
 *    suspensión del servicio (D-37); lo manda `tenants` y también sale fijo
 *    arriba del panel.
 */
export const OWNER_ALERTS_ALWAYS: ReadonlyArray<{ readonly label: string; readonly description: string }> = [
  { label: 'Solicitudes de firma', description: 'Alguien del mostrador espera tu autorización. También las respuestas a lo que tú pediste.' },
  { label: 'Tu cuenta con GymFlow', description: 'Factura nueva, factura vencida, servicio suspendido o cambio de la mensualidad.' },
];

/** Los que arma este bloque y quedan en la lista de avisos del panel. */
export const OWNER_ALERTS_IN_LIST: readonly OwnerAlertKind[] = OWNER_ALERT_KINDS.filter((k) => OWNER_ALERT_CATALOG[k].origin !== 'own');

/** A cuántos días del vencimiento se avisa de una solicitud de privacidad (D-05). */
export const PRIVACY_REQUEST_ALERT_DAYS = 5;

/** Hasta cuántos días atrás mira el escaneo (si la computadora estuvo apagada, lo más viejo ya no suena). */
export const OWNER_ALERT_LOOKBACK_DAYS = 7;

// ── Textos ───────────────────────────────────────────────────────────────────

export type OwnerAlertText = { readonly title: string; readonly body: string; readonly url: string };

const pesos = (centavos: string | bigint): string => formatMoney(money(BigInt(centavos)));
const enteros = (n: number): string => new Intl.NumberFormat('es-MX').format(n);
const lugar = (caja: string | null, sede: string | null): string => [caja, sede ? `(${sede})` : null].filter(Boolean).join(' ') || 'una caja';

/** Lo que cada aviso necesita para decir su frase. Ningún campo es el nombre de un socio. */
export type OwnerAlertFacts =
  | { kind: 'CASH_UNCLOSED'; registerName: string | null; branchName: string | null; businessDate: string }
  | { kind: 'CASH_VARIANCE'; registerName: string | null; branchName: string | null; varianceCents: string }
  | { kind: 'ENTRY_EXCEPTIONS_OVER_LIMIT'; branchName: string | null; count: number; limit: number }
  | { kind: 'PRIVACY_REQUEST_DUE'; daysLeft: number }
  | { kind: 'NOTICE_SIGNATURE_PENDING'; version: string | null }
  | { kind: 'SIGNATURE_INSISTENCE'; branchName: string | null }
  | { kind: 'PLAN_PRICE_CHANGE'; planName: string | null }
  | { kind: 'DEBT_LOST'; amountCents: string; members: number };

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «16 de noviembre». */
export function diaYMes(fecha: string): string {
  const [, m, d] = fecha.slice(0, 10).split('-');
  return `${Number(d)} de ${MESES[Number(m) - 1] ?? ''}`;
}

/** «16 al 22 de noviembre» o «30 de noviembre al 6 de diciembre». */
export function rangoDeSemana(desde: string, ultimoDia: string): string {
  return desde.slice(0, 7) === ultimoDia.slice(0, 7) ? `${Number(desde.slice(8, 10))} al ${diaYMes(ultimoDia)}` : `${diaYMes(desde)} al ${diaYMes(ultimoDia)}`;
}

/**
 * El texto que suena en el teléfono. Dice dónde y cuánto, nunca quién: los
 * nombres (de socios y de personal) se leen dentro del panel.
 */
export function textoDeAviso(f: OwnerAlertFacts): OwnerAlertText {
  switch (f.kind) {
    case 'CASH_UNCLOSED':
      return { title: 'Caja sin cortar', body: `${lugar(f.registerName, f.branchName)} sigue abierta desde el ${diaYMes(f.businessDate)}: nadie hizo el corte.`, url: '/avisos' };
    case 'CASH_VARIANCE': {
      const v = BigInt(f.varianceCents);
      return {
        title: v < 0n ? 'Corte con faltante' : 'Corte con sobrante',
        body: `El corte de ${lugar(f.registerName, f.branchName)} cerró con ${v < 0n ? `un faltante de ${pesos(-v)}` : `un sobrante de ${pesos(v)}`}. Queda por revisar.`,
        url: '/avisos',
      };
    }
    case 'ENTRY_EXCEPTIONS_OVER_LIMIT':
      return { title: 'Tope de pases rebasado', body: `Alguien del mostrador${f.branchName ? ` de ${f.branchName}` : ''} dejó pasar por excepción ${enteros(f.count)} veces hoy; su tope es ${enteros(f.limit)}.`, url: '/avisos' };
    case 'PRIVACY_REQUEST_DUE':
      return {
        title: 'Solicitud de privacidad por vencer',
        body: f.daysLeft < 0 ? 'Una solicitud de un socio sobre sus datos ya pasó del plazo de ley sin respuesta.'
          : f.daysLeft === 0 ? 'Una solicitud de un socio sobre sus datos vence hoy.'
            : `A una solicitud de un socio sobre sus datos le ${f.daysLeft === 1 ? 'queda 1 día' : `quedan ${f.daysLeft} días`} del plazo de ley.`,
        url: '/avisos',
      };
    case 'NOTICE_SIGNATURE_PENDING':
      return { title: 'El aviso de privacidad espera tu firma', body: `La gerencia pidió publicar ${f.version ? `la versión ${f.version}` : 'una versión nueva'}. No se publica hasta que lo leas y lo firmes.`, url: '/consentimientos' };
    case 'SIGNATURE_INSISTENCE':
      return { title: 'Insistencia con una firma', body: `Alguien${f.branchName ? ` en ${f.branchName}` : ''} pidió por cuarta vez en una hora la misma autorización. La solicitud no salió.`, url: '/avisos' };
    case 'PLAN_PRICE_CHANGE':
      return { title: 'Cambió un precio', body: `Cambió el precio ${f.planName ? `del plan ${f.planName}` : 'de un plan'}. Quién y cuánto, en el panel.`, url: '/avisos' };
    case 'DEBT_LOST':
      return { title: 'Deuda dada por perdida', body: `Anoche ${pesos(f.amountCents)} ${f.members === 1 ? 'de un socio' : `de ${enteros(f.members)} socios`} salieron de «Por cobrar» por cumplir el plazo. No se borraron: siguen en su ficha.`, url: '/avisos' };
  }
}

// ── El resumen del lunes ─────────────────────────────────────────────────────

/** El día de la semana (lunes) y la hora local en que toca el resumen (D-05). */
export const WEEKLY_SUMMARY_HOUR = 7;

export type SemanaDelResumen = {
  /** El lunes en que toca mandarlo. */
  readonly monday: string;
  /** La semana que resume: de lunes a domingo. `to` es el lunes siguiente (fin semiabierto). */
  readonly from: string;
  readonly to: string;
  /** El instante del lunes a las 7:00 en la zona del gimnasio. */
  readonly dueAt: Date;
};

/**
 * QUÉ RESUMEN TOCA en este instante: el del lunes más reciente cuyas 7:00
 * (hora del gimnasio) ya pasaron. Un domingo, o un lunes a las 6:59, sigue
 * tocando el de la semana anterior: la computadora que estuvo apagada el lunes
 * lo manda al encender, y nunca dos veces (lo cuida quien lo guarda).
 */
export function semanaDelResumen(zona: string, ahora: Date = new Date()): SemanaDelResumen {
  const hoy = businessDateIn(zona, ahora);
  // getUTCDay: 0 = domingo … 1 = lunes.
  const desdeLunes = (hoy.getUTCDay() + 6) % 7;
  let monday = masDias(isoDate(hoy), -desdeLunes);
  const sieteDe = (lunes: string): Date => {
    const [a, m, d] = lunes.split('-').map(Number) as [number, number, number];
    return resolveWallTime(zona, a, m, d, WEEKLY_SUMMARY_HOUR, 0).at;
  };
  if (ahora.getTime() < sieteDe(monday).getTime()) monday = masDias(monday, -7);
  return { monday, from: masDias(monday, -7), to: monday, dueAt: sieteDe(monday) };
}

/** Las cifras de una semana. Todo son cuentas: ni un nombre de socio. */
export type WeeklyFigures = {
  readonly entries: { readonly total: number; readonly previous: number };
  readonly members: { readonly joined: number; readonly left: number };
  readonly money: {
    readonly collectedCents: string; readonly previousCollectedCents: string;
    readonly outstandingCents: string; readonly overdueCents: string;
    readonly refunds: { readonly count: number; readonly cents: string };
    readonly discounts: number; readonly backdatedSales: number; readonly lostDebtCents: string;
  };
  readonly cash: { readonly variances: number; readonly shortCents: string; readonly overCents: string; readonly pendingReview: number };
  readonly signatures: { readonly requested: number; readonly approved: number; readonly rejected: number };
  readonly awaiting: { readonly approvals: number; readonly privacyNotice: number; readonly exMembersList: number };
  readonly exceptions: { readonly manualEntries: number; readonly overLimit: number; readonly withoutFace: number; readonly sharedPhoneChanges: number };
  readonly audit: { readonly intact: boolean | null; readonly checked: number };
};

export const esperanFirma = (f: WeeklyFigures): number => f.awaiting.approvals + f.awaiting.privacyNotice + f.awaiting.exMembersList;

/**
 * El texto del resumen que suena el lunes: la semana en una línea de cifras.
 * Lo demás (por persona, por sede, la bitácora) se lee dentro del panel.
 */
export function textoDelResumen(semana: { from: string; to: string }, f: WeeklyFigures): OwnerAlertText {
  const partes = [
    `${enteros(f.entries.total)} ${f.entries.total === 1 ? 'entrada' : 'entradas'}`,
    `${enteros(f.members.joined)} ${f.members.joined === 1 ? 'alta' : 'altas'} y ${enteros(f.members.left)} ${f.members.left === 1 ? 'baja' : 'bajas'}`,
    `cobrado ${pesos(f.money.collectedCents)}`,
    `por cobrar ${pesos(f.money.outstandingCents)}`,
    f.cash.variances === 0 ? 'cortes sin diferencia' : `${enteros(f.cash.variances)} ${f.cash.variances === 1 ? 'corte con diferencia' : 'cortes con diferencia'}`,
    `${enteros(f.signatures.requested)} ${f.signatures.requested === 1 ? 'firma pedida' : 'firmas pedidas'}`,
  ];
  const espera = esperanFirma(f);
  if (espera > 0) partes.push(espera === 1 ? '1 cosa espera tu firma' : `${enteros(espera)} cosas esperan tu firma`);
  if (f.audit.intact === false) partes.push('la bitácora NO verifica: revísala');
  return { title: `Tu semana (${rangoDeSemana(semana.from, masDias(semana.to, -1))})`, body: `${partes.join(' · ')}.`, url: '/avisos' };
}
