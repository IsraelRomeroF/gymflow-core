/**
 * PRIVACIDAD Y DERECHOS ARCO (auditoría 8, bloque 1.10; informe 21).
 *
 * Lo que la API, el panel y el portal tienen que decir igual sobre las
 * solicitudes del socio, los permisos que puede retirar y lo que el aviso de
 * privacidad no puede dejar de decir. Sin I/O y sin Zod: lo importa el
 * navegador (`@gymflow/core/privacidad`).
 *
 * Plazos (LFPDPPP): 20 días hábiles para responder y 15 más para hacer
 * efectivo lo que procede. El gimnasio no lleva calendario de feriados, así
 * que se guardan ya convertidos a días naturales, siempre a favor del socio.
 * La interfaz no cita artículos (21-25): solo plazos.
 */
import type { ConsentType } from './intake.js';

// ── Solicitudes ARCO ─────────────────────────────────────────────────────────

export const TIPOS_DE_SOLICITUD_ARCO = ['ACCESS', 'RECTIFICATION', 'CANCELLATION', 'OPPOSITION', 'REVOCATION'] as const;
export type TipoDeSolicitudArco = (typeof TIPOS_DE_SOLICITUD_ARCO)[number];

export const CANALES_DE_SOLICITUD_ARCO = ['FRONT_DESK', 'PORTAL', 'EMAIL', 'WRITTEN'] as const;
export type CanalDeSolicitudArco = (typeof CANALES_DE_SOLICITUD_ARCO)[number];

/** Lo que el socio puede pedir desde su teléfono (lo demás lo registra recepción). */
export const SOLICITUDES_DESDE_EL_PORTAL: readonly TipoDeSolicitudArco[] = ['ACCESS', 'RECTIFICATION', 'CANCELLATION', 'OPPOSITION'];

const solicitudes = {
  ACCESS: { personal: 'Acceso (copia de sus datos)', socio: 'Una copia de todos mis datos' },
  RECTIFICATION: { personal: 'Rectificación (corregir un dato)', socio: 'Corregir un dato mío' },
  CANCELLATION: { personal: 'Cancelación (borrar sus datos)', socio: 'Que borren mis datos' },
  OPPOSITION: { personal: 'Oposición (que no se usen para algo)', socio: 'Que no usen mis datos para algo' },
  REVOCATION: { personal: 'Revocar un consentimiento', socio: 'Retirar un permiso que di' },
} as const satisfies Record<TipoDeSolicitudArco, { personal: string; socio: string }>;

/** Qué pide, en las dos voces. */
export const TIPO_DE_SOLICITUD_ARCO: Readonly<Record<string, { readonly personal: string; readonly socio: string }>> = solicitudes;
export const TIPO_DE_SOLICITUD_ARCO_PERSONAL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(solicitudes).map(([k, v]) => [k, v.personal]),
);
export const TIPO_DE_SOLICITUD_ARCO_SOCIO: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(solicitudes).map(([k, v]) => [k, v.socio]),
);

/** Por dónde llegó la solicitud. */
export const CANAL_DE_SOLICITUD_ARCO: Readonly<Record<string, string>> = {
  FRONT_DESK: 'En recepción', PORTAL: 'Desde su teléfono', EMAIL: 'Por correo', WRITTEN: 'Por escrito',
};

/**
 * En qué va la solicitud. Lo calcula el servidor con las fechas que guarda:
 *   IDENTITY_PENDING  llegó por correo o por escrito y nadie acreditó todavía
 *                     que la pide el titular: el plazo NO corre;
 *   OPEN              el plazo de respuesta corre;
 *   EFFECT_PENDING    se resolvió «Procede» y falta hacerlo efectivo (segundo plazo);
 *   CLOSED            «No procede», o «Procede» ya hecho efectivo.
 */
export const ESTADOS_DE_SOLICITUD_ARCO = ['IDENTITY_PENDING', 'OPEN', 'EFFECT_PENDING', 'CLOSED'] as const;
export type EstadoDeSolicitudArco = (typeof ESTADOS_DE_SOLICITUD_ARCO)[number];

export const ESTADO_DE_SOLICITUD_ARCO: Readonly<Record<EstadoDeSolicitudArco, { readonly personal: string; readonly socio: string }>> = {
  IDENTITY_PENDING: { personal: 'Falta acreditar identidad', socio: 'Falta que acredites tu identidad en recepción' },
  OPEN: { personal: 'Por responder', socio: 'La están revisando' },
  EFFECT_PENDING: { personal: 'Procede · falta hacerlo', socio: 'Procede: lo están haciendo' },
  CLOSED: { personal: 'Cerrada', socio: 'Resuelta' },
};

export const RESULTADOS_DE_SOLICITUD_ARCO = ['GRANTED', 'DENIED'] as const;
export type ResultadoDeSolicitudArco = (typeof RESULTADOS_DE_SOLICITUD_ARCO)[number];
export const RESULTADO_DE_SOLICITUD_ARCO: Readonly<Record<ResultadoDeSolicitudArco, { readonly personal: string; readonly socio: string }>> = {
  GRANTED: { personal: 'Procede', socio: 'Sí procede' },
  DENIED: { personal: 'No procede', socio: 'No procede' },
};

/** Plazos, en días hábiles (lo que dice la ley) y naturales (lo que se guarda y se mide). */
export const PLAZOS_ARCO = {
  /** Responder al socio: procede o no procede. */
  responder: { habiles: 20, naturales: 28 },
  /** Hacer efectivo lo que procede: borrar, corregir, entregar, dejar de usar. */
  hacerEfectiva: { habiles: 15, naturales: 21 },
} as const;

/**
 * Qué se hace cuando procede, por tipo. `inmediata`: el servidor la ejecuta
 * en el mismo acto de resolver (retirar el permiso); las demás las hace una
 * persona y después marca «Ya quedó hecho» (o el acto las marca solo: la
 * descarga para ACCESS y la anonimización para CANCELLATION).
 */
export const ACCION_POR_SOLICITUD: Readonly<Record<TipoDeSolicitudArco, { readonly texto: string; readonly inmediata: boolean }>> = {
  ACCESS: { texto: 'Descargar sus datos y entregárselos', inmediata: false },
  RECTIFICATION: { texto: 'Corregir el dato en su ficha («Editar datos»)', inmediata: false },
  CANCELLATION: { texto: 'Darlo de baja y anonimizarlo (con la firma del dueño); lo contable se conserva', inmediata: false },
  OPPOSITION: { texto: 'Retirar el permiso que pide dejar de usar', inmediata: true },
  REVOCATION: { texto: 'Retirar el permiso que pide', inmediata: true },
};

/** Motivos de un toque, por acción (D26-01). */
export const MOTIVOS_DE_PRIVACIDAD = {
  registrarSolicitud: ['Lo pidió en el mostrador', 'Lo mandó por correo', 'Trajo un escrito'],
  noProcede: ['No se pudo acreditar que es el titular', 'Lo que pide no son datos personales suyos', 'La ley obliga a conservar ese dato', 'Ya se había atendido antes'],
  retirarConsentimiento: ['Lo pidió el socio', 'Solicitud ARCO', 'Error al registrarlo'],
  descargarDatos: ['Lo pidió en recepción', 'Solicitud ARCO de acceso', 'Lo pidió por escrito'],
} as const;

// ── Permisos que se retiran ──────────────────────────────────────────────────

/** Lo opcional, que el socio retira desde su teléfono sin ir a recepción. */
export const REVOCABLES_POR_EL_SOCIO: readonly ConsentType[] = ['MARKETING', 'HEALTH_DATA', 'RECURRING_CHARGE'];
/** Lo que se retira en recepción: lo opcional y la biometría (revoca el rostro y borra la plantilla). */
export const REVOCABLES_EN_RECEPCION: readonly ConsentType[] = ['MARKETING', 'HEALTH_DATA', 'RECURRING_CHARGE', 'BIOMETRIC'];

/** Lo que pasa al retirar cada permiso, dicho antes de confirmar (21-12). */
export const CONSECUENCIA_DE_RETIRAR: Readonly<Record<string, { readonly personal: string; readonly socio: string }>> = {
  MARKETING: { personal: 'Deja de recibir promociones y avisos de clases.', socio: 'Dejas de recibir promociones y avisos de clases. Puedes volver a aceptarlo cuando quieras.' },
  HEALTH_DATA: { personal: 'Se borra su nota de salud; el coach ya no la verá.', socio: 'Se borra la nota de salud que diste y tu coach ya no la verá. No se puede recuperar.' },
  RECURRING_CHARGE: { personal: 'Sus tarjetas dejan de cobrarse solas; paga en recepción o en su portal.', socio: 'Tu mensualidad ya no se cobrará sola a tu tarjeta: la pagas en recepción o desde Pagos.' },
  BIOMETRIC: { personal: 'Se revoca su rostro o huella y la plantilla se borra en el acto; entra por recepción.', socio: 'Tu rostro deja de reconocerse y la plantilla se borra. Entras por recepción.' },
  PRIVACY_NOTICE: { personal: 'Es obligatorio: solo se retira con la baja.', socio: 'Para retirarlo hay que darte de baja: pídelo en recepción.' },
  HOUSE_RULES: { personal: 'Es obligatorio: solo se retira con la baja.', socio: 'Para retirarlo hay que darte de baja: pídelo en recepción.' },
};

// ── Lo que el aviso de privacidad tiene que decir ───────────────────────────

export type PuntoDelAviso = {
  readonly clave: string;
  /** La casilla que marca la gerencia al revisar. */
  readonly texto: string;
  /** Palabras con las que el servidor comprueba que el texto lo trata. */
  readonly pistas: readonly RegExp[];
};

/**
 * La lista de verificación del aviso de privacidad (21-08). Israel descartó
 * al abogado (P5): esta lista es lo que lo reemplaza. No es asesoría: es lo
 * que el aviso no puede dejar de decir, y el servidor no publica uno que no
 * lo diga (`faltantesDelAviso`) ni uno que la gerencia no haya revisado punto
 * por punto (`checklist` al publicar).
 */
export const LISTA_DEL_AVISO_DE_PRIVACIDAD: readonly PuntoDelAviso[] = [
  { clave: 'responsable', texto: 'Dice quién es el responsable y su domicilio', pistas: [/responsable/i, /domicilio/i] },
  { clave: 'datos', texto: 'Dice qué datos se recaban y cuáles son sensibles (salud, rostro)', pistas: [/datos/i, /salud|rostro|biom[eé]tric/i] },
  { clave: 'finalidades', texto: 'Separa las finalidades necesarias de las adicionales y dice cómo negarse a las adicionales', pistas: [/finalidad/i, /adicional|secundari/i, /negar|oponer|no quieres|no deseas/i] },
  { clave: 'transferencias', texto: 'Dice con quién se comparten los datos', pistas: [/compart|transfer|terceros/i] },
  { clave: 'arco', texto: 'Dice cómo ejercer los derechos ARCO (recepción, portal o correo) y el plazo de 20 días hábiles', pistas: [/acceso|rectificaci[oó]n|cancelaci[oó]n|oposici[oó]n|ARCO/i, /20 d[ií]as h[aá]biles/i] },
  { clave: 'conservacion', texto: 'Dice cuánto tiempo se guardan los datos después de la baja', pistas: [/conserv|guard|plazo/i, /baja|dej(as|a) de ser socio/i] },
  { clave: 'cambios', texto: 'Dice cómo se avisan los cambios al aviso', pistas: [/cambio/i] },
];

/** Las claves que faltan por revisar en lo que mandó la gerencia. */
export function puntosSinRevisar(checklist: readonly string[] | null | undefined): string[] {
  const marcados = new Set(checklist ?? []);
  return LISTA_DEL_AVISO_DE_PRIVACIDAD.filter((p) => !marcados.has(p.clave)).map((p) => p.clave);
}

/** Los puntos de la lista que el texto no trata (cada punto exige todas sus pistas). */
export function faltantesDelAviso(texto: string): PuntoDelAviso[] {
  return LISTA_DEL_AVISO_DE_PRIVACIDAD.filter((p) => !p.pistas.every((re) => re.test(texto)));
}

/** Los `[CORCHETES]` de un modelo que nadie completó, sin repetir. */
export function corchetesSinCompletar(texto: string): string[] {
  const vistos = new Set<string>();
  for (const m of texto.matchAll(/\[[A-ZÁÉÍÓÚÑ0-9 ,/.:;()-]+\]/g)) vistos.add(m[0]);
  return [...vistos];
}

// ── Cómo se firmó, dicho al socio (descarga ARCO y portal) ──────────────────

/** `member_consents.channel` en voz del socio. La del personal es `CANAL_DE_CONSENTIMIENTO`. */
export const CANAL_DE_CONSENTIMIENTO_SOCIO: Readonly<Record<string, string>> = {
  ASSISTED: 'Firmado en recepción',
  SELF_SERVICE: 'Firmado desde tu teléfono',
  PAPER: 'Firmado en papel',
  IMPORT: 'Traído del sistema anterior',
};

// ── El ciclo de una solicitud, calculado ────────────────────────────────────

const DIA_MS = 86_400_000;

/** Cuándo vence responder, contando desde que corre el plazo (entrada o identidad acreditada). */
export function venceResponder(desde: Date): Date {
  return new Date(desde.getTime() + PLAZOS_ARCO.responder.naturales * DIA_MS);
}

/** Cuándo vence hacer efectivo lo que procede, contando desde la respuesta. */
export function venceHacerEfectiva(respondidaEl: Date): Date {
  return new Date(respondidaEl.getTime() + PLAZOS_ARCO.hacerEfectiva.naturales * DIA_MS);
}

/** Las fechas de una solicitud, como las guarda el servidor. */
export type FechasDeSolicitud = {
  readonly identityVerifiedAt: Date | null;
  readonly dueAt: Date;
  readonly resolvedAt: Date | null;
  readonly outcome: ResultadoDeSolicitudArco | null;
  readonly effectiveDueAt: Date | null;
  readonly effectedAt: Date | null;
};

/** En qué va (ver `ESTADOS_DE_SOLICITUD_ARCO`). Una resuelta sin resultado es de antes del ciclo completo: cerrada. */
export function estadoDeSolicitud(r: FechasDeSolicitud): EstadoDeSolicitudArco {
  if (r.resolvedAt) return r.outcome === 'GRANTED' && !r.effectedAt ? 'EFFECT_PENDING' : 'CLOSED';
  return r.identityVerifiedAt ? 'OPEN' : 'IDENTITY_PENDING';
}

/** El plazo que corre hoy para la solicitud, o null si no corre ninguno. */
export function plazoVigente(r: FechasDeSolicitud): Date | null {
  const estado = estadoDeSolicitud(r);
  if (estado === 'OPEN') return r.dueAt;
  if (estado === 'EFFECT_PENDING') return r.effectiveDueAt;
  return null;
}

/** ¿Se pasó el plazo que corre hoy? */
export function solicitudVencida(r: FechasDeSolicitud, ahora: Date = new Date()): boolean {
  const plazo = plazoVigente(r);
  return !!plazo && plazo.getTime() < ahora.getTime();
}

/** El folio de la constancia: se lee por teléfono y no dice nada del socio. `ARCO-2611-4F2A9C`. */
export function folioDeSolicitud(id: string, recibidaEl: Date): string {
  const aamm = recibidaEl.toISOString().slice(2, 7).replace('-', '');
  return `ARCO-${aamm}-${id.replace(/-/g, '').slice(-6).toUpperCase()}`;
}

/** Los tipos que piden señalar un permiso: de cuál se opone o cuál revoca. */
export const SOLICITUDES_CON_PERMISO: readonly TipoDeSolicitudArco[] = ['OPPOSITION', 'REVOCATION'];

/** El texto se usa aunque el módulo esté apagado, salvo estos: sin el módulo, su texto no hace falta (21-23). */
export const TEXTO_SOLO_CON_MODULO: Readonly<Record<string, string>> = { BIOMETRIC: 'biometrics' };

// ── Conservación: cuánto se guarda de quien se va (D-32; bloque 3.9) ────────

/**
 * LOS PLAZOS DE CONSERVACIÓN (D-32, opción a). «Baja» es el día en que el
 * socio se dio de baja (su ficha queda «Dado de baja»).
 *
 *  · El rostro deja de reconocerse el mismo día de la baja y su plantilla se
 *    borra a los 30 días si no regresó. Si regresa antes, vuelve a
 *    reconocerse sin registrarlo otra vez.
 *  · Los demás datos personales se anonimizan a los 24 meses de la baja. El
 *    gimnasio puede fijar otro plazo, entre el mínimo y el máximo. Nadie se
 *    anonimiza solo: cada mes se arma una lista y la firma el dueño.
 *
 * Todo se mide en DÍAS DE CALENDARIO de la sede (medianoche UTC del día,
 * como `businessDateIn`), no en horas: lo que vence «a los 30 días» vence
 * igual para quien se dio de baja en la mañana que en la noche.
 */
export const CONSERVACION = {
  /** Días tras la baja en que la plantilla del rostro se borra. */
  rostroDiasTrasLaBaja: 30,
  /** Meses tras la baja para anonimizar, si el gimnasio no fijó otro plazo. */
  mesesTrasLaBaja: 24,
  mesesMinimos: 1,
  mesesMaximos: 120,
  /** Las listas ya resueltas que enseña la pantalla. */
  listasEnLaHistoria: 12,
} as const;

/** El plazo que rige: el que fijó el gimnasio o, sin él, el de por omisión. */
export function mesesDeConservacion(fijado: number | null | undefined): number {
  if (typeof fijado !== 'number' || !Number.isInteger(fijado)) return CONSERVACION.mesesTrasLaBaja;
  if (fijado < CONSERVACION.mesesMinimos || fijado > CONSERVACION.mesesMaximos) return CONSERVACION.mesesTrasLaBaja;
  return fijado;
}

const diaUtc = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** Un día de calendario más `dias` días. */
export function diaMasDias(dia: Date, dias: number): Date {
  return new Date(diaUtc(dia).getTime() + dias * DIA_MS);
}

/** Un día de calendario menos `meses` meses; el 31 de un mes sin 31 cae en su último día. */
export function diaMenosMeses(dia: Date, meses: number): Date {
  const y = dia.getUTCFullYear();
  const m = dia.getUTCMonth() - meses;
  const ultimo = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(dia.getUTCDate(), ultimo)));
}

/**
 * El día en que se borra la plantilla del rostro de quien se dio de baja.
 * `arranque` es el día en que la regla empezó a correr en ese gimnasio: para
 * las bajas anteriores los 30 días cuentan desde ahí, así la primera noche
 * no borra nada y el gimnasio ve venir lo que se va a borrar.
 */
export function rostroSeBorraEl(bajaEl: Date, arranque: Date | null = null): Date {
  const baja = diaUtc(bajaEl);
  const desde = arranque && diaUtc(arranque).getTime() > baja.getTime() ? diaUtc(arranque) : baja;
  return diaMasDias(desde, CONSERVACION.rostroDiasTrasLaBaja);
}

/** ¿Ya toca borrar el rostro? `hoy` y `bajaEl` son días de la sede del socio. */
export function tocaBorrarRostro(bajaEl: Date, hoy: Date, arranque: Date | null = null): boolean {
  return diaUtc(hoy).getTime() >= rostroSeBorraEl(bajaEl, arranque).getTime();
}

/** El último día de baja que ya cumplió el plazo: quien se dio de baja ese día o antes entra a la lista. */
export function corteDeAnonimizacion(hoy: Date, meses: number): Date {
  return diaMenosMeses(diaUtc(hoy), meses);
}

/** El mes de la lista (`AAAA-MM`) al que pertenece un día. */
export function periodoDeConservacion(hoy: Date): string {
  return `${hoy.getUTCFullYear()}-${String(hoy.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * La lista mensual de exsocios por anonimizar:
 *   PENDING   armada, espera la firma del dueño (a lo más una por gimnasio);
 *   SIGNED    firmada: lo listado se anonimizó (o se anonimiza esa noche si algo falló);
 *   REPLACED  nadie la firmó y la del mes siguiente la reemplazó. No borró nada.
 */
export const ESTADOS_DE_LISTA_DE_CONSERVACION = ['PENDING', 'SIGNED', 'REPLACED'] as const;
export type EstadoDeListaDeConservacion = (typeof ESTADOS_DE_LISTA_DE_CONSERVACION)[number];
export const ESTADO_DE_LISTA_DE_CONSERVACION: Readonly<Record<EstadoDeListaDeConservacion, string>> = {
  PENDING: 'Espera la firma', SIGNED: 'Firmada', REPLACED: 'Sin firma: la reemplazó la del mes siguiente',
};

/**
 * Cada exsocio de la lista:
 *   LISTED      en la lista, con sus datos intactos;
 *   ANONYMIZED  anonimizado al amparo de la firma de esa lista;
 *   EXCLUDED    la gerencia lo sacó de esta lista con un motivo (vuelve en la siguiente);
 *   SKIPPED     al ejecutar ya no cumplía: regresó, ya estaba anonimizado o el plazo cambió.
 */
export const ESTADOS_DE_RENGLON_DE_CONSERVACION = ['LISTED', 'ANONYMIZED', 'EXCLUDED', 'SKIPPED'] as const;
export type EstadoDeRenglonDeConservacion = (typeof ESTADOS_DE_RENGLON_DE_CONSERVACION)[number];
export const ESTADO_DE_RENGLON_DE_CONSERVACION: Readonly<Record<EstadoDeRenglonDeConservacion, string>> = {
  LISTED: 'En la lista', ANONYMIZED: 'Anonimizado', EXCLUDED: 'Fuera de esta lista', SKIPPED: 'No se tocó',
};

/** Por qué no se tocó a alguien que estaba en una lista firmada. */
export const MOTIVOS_DE_SALTO_DE_CONSERVACION = ['RETURNED', 'ALREADY_ANONYMIZED', 'NOT_DUE'] as const;
export type MotivoDeSaltoDeConservacion = (typeof MOTIVOS_DE_SALTO_DE_CONSERVACION)[number];
export const MOTIVO_DE_SALTO_DE_CONSERVACION: Readonly<Record<MotivoDeSaltoDeConservacion, string>> = {
  RETURNED: 'Regresó al gimnasio', ALREADY_ANONYMIZED: 'Ya estaba anonimizado', NOT_DUE: 'Ya no cumple el plazo',
};

/** Motivos de un toque para sacar a alguien de la lista del mes. */
export const MOTIVOS_PARA_SACAR_DE_LA_LISTA = ['Tiene un adeudo por cobrar', 'Hay una reclamación abierta', 'Dijo que va a regresar'] as const;

/** El motivo que queda en la bitácora de cada anonimización hecha por una lista firmada. */
export function motivoDeAnonimizacionPorLista(periodo: string, meses: number): string {
  return `Lista de conservación ${periodo}: pasaron ${meses} meses desde su baja`;
}

/** El motivo con que se revoca el rostro de quien no regresó. */
export const MOTIVO_ROSTRO_TRAS_LA_BAJA = `Pasaron ${CONSERVACION.rostroDiasTrasLaBaja} días desde su baja sin regresar`;

export * from './modelos-consentimiento.js';
