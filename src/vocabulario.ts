import type { PaymentMethodType } from './billing.js';
import type { MembershipStatus } from './membership.js';
import type { DenialReason } from './access.js';
import type { ConsentType } from './intake.js';
import type { BiometricModality } from './biometrics.js';
import type { CashMovementType } from './cash.js';
import type { EngagementState, FollowUpChannel, FollowUpOutcome } from './retention.js';
import type { OutboundKind } from './contracts/outbound.js';
import { ROLES, type RoleKey } from './roles.js';

/**
 * VOCABULARIO (auditoría 8, 27-07 y 2-13): cómo se le dice a cada código de
 * la API delante de una persona. Antes cada app tenía su copia y ya no decían
 * lo mismo: recepción veía «Tarjeta (terminal)» y el socio «Tarjeta en
 * mostrador» para el MISMO pago, y un error del formulario decía «Teléfono»
 * junto a un campo que se llama «Celular».
 *
 * Reglas:
 * - Una palabra por código. Panel, portal y los archivos que arma la API
 *   (descarga ARCO, CSV) dicen lo mismo.
 * - Donde el socio y el personal necesitan frases distintas (el socio lee en
 *   segunda persona: «Tus datos de salud»), el código lleva las dos voces en
 *   el mismo lugar: `personal` y `socio`.
 * - Los mapas se leen con cualquier `string` (la API puede mandar un código
 *   nuevo antes de que el panel se actualice): quien pinta usa
 *   `MAPA[codigo] ?? codigo` o `etiqueta(MAPA, codigo)`. Aquí se comprueba
 *   que cada código conocido tenga su palabra.
 *
 * Sin I/O y sin `node:`: lo importan panel y portal desde
 * `@gymflow/core/vocabulario`.
 */

/** El tono con el que se pinta un estado. Coincide con el `Tono` de las insignias del panel y el portal. */
export type Tono = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';

/** Una etiqueta con su tono, para insignias de estado. */
export type EtiquetaConTono = { readonly label: string; readonly tone: Tono };

/** La palabra de un código, o el código tal cual si todavía no tiene (nunca `undefined` en pantalla). */
export function etiqueta(mapa: Readonly<Record<string, string>>, codigo: string | null | undefined, siFalta = ''): string {
  if (!codigo) return siFalta;
  return mapa[codigo] ?? codigo;
}

// ── Dinero ──────────────────────────────────────────────────────────────────

const metodos = {
  CASH: 'Efectivo',
  // El mismo pago se llamaba «Tarjeta (terminal)» en el panel y «Tarjeta en
  // mostrador» en el portal y en la descarga ARCO (27-07): gana la que entiende
  // también el socio.
  CARD_TERMINAL: 'Tarjeta en mostrador',
  // Todo cobro a tarjeta en línea, también el de «solo esta vez» (A5-N3):
  // decir «domiciliada» contaba domiciliados que no existen.
  CARD_ON_FILE: 'Tarjeta en línea',
  SPEI_TRANSFER: 'Transferencia',
  OXXO_REF: 'Pago en OXXO',
  // No es dinero que entró: es saldo a favor del socio (lo que sobró al bajar de plan, por ejemplo).
  CREDIT_NOTE: 'Saldo a favor (nota de crédito)',
} as const satisfies Record<PaymentMethodType, string>;

/** Cómo se pagó (`payments.method`). */
export const METODO_DE_PAGO: Readonly<Record<string, string>> = metodos;

// ── Campos de un formulario ─────────────────────────────────────────────────

/**
 * El nombre de cada campo de la API como se lee junto al formulario. Un 422
 * trae QUÉ campo falló (`issues[].path`); sin esto, recepción leía
 * «Datos de entrada inválidos» y no sabía qué corregir (UXA-12). Los dos
 * formularios (panel y portal) rotulan el teléfono como «Celular».
 */
export const CAMPO: Readonly<Record<string, string>> = {
  firstName: 'Nombre',
  lastName: 'Apellidos',
  fullName: 'Nombre',
  phoneE164: 'Celular',
  phone: 'Celular',
  email: 'Correo',
  birthDate: 'Fecha de nacimiento',
  emergencyContactName: 'Contacto de emergencia',
  emergencyContactPhone: 'Teléfono de emergencia',
  externalRef: 'Referencia',
  reason: 'Motivo',
  amountCents: 'Importe',
  curp: 'CURP',
  // Bloque 1.2: el 422 nombra el campo con la palabra de la pantalla también
  // fuera de la ficha del socio (cobro, caja, venta, personal, clases, tienda).
  name: 'Nombre',
  note: 'Nota',
  notes: 'Notas',
  description: 'Descripción',
  code: 'Código',
  status: 'Estado',
  kind: 'Tipo',
  branchId: 'Sucursal',
  homeBranchId: 'Sucursal',
  soldAtBranchId: 'Sucursal',
  branchIds: 'Sucursales',
  memberId: 'Socio',
  memberCode: 'Código de socio',
  joinedAt: 'Socio desde',
  memberSince: 'Socio desde',
  healthNotes: 'Notas de salud',
  consents: 'Consentimientos',
  planId: 'Plan',
  membershipId: 'Membresía',
  startDate: 'Fecha de inicio',
  expectedPeriodStart: 'Periodo',
  agreedPriceCents: 'Precio pactado',
  discountCents: 'Descuento',
  priceCents: 'Precio',
  monthlyCents: 'Precio mensual',
  dropInPriceCents: 'Precio de la clase suelta',
  subtotalCents: 'Importe',
  taxCents: 'IVA',
  method: 'Forma de pago',
  paymentMethod: 'Forma de pago',
  cashSessionId: 'Turno de caja',
  cashRegisterId: 'Caja',
  openingFloatCents: 'Fondo inicial',
  countedCashCents: 'Efectivo contado',
  varianceReason: 'Motivo de la diferencia',
  movementType: 'Tipo de movimiento',
  concept: 'Concepto',
  category: 'Categoría',
  dueDate: 'Fecha de vencimiento',
  date: 'Fecha',
  businessDate: 'Fecha',
  month: 'Mes',
  from: 'Desde',
  to: 'Hasta',
  days: 'Días',
  reasonCode: 'Motivo',
  approvalToken: 'Autorización',
  password: 'Contraseña',
  current: 'Contraseña actual',
  next: 'Contraseña nueva',
  roleKey: 'Puesto',
  coachUserId: 'Coach',
  productId: 'Producto',
  sku: 'Clave del producto',
  quantity: 'Cantidad',
  quantityDelta: 'Cantidad',
  lines: 'Productos',
  capacity: 'Cupo',
  defaultCapacity: 'Cupo',
  defaultDurationMin: 'Duración',
  room: 'Salón',
  title: 'Título',
  bodyText: 'Texto',
  version: 'Versión',
  legalName: 'Razón social',
  tradeName: 'Nombre comercial',
  timezone: 'Zona horaria',
  addressLine: 'Dirección',
  publicSlug: 'Enlace',
  frames: 'Imagen de la cámara',
  channel: 'Canal',
  outcome: 'Resultado',
  nextStepOn: 'Próximo contacto',
  identityNote: 'Cómo se acreditó la identidad',
};

/**
 * El campo de un `issue` de Zod: el último tramo de la ruta que no sea un
 * índice («receptionists.1.email» → «email»), sin el prefijo `body.` que
 * agregan algunas rutas.
 */
export function campoDeRuta(ruta: string | null | undefined): string {
  return (ruta ?? '').replace(/^\$?body\.?/, '').split('.').filter((x) => x !== '' && !/^\d+$/.test(x)).at(-1) ?? '';
}

/**
 * «Celular: Debe tener 10 dígitos». Une hasta tres errores de un 422 con el
 * nombre de su campo; los que no tienen nombre conocido van solos.
 */
export function mensajeDeCampos(issues: ReadonlyArray<{ path?: string | null; message?: string | null }>, max = 3): string {
  return issues
    .slice(0, max)
    .map((i) => {
      const nombre = CAMPO[campoDeRuta(i.path)];
      const texto = i.message ?? '';
      return nombre && texto ? `${nombre}: ${texto}` : texto;
    })
    .filter(Boolean)
    .join(' · ');
}

// ── Socio y membresía ───────────────────────────────────────────────────────

/**
 * El aviso con que entra quien trae PASE DEL DÍA (bloque 1.8, 4-01). Lo pone
 * la política de acceso (`evaluateAccess`) y lo reconocen las pantallas: la
 * puerta y el mostrador dicen lo mismo.
 */
export const AVISO_PASE_DEL_DIA = 'Entra con su pase del día';

/**
 * El aviso con que entra quien trae PASE DE PRUEBA (fase 3, bloque 3.3; D-08):
 * gratis, uno por persona. Igual que el del pase del día: lo pone la política
 * y lo reconocen las pantallas.
 */
export const AVISO_PASE_DE_PRUEBA = 'Entra con su pase de prueba';

/** Estado del socio (`members.status`). */
export const ESTADO_DE_SOCIO: Readonly<Record<string, EtiquetaConTono>> = {
  ACTIVE: { label: 'Activo', tone: 'ok' },
  INACTIVE: { label: 'Inactivo', tone: 'neutral' },
  PROSPECT: { label: 'Prospecto', tone: 'info' },
  ARCHIVED: { label: 'Dado de baja', tone: 'neutral' },
};

const estadosDeMembresia = {
  PENDING: { label: 'Por activar', tone: 'info' },
  // Mismas palabras que ve el socio en el portal (UX-13): si recepción dice
  // «vigente» y el teléfono «al corriente», parecen dos cosas distintas.
  ACTIVE: { label: 'Al corriente', tone: 'ok' },
  TRIALING: { label: 'En prueba', tone: 'info' },
  // PAST_DUE es la gracia: debe, pero SIGUE entrando (ADR-012). Llamarla
  // «vencida» haría que recepción le negara el paso a quien sí lo tiene.
  PAST_DUE: { label: 'Pago pendiente', tone: 'warn' },
  SUSPENDED: { label: 'Suspendida', tone: 'danger' },
  FROZEN: { label: 'Congelada', tone: 'info' },
  CANCELED: { label: 'Cancelada', tone: 'neutral' },
  EXPIRED: { label: 'Terminada', tone: 'neutral' },
} as const satisfies Record<MembershipStatus, EtiquetaConTono>;

/** Estado de la membresía (`memberships.status`). */
export const ESTADO_DE_MEMBRESIA: Readonly<Record<string, EtiquetaConTono>> = estadosDeMembresia;

// ── Consentimientos ─────────────────────────────────────────────────────────

const consentimientos = {
  PRIVACY_NOTICE: { personal: 'Aviso de privacidad', socio: 'Aviso de privacidad' },
  HOUSE_RULES: { personal: 'Reglamento interno', socio: 'Reglamento' },
  BIOMETRIC: { personal: 'Consentimiento biométrico', socio: 'Huella o rostro para entrar' },
  RECURRING_CHARGE: { personal: 'Cargo recurrente', socio: 'Cargo automático a tu tarjeta' },
  MARKETING: { personal: 'Comunicaciones', socio: 'Avisos y promociones' },
  HEALTH_DATA: { personal: 'Datos de salud', socio: 'Tus datos de salud' },
} as const satisfies Record<ConsentType, { personal: string; socio: string }>;

/** El nombre de cada texto que se firma, en las dos voces. */
export const TIPO_DE_CONSENTIMIENTO: Readonly<Record<string, { readonly personal: string; readonly socio: string }>> = consentimientos;

/** Para el personal: «Consentimiento biométrico». */
export const TIPO_DE_CONSENTIMIENTO_PERSONAL: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(consentimientos).map(([k, v]) => [k, v.personal]),
);

/** Para el socio: «Huella o rostro para entrar». */
export const TIPO_DE_CONSENTIMIENTO_SOCIO: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(consentimientos).map(([k, v]) => [k, v.socio]),
);

/** Por dónde se firmó (`member_consents.channel`). */
export const CANAL_DE_CONSENTIMIENTO: Readonly<Record<string, string>> = {
  ASSISTED: 'En mostrador',
  SELF_SERVICE: 'Desde su teléfono',
  PAPER: 'En papel',
};

// ── Entrada y biometría ─────────────────────────────────────────────────────

const modalidades = { FACE: 'Rostro', FINGERPRINT: 'Huella' } as const satisfies Record<BiometricModality, string>;

/** Rostro o huella. */
export const MODALIDAD_BIOMETRICA: Readonly<Record<string, string>> = modalidades;

const rechazos = {
  MEMBERSHIP_PAST_DUE: 'Debe su mensualidad',
  MEMBERSHIP_FROZEN: 'Membresía congelada',
  MEMBERSHIP_SUSPENDED: 'Membresía suspendida',
  MEMBERSHIP_ENDED: 'Sin membresía vigente',
  NO_MEMBERSHIP: 'Sin membresía',
  BRANCH_NOT_ALLOWED: 'Su plan no cubre esta sucursal',
  OUTSIDE_TIME_WINDOW: 'Fuera de su horario',
  NO_VISITS_LEFT: 'Sin visitas en su paquete',
  VISIT_PACK_EXPIRED: 'Paquete caducado',
  // Antes no tenía palabra y en pantalla salía la clave en inglés.
  VISIT_PACK_UNPAID: 'Paquete sin pagar',
  MEMBER_ARCHIVED: 'Dado de baja',
  MEMBER_UNKNOWN: 'No reconocido',
  CREDENTIAL_REVOKED: 'Credencial revocada',
  CREDENTIAL_EXPIRED: 'Credencial caducada',
  DUPLICATE_SCAN: 'Doble paso',
  // D-06 (bloque 3.3): su plan está en orden; lo que falta es el rostro o la autorización de la gerencia.
  BIOMETRIC_REQUIRED: 'Sin rostro registrado',
} as const satisfies Record<DenialReason, string>;

/** Por qué la puerta dijo que no (`access_decisions.denialReason`), en corto. */
export const MOTIVO_DE_RECHAZO: Readonly<Record<string, string>> = rechazos;

// ── Retención y seguimiento ─────────────────────────────────────────────────

const habitos = {
  NEW: { label: 'Nuevo', tone: 'info' },
  ONBOARDING_AT_RISK: { label: 'No arrancó', tone: 'danger' },
  REGULAR: { label: 'Constante', tone: 'ok' },
  SLIPPING: { label: 'Aflojando', tone: 'warn' },
  DORMANT: { label: 'Dejó de venir', tone: 'danger' },
  LOST: { label: 'Perdido', tone: 'neutral' },
} as const satisfies Record<EngagementState, EtiquetaConTono>;

/** El hábito de un socio en Retención (`classifyEngagement`): la insignia de la fila. */
export const ESTADO_DE_HABITO: Readonly<Record<string, EtiquetaConTono>> = habitos;

const canalesDeContacto = {
  CALL: 'Llamada', WHATSAPP: 'WhatsApp', VISIT: 'En persona', OTHER: 'Otro',
} as const satisfies Record<FollowUpChannel, string>;

/** Por dónde se contactó a un prospecto o a un socio en riesgo (`follow_ups.channel`). */
export const CANAL_DE_CONTACTO: Readonly<Record<string, string>> = canalesDeContacto;

const resultadosDeContacto = {
  ANSWERED: 'Contestó', NO_ANSWER: 'No contestó', INTERESTED: 'Le interesa',
  NOT_INTERESTED: 'No le interesa', COMING_BACK: 'Va a regresar',
  TRIAL_VISIT: 'Vino a probar', INTAKE_SENT: 'Se le mandó el alta digital',
  MESSAGE_SENT: 'Se le mandó mensaje',
} as const satisfies Record<FollowUpOutcome, string>;

/** Qué pasó en el contacto (`follow_ups.outcome`). */
export const RESULTADO_DE_CONTACTO: Readonly<Record<string, string>> = resultadosDeContacto;

const motivosDeMensaje = {
  MEMBERSHIP_SUSPENDED: { label: 'Membresía suspendida', plural: 'Membresías suspendidas', tone: 'danger' },
  PAYMENT_OVERDUE: { label: 'Pago vencido', plural: 'Pagos vencidos', tone: 'danger' },
  PAYMENT_DUE_SOON: { label: 'Pago por vencer', plural: 'Pagos por vencer', tone: 'warn' },
  MEMBERSHIP_ENDING: { label: 'Plan por terminar', plural: 'Planes por terminar', tone: 'warn' },
  WE_MISS_YOU: { label: 'Dejó de venir', plural: 'Dejaron de venir o aflojan', tone: 'info' },
  PRICE_CHANGE: { label: 'Cambio de precio', plural: 'Avisos de cambio de precio', tone: 'info' },
} as const satisfies Record<OutboundKind, EtiquetaConTono & { plural: string }>;

/** Por qué se le escribe a un socio desde Mensajes (`outbound_messages.kind`, bloque 2.9): el grupo de la lista y el renglón de la campana. */
export const MOTIVO_DE_MENSAJE: Readonly<Record<string, EtiquetaConTono & { plural: string }>> = motivosDeMensaje;

// ── Caja ────────────────────────────────────────────────────────────────────

/** El turno de una caja (`cash_sessions.shiftLabel`). */
export const TURNO_DE_CAJA: Readonly<Record<string, string>> = {
  MORNING: 'Matutino', EVENING: 'Vespertino', NIGHT: 'Nocturno',
};

const movimientos = {
  FLOAT_IN: 'Entrada de fondo',
  WITHDRAWAL: 'Retiro a caja fuerte',
  EXPENSE: 'Gasto de caja chica',
  DEPOSIT: 'Depósito bancario',
  CORRECTION: 'Corrección',
} as const satisfies Record<CashMovementType, string>;

/** Un movimiento del cajón que no es un cobro (`cash_movements.movementType`). */
export const MOVIMIENTO_DE_CAJA: Readonly<Record<string, string>> = movimientos;

/** De dónde viene lo cobrado en un corte (las aportaciones de cada módulo). */
export const ORIGEN_DEL_COBRO: Readonly<Record<string, string>> = {
  BILLING: 'Membresías y cargos',
  POS: 'Venta de productos',
  // Bloque 3.5 (D-13): lo devuelto de ventas de otro día, que sale del turno abierto.
  POS_RETURNS: 'Devoluciones de tienda',
};

// ── Puestos ─────────────────────────────────────────────────────────────────

/** Los puestos en orden de responsabilidad: el nombre que se muestra es el del más alto que tenga. */
export const ORDEN_DE_PUESTOS: readonly RoleKey[] = ['OWNER', 'MANAGER', 'RECEPTION', 'COACH', 'SUPERADMIN'];

/**
 * El nombre del puesto de una persona por sus claves (EST-10: el rol se dice,
 * no se adivina por los permisos). Sale del catálogo de puestos (`ROLES`),
 * no de una lista aparte. Sin puesto conocido: «Personal».
 */
export function nombreDePuesto(roleKeys: readonly string[] | null | undefined): string {
  const clave = ORDEN_DE_PUESTOS.find((r) => roleKeys?.includes(r));
  return clave ? ROLES.find((r) => r.key === clave)?.name ?? 'Personal' : 'Personal';
}

// ── Por qué terminó una sesión (24-06, 24-07, 24-13; bloque 1.12) ──────────

/**
 * El 401 de una sesión que ya no sirve trae `reason`: un código estable que no
 * cambia aunque cambie la redacción. El panel lo convierte en el aviso del
 * login y regresa a la pantalla donde estaba la persona. Hoy la lista está
 * dos veces (`identity/fin-de-sesion.ts` y `gymflow-web/lib/api.ts`): esta es
 * la que deben importar las dos (oleada B).
 *
 * OJO: solo los 401 de SESIÓN llevan uno de estos. Los de credenciales
 * (contraseña del autorizador, «La contraseña actual no es correcta»,
 * reconfirmar en la consola) NO, porque el panel saca al login a quien recibe
 * uno de esta lista. `PLATFORM_ACCOUNT`: la sesión sirve, pero es de la
 * consola de plataforma y no tiene panel de gimnasio.
 */
export const SESSION_END_REASONS = [
  'NO_SESSION', 'SESSION_EXPIRED', 'SESSION_IDLE', 'SESSION_LOGGED_OUT', 'SESSION_CLOSED_ELSEWHERE',
  'SESSION_CLOSED_EVERYWHERE', 'PASSWORD_CHANGED', 'PASSWORD_RESET', 'ACCOUNT_DEACTIVATED', 'ACCESS_CHANGED',
  'ACCOUNT_LOCKED', 'TEMPORARY_PASSWORD', 'TEMPORARY_PASSWORD_EXPIRED', 'SERVICE_SUSPENDED', 'SERVICE_PENDING',
  'NETWORK_NOT_ALLOWED', 'SESSION_REVOKED', 'PLATFORM_ACCOUNT',
] as const;
export type SessionEndReason = (typeof SESSION_END_REASONS)[number];

/** ¿Este `reason` dice que la sesión terminó? (Cualquier otro 401 es de credenciales.) */
export function isSessionEndReason(reason: unknown): reason is SessionEndReason {
  return typeof reason === 'string' && (SESSION_END_REASONS as readonly string[]).includes(reason);
}

/** Lo que dice la API con cada `reason` (hoy en `identity/fin-de-sesion.ts`, la misma redacción). */
export const TEXTO_DE_FIN_DE_SESION: Readonly<Record<SessionEndReason, string>> = {
  NO_SESSION: 'Sesión requerida',
  SESSION_EXPIRED: 'Tu sesión llegó a su tiempo máximo y se cerró. Vuelve a entrar.',
  SESSION_IDLE: 'Tu sesión se cerró por inactividad. Vuelve a entrar.',
  SESSION_LOGGED_OUT: 'Esta sesión ya se cerró. Vuelve a entrar.',
  SESSION_CLOSED_ELSEWHERE: 'Tu sesión se cerró desde otro equipo. Vuelve a entrar.',
  SESSION_CLOSED_EVERYWHERE: 'Tu sesión se cerró en todos los equipos. Vuelve a entrar.',
  PASSWORD_CHANGED: 'Tu contraseña cambió y esta sesión se cerró. Entra con la nueva.',
  PASSWORD_RESET: 'Te dieron una contraseña temporal nueva. Entra con ella para elegir la tuya.',
  ACCOUNT_DEACTIVATED: 'Tu cuenta se dio de baja. Si crees que es un error, pregúntale a tu gerente.',
  ACCESS_CHANGED: 'Cambiaron tu puesto o lo que puedes ver. Vuelve a entrar para seguir.',
  ACCOUNT_LOCKED: 'Tu cuenta se bloqueó por intentos fallidos. Espera unos minutos y vuelve a entrar.',
  TEMPORARY_PASSWORD: 'Con la contraseña temporal solo puedes elegir la tuya. Vuelve a entrar con ella.',
  TEMPORARY_PASSWORD_EXPIRED: 'Tu contraseña temporal venció. Pide una nueva a quien te la dio.',
  SERVICE_SUSPENDED: 'El servicio de tu gimnasio está suspendido. Pregunta a GymFlow.',
  SERVICE_PENDING: 'El servicio de tu gimnasio todavía no está liberado. Pregunta a GymFlow.',
  NETWORK_NOT_ALLOWED: 'Esta red no puede entrar a la consola de GymFlow. Entra desde una red permitida.',
  SESSION_REVOKED: 'Tu sesión se cerró. Vuelve a entrar.',
  PLATFORM_ACCOUNT: 'Esta cuenta es de la plataforma: entra a la consola de GymFlow.',
};


// ── Estado de cuenta e inventario (bloque 1.6) ──────────────────────────────

/**
 * Cómo quedó saldado un cargo (3-06). `personal` es lo que lee recepción en la
 * ficha; `socio`, lo que el socio lee en su teléfono. Antes el panel decía
 * «Condonado» y el portal «Pagado» por la misma cuota perdonada.
 */
export const COMO_SE_SALDO: Readonly<Record<string, { readonly personal: string; readonly socio: string }>> = {
  PAYMENT: { personal: 'Pagado', socio: 'Pagado' },
  WAIVER: { personal: 'Condonado', socio: 'Condonado: no se te cobró' },
  DISCOUNT: { personal: 'Saldado con descuento', socio: 'Cubierto con descuento' },
  MIXED: { personal: 'Pagado con descuento', socio: 'Pagado con descuento' },
  CORRECTION: { personal: 'Cubierto por una corrección', socio: 'Cubierto por un ajuste a tu favor' },
};

/** Qué fue cada movimiento del libro de inventario (8-02). */
export const MOVIMIENTO_DE_INVENTARIO: Readonly<Record<string, string>> = {
  PURCHASE: 'Entrada de mercancía',
  SALE: 'Venta',
  SALE_VOIDED: 'Venta anulada',
  ADJUSTMENT: 'Ajuste por conteo',
  TRANSFER_IN: 'Traspaso recibido',
  TRANSFER_OUT: 'Traspaso enviado',
  SHRINKAGE: 'Merma',
};

/** En qué va un interesado (10-01): la palabra de la lista y de sus filtros. */
export const ESTADO_DE_INTERESADO: Readonly<Record<string, string>> = {
  NEW: 'Nuevo',
  CONTACTED: 'Contactado',
  VISITED: 'Visitó',
  TRIAL: 'En prueba',
  CONVERTED: 'Se inscribió',
  LOST: 'Perdido',
};

// ── Captación (bloque 2.4) ──────────────────────────────────────────────────

/** Los grupos de la bandeja de interesados (`prospectQueue`): el encabezado y lo que dice cuando está vacío. */
export const GRUPO_DE_INTERESADOS: Readonly<Record<string, { readonly titulo: string; readonly vacio: string }>> = {
  TODAY: { titulo: 'Te toca hoy', vacio: 'Nadie por contactar hoy.' },
  UNCONTACTED: { titulo: 'Sin contactar', vacio: 'Todos los interesados tienen al menos un contacto.' },
  WAITING: { titulo: 'Esperando', vacio: 'Nadie con un próximo paso más adelante.' },
};

/** Las insignias de un alta digital por revisar (`INTAKE_FLAGS`), con su tono. */
export const INSIGNIA_DE_ALTA: Readonly<Record<string, EtiquetaConTono>> = {
  MISSING_BIRTHDATE: { label: 'Falta nacimiento', tone: 'warn' },
  MISSING_EMERGENCY: { label: 'Falta emergencia', tone: 'warn' },
  HEALTH_NOTE: { label: 'Nota de salud', tone: 'info' },
  POSSIBLE_DUPLICATE: { label: 'Posible duplicado', tone: 'danger' },
  SHARED_PHONE: { label: 'Comparte celular', tone: 'warn' },
  WAS_PROSPECT: { label: 'Era interesado', tone: 'info' },
  RETURNING: { label: 'Ya venía', tone: 'neutral' },
  CORRECTED: { label: 'Corregida', tone: 'neutral' },
  // D-10 (3.4): de 15 a 17 años; se aprueba cuando su tutor firma en el mostrador.
  NEEDS_GUARDIAN: { label: 'Falta su tutor', tone: 'danger' },
};

/** Qué es la persona que encontró el buscador de identidad (`IDENTITY_KINDS`). */
export const TIPO_DE_PERSONA: Readonly<Record<string, string>> = {
  MEMBER: 'Ya es socio',
  FORMER_MEMBER: 'Fue socio',
  PROSPECT: 'Interesado en seguimiento',
  INTAKE: 'Alta digital por revisar',
};

/** Los pasos para terminar un alta (`ONBOARDING_STEPS`): cómo se llama cada uno hecho y por hacer. */
export const PASO_DEL_ALTA: Readonly<Record<string, { readonly porHacer: string; readonly hecho: string }>> = {
  SELL: { porHacer: 'Vender su membresía', hecho: 'Ya tiene membresía' },
  COLLECT: { porHacer: 'Cobrar lo que debe', hecho: 'Al corriente' },
  PORTAL: { porHacer: 'Darle su código del portal', hecho: 'Portal activado' },
  FACE: { porHacer: 'Registrar su rostro', hecho: 'Rostro registrado' },
  DATA: { porHacer: 'Completar sus datos', hecho: 'Datos completos' },
};
