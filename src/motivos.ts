import { DISCOUNT_REASONS, type DiscountReason } from './cash.js';

/**
 * MOTIVOS DE CATÁLOGO (auditoría 8: 3-07, 4-21, 5-15, 7-10; D-31).
 *
 * Al cancelar, condonar, dejar pasar o cerrar una caja que no cuadra, el
 * motivo era texto libre: «x», «ok», «se fue». Así no se puede contar cuántos
 * se van por el precio ni cuántos entran porque la cámara no los reconoció,
 * que es justo lo que Retención, el Tablero y la dueña necesitan.
 *
 * Cada acción tiene su lista corta, en el orden en que se ofrece, y casi
 * todas cierran con «Otro…», que pide escribir. La pieza de pantalla
 * (`CampoMotivo`) pinta la lista; la API guarda el texto (`reason`) como hoy
 * y, cuando la ruta lo adopte, también el código (`reasonCode`) para agrupar.
 *
 * Sin I/O y sin `node:`: lo importan panel y portal desde
 * `@gymflow/core/motivos`.
 */

export type Motivo = {
  /** Lo que guarda la API para agrupar. Estable: no se renombra. */
  readonly codigo: string;
  /** Lo que se lee en el botón y queda en la bitácora. */
  readonly texto: string;
  /** «Otro…»: no basta con elegirlo, hay que escribir el motivo. */
  readonly pideTexto?: true;
};

export type CatalogoDeMotivos = {
  /** Qué se está haciendo, para el título del campo. */
  readonly accion: string;
  readonly motivos: readonly Motivo[];
  /** Sin «Otro…»: la API solo acepta los códigos de la lista (descuentos, `DISCOUNT_REASONS`). */
  readonly cerrado?: true;
};

/** El código de «Otro…» en todos los catálogos que lo tienen. */
export const OTRO = 'OTRO';
/** Lo mínimo que se pide escribir con «Otro…»: el mismo mínimo que exige la API a un motivo (y `CampoMotivo`). */
export const MINIMO_DE_TEXTO = 3;

const otro: Motivo = { codigo: OTRO, texto: 'Otro…', pideTexto: true };

const textosDeDescuento = {
  PROMOCION_VIGENTE: 'Promoción vigente',
  CONVENIO_EMPRESA: 'Convenio con empresa',
  ESTUDIANTE: 'Estudiante',
  INAPI_TERCERA_EDAD: 'INAPAM / tercera edad',
  REFERIDO: 'Referido',
  AJUSTE_POR_SERVICIO: 'Ajuste por servicio',
  RETENCION: 'Retención',
  ERROR_DE_CAPTURA: 'Error de captura',
} as const satisfies Record<DiscountReason, string>;

/**
 * Las acciones que piden motivo, cada una con su catálogo. Las claves son
 * estables: la bitácora y Retención agrupan por ellas.
 */
export const MOTIVOS = {
  /** Descontar un cargo. Lista cerrada: la API valida contra `DISCOUNT_REASONS`. */
  descuento: {
    accion: 'Descontar',
    cerrado: true,
    motivos: DISCOUNT_REASONS.map((codigo) => ({ codigo, texto: textosDeDescuento[codigo] })),
  },
  /** Condonar (perdonar) un cargo: los motivos de perdonar no son los de descontar (3-07). */
  condonacion: {
    accion: 'Condonar',
    motivos: [
      { codigo: 'LESION', texto: 'Lesión o incapacidad' },
      { codigo: 'CIERRE_DEL_GIMNASIO', texto: 'El gimnasio cerró esos días' },
      { codigo: 'INCOBRABLE', texto: 'Incobrable' },
      { codigo: 'CORTESIA', texto: 'Cortesía de la gerencia' },
      { codigo: 'ERROR_DE_CAPTURA', texto: 'Error de captura' },
      otro,
    ],
  },
  /** Cancelar una membresía: lo que lee Retención para saber por qué se van (4-21). */
  cancelacion: {
    accion: 'Cancelar la membresía',
    motivos: [
      { codigo: 'PRECIO', texto: 'Precio' },
      { codigo: 'HORARIO', texto: 'Horario' },
      { codigo: 'SE_MUDO', texto: 'Se mudó' },
      { codigo: 'LESION', texto: 'Lesión o salud' },
      { codigo: 'OTRO_GIMNASIO', texto: 'Se fue a otro gimnasio' },
      { codigo: 'MAL_SERVICIO', texto: 'Mal servicio' },
      otro,
    ],
  },
  /** Congelar una membresía. */
  congelamiento: {
    accion: 'Congelar',
    motivos: [
      { codigo: 'VIAJE', texto: 'Viaje' },
      { codigo: 'LESION', texto: 'Lesión o salud' },
      { codigo: 'TRABAJO', texto: 'Trabajo' },
      otro,
    ],
  },
  /** Registrar la entrada por el mostrador donde hay cámara (5-15): cuántos entran sin que la cámara los reconozca. */
  entradaManual: {
    accion: 'Entrada por el mostrador',
    motivos: [
      { codigo: 'CAMARA_NO_RECONOCIO', texto: 'La cámara no lo reconoció' },
      { codigo: 'ESTACION_APAGADA', texto: 'La estación está apagada' },
      { codigo: 'SIN_ROSTRO', texto: 'Aún no tiene su rostro registrado' },
      otro,
    ],
  },
  /** Dejar pasar a quien la puerta rechazó. */
  dejarPasar: {
    accion: 'Dejar pasar',
    motivos: [
      { codigo: 'PAGA_AL_SALIR', texto: 'Paga hoy al salir' },
      { codigo: 'YA_PAGO', texto: 'Ya pagó y falta registrarlo' },
      { codigo: 'CORTESIA', texto: 'Cortesía de la gerencia' },
      otro,
    ],
  },
  /**
   * La gerencia autoriza la entrada de quien no tiene su rostro registrado
   * (fase 3, bloque 3.3; D-06). Es por visita: el motivo dice por qué hoy.
   */
  entradaSinRostro: {
    accion: 'Autorizar la entrada sin rostro',
    motivos: [
      { codigo: 'NO_QUIERE_BIOMETRIA', texto: 'No quiere registrar su rostro' },
      { codigo: 'LO_REGISTRA_DESPUES', texto: 'Registra su rostro en su próxima visita' },
      { codigo: 'NO_SE_PUDO_REGISTRAR', texto: 'No se pudo registrar: la cámara o el motor no funcionan' },
      { codigo: 'MENOR_SIN_TUTOR', texto: 'Menor de edad: falta que su tutor firme' },
      otro,
    ],
  },
  /** El corte no cuadra (7-10). El texto sigue siendo obligatorio: el chip solo lo empieza. */
  descuadre: {
    accion: 'La caja no cuadra',
    motivos: [
      { codigo: 'CAMBIO_DE_MAS', texto: 'Cambio de más' },
      { codigo: 'COBRO_SIN_REGISTRAR', texto: 'Cobro sin registrar' },
      { codigo: 'GASTO_SIN_ANOTAR', texto: 'Gasto sin anotar' },
      otro,
    ],
  },
  /** Revocar un rostro o una huella. */
  revocarBiometria: {
    accion: 'Revocar',
    motivos: [
      { codigo: 'RETIRO_CONSENTIMIENTO', texto: 'El socio retiró su consentimiento' },
      { codigo: 'REGISTRO_DEFECTUOSO', texto: 'El registro no sirve; se vuelve a tomar' },
      { codigo: 'OTRA_PERSONA', texto: 'Se registró a otra persona' },
      otro,
    ],
  },
  /** Rechazar un alta digital. */
  rechazarAlta: {
    accion: 'Rechazar el alta',
    motivos: [
      { codigo: 'DUPLICADO', texto: 'Ya es socio' },
      { codigo: 'DATOS_FALSOS', texto: 'Datos falsos' },
      { codigo: 'PRUEBA', texto: 'Era una prueba' },
      { codigo: 'NO_SE_PRESENTO', texto: 'No se presentó' },
      { codigo: 'PIDIO_CANCELAR', texto: 'Pidió cancelar' },
      otro,
    ],
  },
  /** Cerrar un interesado que no se inscribió (D-31: lista corta, obligatoria). */
  interesadoPerdido: {
    accion: 'Ya no se va a inscribir',
    motivos: [
      { codigo: 'PRECIO', texto: 'Precio' },
      { codigo: 'HORARIO', texto: 'Horario' },
      { codigo: 'LE_QUEDA_LEJOS', texto: 'Le queda lejos' },
      { codigo: 'OTRO_GIMNASIO', texto: 'Se fue a otro gimnasio' },
      { codigo: 'NUNCA_CONTESTO', texto: 'No contestó nunca' },
      otro,
    ],
  },
  /** No autorizar lo que pidió la gerencia o el mostrador. */
  noAutorizar: {
    accion: 'No autorizar',
    motivos: [
      { codigo: 'NO_CORRESPONDE', texto: 'No corresponde' },
      { codigo: 'IMPORTE_INCORRECTO', texto: 'El importe no es correcto' },
      { codigo: 'FALTA_INFORMACION', texto: 'Falta información' },
      otro,
    ],
  },
  /** Apagar un módulo del gimnasio o de una sucursal (los chips que ya ofrecía Módulos). */
  apagarModulo: {
    accion: 'Apagar',
    motivos: [
      { codigo: 'NO_LO_USAMOS', texto: 'No lo usamos' },
      { codigo: 'CERRAMOS_EL_AREA', texto: 'Cerramos esa área' },
      { codigo: 'OTRA_HERRAMIENTA', texto: 'Lo llevamos en otra herramienta' },
      { codigo: 'TEMPORAL', texto: 'Es temporal' },
      otro,
    ],
  },
  // ── Consola de plataforma (los que 1.5 dejó en `plataforma/[id]` y `plataforma/cobro.tsx`) ──
  /** Liberar el software a una marca. */
  liberarServicio: {
    accion: 'Liberar',
    motivos: [
      { codigo: 'CONTRATO_Y_PAGO', texto: 'Contrato firmado y primer pago recibido' },
      { codigo: 'REACTIVACION_TRAS_PAGO', texto: 'Reactivación tras el pago' },
      otro,
    ],
  },
  /** Suspender el servicio de una marca. */
  suspenderServicio: {
    accion: 'Suspender',
    motivos: [
      { codigo: 'FALTA_DE_PAGO', texto: 'Falta de pago' },
      { codigo: 'FIN_DEL_CONTRATO', texto: 'Fin del contrato' },
      { codigo: 'PETICION_DEL_DUENO', texto: 'A petición del dueño' },
      otro,
    ],
  },
  /** Contratar un módulo a una marca. */
  contratarModulo: {
    accion: 'Contratar',
    motivos: [
      { codigo: 'LO_CONTRATO', texto: 'Lo contrató' },
      { codigo: 'INCLUIDO_EN_SU_PLAN', texto: 'Incluido en su plan' },
      otro,
    ],
  },
  /** Retirar un módulo contratado. */
  retirarModulo: {
    accion: 'Retirar',
    motivos: [
      { codigo: 'DEJO_DE_PAGARLO', texto: 'Dejó de pagarlo' },
      { codigo: 'LO_CANCELO_EL_DUENO', texto: 'Lo canceló el dueño' },
      otro,
    ],
  },
  /** Suspender la cuenta de una persona de la marca desde la consola. */
  suspenderCuenta: {
    accion: 'Suspender la cuenta',
    motivos: [
      { codigo: 'DEJO_DE_TRABAJAR_AHI', texto: 'Dejó de trabajar ahí' },
      { codigo: 'PETICION_DEL_DUENO', texto: 'A petición del dueño' },
      otro,
    ],
  },
  /** Reactivar la cuenta de una persona de la marca desde la consola. */
  reactivarCuenta: {
    accion: 'Reactivar la cuenta',
    motivos: [
      { codigo: 'REGRESO_AL_GIMNASIO', texto: 'Regresó al gimnasio' },
      otro,
    ],
  },
  /** Dar una contraseña temporal desde la consola. */
  temporalDesdeLaConsola: {
    accion: 'Contraseña temporal',
    motivos: [
      { codigo: 'LA_OLVIDO', texto: 'La olvidó y nos la pidió' },
      { codigo: 'PRIMER_ACCESO', texto: 'Primer acceso' },
      otro,
    ],
  },
  /** Anular una factura de GymFlow a una marca. */
  anularFactura: {
    accion: 'Anular la factura',
    motivos: [
      { codigo: 'MODULO_DE_MAS', texto: 'Se emitió con un módulo de más' },
      { codigo: 'CAMBIO_EL_ACUERDO', texto: 'Cambió el acuerdo con el dueño' },
      { codigo: 'MES_SIN_SERVICIO', texto: 'Mes sin servicio' },
      otro,
    ],
  },
  /** Deshacer un pago registrado en una factura de GymFlow (23-07, bloque 1.13). */
  deshacerPagoDeFactura: {
    accion: 'Deshacer el pago',
    motivos: [
      { codigo: 'ERA_DE_OTRA_MARCA', texto: 'El pago era de otra marca' },
      { codigo: 'IMPORTE_EQUIVOCADO', texto: 'Se capturó otro importe' },
      { codigo: 'EL_PAGO_NO_LLEGO', texto: 'El pago no llegó o lo devolvió el banco' },
      otro,
    ],
  },
} as const satisfies Record<string, CatalogoDeMotivos>;

export type AccionConMotivo = keyof typeof MOTIVOS;

export const ACCIONES_CON_MOTIVO = Object.keys(MOTIVOS) as AccionConMotivo[];

/** Los códigos válidos de una acción (lo que la API acepta como `reasonCode`). */
export function codigosDeMotivo(accion: AccionConMotivo): readonly string[] {
  const catalogo: CatalogoDeMotivos = MOTIVOS[accion];
  return catalogo.motivos.map((m) => m.codigo);
}

/**
 * Los textos de un toque de una acción, para `CampoMotivo` (panel): sin
 * «Otro…», porque escribir otra cosa YA es otro motivo. Tocar uno escribe su
 * texto; la API lo guarda como `reason` y `codigoDeTexto` lo vuelve a contar.
 */
export function textosDeMotivo(accion: AccionConMotivo): readonly string[] {
  const catalogo: CatalogoDeMotivos = MOTIVOS[accion];
  return catalogo.motivos.filter((m) => !m.pideTexto).map((m) => m.texto);
}

/** Lo que eligió la persona: un código del catálogo y, si hace falta, lo que escribió. */
export type MotivoElegido = { readonly codigo: string; readonly nota?: string | null };

export type RevisionDeMotivo =
  | { readonly ok: true; readonly codigo: string; readonly texto: string }
  | { readonly ok: false; readonly error: string };

/**
 * ¿Sirve este motivo para esta acción? Devuelve el texto que se guarda
 * (`reason`): el del catálogo, con la nota detrás si la hay («Precio · subió
 * la mensualidad»), o lo escrito si eligió «Otro…».
 */
export function revisarMotivo(accion: AccionConMotivo, elegido: MotivoElegido): RevisionDeMotivo {
  const catalogo: CatalogoDeMotivos = MOTIVOS[accion];
  const motivo = catalogo.motivos.find((m) => m.codigo === elegido.codigo);
  if (!motivo) return { ok: false, error: 'Elige un motivo de la lista' };
  const nota = (elegido.nota ?? '').trim().replace(/\s+/g, ' ');
  if (motivo.pideTexto) {
    if (nota.length < MINIMO_DE_TEXTO) return { ok: false, error: 'Escribe el motivo' };
    return { ok: true, codigo: motivo.codigo, texto: nota };
  }
  return { ok: true, codigo: motivo.codigo, texto: nota ? `${motivo.texto} · ${nota}` : motivo.texto };
}

/**
 * El código de un motivo ya guardado como texto, si empieza con el de un
 * motivo del catálogo («Precio · subió…» → `PRECIO`). Lo que no se reconoce
 * cuenta como «Otro…». Sirve para agrupar lo que se guardó antes del código.
 */
export function codigoDeTexto(accion: AccionConMotivo, texto: string | null | undefined): string {
  const limpio = (texto ?? '').trim().toLocaleLowerCase('es-MX');
  const catalogo: CatalogoDeMotivos = MOTIVOS[accion];
  const motivo = catalogo.motivos.find((m) => {
    if (m.pideTexto) return false;
    const suyo = m.texto.toLocaleLowerCase('es-MX');
    return limpio === suyo || limpio.startsWith(`${suyo} · `) || limpio === m.codigo.toLocaleLowerCase('es-MX');
  });
  if (motivo) return motivo.codigo;
  // En un catálogo cerrado no hay «Otro…»: lo que no se reconoce no tiene código.
  return catalogo.cerrado ? '' : OTRO;
}
