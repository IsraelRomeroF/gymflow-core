import type { ModuleKey } from './modules.js';

/**
 * Catálogo de permisos (ADR-009, docs/06-roles-permisos.md).
 *
 * Es catálogo GLOBAL de la plataforma: no lleva organizationId.
 * Formato: "<dominio>:<recurso>:<acción>".
 *
 * `requiresReason`   -> la operación exige motivo de catálogo, que se guarda
 *                       en AuditLog. Sin él, la operación se rechaza.
 * `requiresApproval` -> exige aprobación de un segundo usuario (maker-checker)
 *                       SIEMPRE, no solo al exceder un límite.
 */
export type PermissionDef = {
  readonly key: string;
  readonly domain: string;
  /**
   * El módulo al que pertenece (ADR-036). NO es el prefijo: `members:intake:*`
   * es de Altas digitales y `access:biometric:enroll` es de Biometría.
   */
  readonly module: ModuleKey;
  readonly description: string;
  readonly requiresReason: boolean;
  readonly requiresApproval: boolean;
};

/** El módulo de un permiso, salvo que el permiso diga otro. */
const MODULO_DEL_DOMINIO: Readonly<Record<string, ModuleKey>> = {
  members: 'core', catalog: 'core', staff: 'core', approvals: 'core', memberships: 'core', billing: 'core', payments: 'core',
  access: 'core', reports: 'core', audit: 'core', settings: 'core', ops: 'core', platform: 'core',
  cash: 'cash', pos: 'pos', classes: 'classes', training: 'training', expenses: 'core',
};

function p(
  key: string,
  description: string,
  opts: { reason?: boolean; approval?: boolean; module?: ModuleKey } = {},
): PermissionDef {
  const domain = key.split(':')[0]!;
  const module = opts.module ?? MODULO_DEL_DOMINIO[domain];
  if (!module) throw new Error(`El permiso ${key} no pertenece a ningún módulo`);
  return {
    key,
    domain,
    module,
    description,
    requiresReason: opts.reason ?? false,
    requiresApproval: opts.approval ?? false,
  };
}

export const PERMISSIONS = [
  // ── members ───────────────────────────────────────────────────────────────
  p('members:read', 'Ver el expediente de un socio'),
  p('members:create', 'Dar de alta un socio'),
  p('members:update', 'Editar los datos de un socio'),
  p('members:archive', 'Archivar un socio', { reason: true }),
  p('members:anonymize', 'Anonimizar un socio (derecho ARCO)', { reason: true, approval: true }),
  p('members:export', 'Exportar todos los datos de un socio (derecho ARCO de acceso)', { reason: true }),
  // Carga masiva desde el sistema anterior: crea fichas, saldos iniciales y vigencias.
  p('members:import', 'Importar una base de socios y resolver sus duplicados', { reason: true }),
  // La nota de salud es DATO SENSIBLE: permiso aparte, no incluido en members:read.
  // Peso y medidas no se registran (D-33, «no por ahora»): el permiso no los promete (12-03).
  p('members:health:read', 'Ver la nota de salud del socio'),
  p('members:balance:adjust', 'Ajustar manualmente el saldo de un socio', { reason: true }),
  p('members:consent:read', 'Ver los consentimientos de un socio'),
  // Registrar lo que el socio pide en el mostrador (21-04): atender, no modificar.
  // Resolver la solicitud sigue siendo de quien edita la ficha (`members:update`).
  p('members:privacy:request', 'Registrar una solicitud de privacidad (ARCO) del socio'),
  // "Dar acceso al sistema": recepción entrega el código del portal sin
  // poder editar la ficha. Antes colgaba de `members:update`.
  p('members:portal:invite', 'Dar acceso al portal del socio (código de activación)', { module: 'member_portal' }),
  // Bandeja de salida (2.9, D-34): mandar desde la lista el WhatsApp ya escrito. Ni la dueña ni el coach (D-30).
  p('members:message:send', 'Mandar a un socio, por WhatsApp, un mensaje de la lista de Mensajes'),
  p('members:intake:read', 'Ver las altas digitales', { module: 'intake' }),
  p('members:intake:review', 'Revisar y aprobar altas digitales', { module: 'intake' }),

  // ── catálogo ──────────────────────────────────────────────────────────────
  p('catalog:read', 'Ver el catálogo de planes y precios'),
  p('catalog:manage', 'Crear y editar planes y precios', { reason: true }),

  // ── staff ─────────────────────────────────────────────────────────────────
  // Leer el directorio de personal es una acción distinta de CAMBIAR roles:
  // esta última exige motivo y aprobación, así que no puede servir de gate
  // para una lectura.
  p('staff:read', 'Ver el directorio de personal'),
  p('staff:manage', 'Alta, baja y edición de personal', { reason: true }),
  // La llave del dueño: qué pantallas de Dirección y Cumplimiento ve cada persona de su equipo.
  p('staff:unlock', 'Liberar al personal las secciones de Dirección y Cumplimiento', { reason: true }),
  // La salida del dueño cuando el gerente falla: contraseña temporal, baja o reactivación de un GERENTE.
  p('staff:rescue', 'Rescatar la cuenta de un gerente (contraseña temporal, baja o reactivación)', { reason: true }),

  // ── memberships ───────────────────────────────────────────────────────────
  p('memberships:create', 'Crear una membresía'),
  /// Activar, renovar o cambiar de plan SIN pasar por el cobro. Existe para
  /// corregir a mano lo que el flujo normal no cubre; por eso es solo de la
  /// gerencia (el dueño no opera) y deja motivo. El mostrador vende, renueva y
  /// cambia de plan por billing, que cobra.
  p('memberships:override', 'Mover una membresía sin cobrarla (corrección manual)', { reason: true }),
  p('memberships:change_plan', 'Cambiar el plan de una membresía', { reason: true }),
  p('memberships:freeze', 'Congelar o pausar una membresía', { reason: true }),
  p('memberships:cancel', 'Cancelar una membresía', { reason: true }),
  p('memberships:visitpack:manage', 'Vender y gestionar paquetes de visitas'),
  p('memberships:visitpack:adjust', 'Ajustar el saldo de visitas', { reason: true, approval: true }),

  // ── billing ───────────────────────────────────────────────────────────────
  /// Estado de cuenta de UN socio. Separado de la cartera consolidada a
  /// propósito: recepción tiene que ver lo que este socio debe para poder
  /// cobrarle, pero no la salud financiera del negocio completo.
  p('billing:statement:read', 'Ver el estado de cuenta de un socio'),
  p('billing:portfolio:read', 'Ver la cartera consolidada'),
  /// El cargo del CATÁLOGO que se cobra (la cuota del periodo, reanudar un
  /// adeudo): lo emite el mostrador al cobrar, sin teclear el importe.
  p('billing:charge:create', 'Emitir el cargo de catálogo que se cobra (cuota o adeudo)', { reason: true }),
  /// Un cargo FUERA del catálogo, con el importe tecleado (pase de día,
  /// ajuste, saldo inicial): solo la gerencia, con motivo, y sale en «Para
  /// revisar» de la bitácora (28-05). Recepción cobra lo del catálogo.
  p('billing:charge:manual', 'Crear un cargo fuera del catálogo (importe a mano)', { reason: true }),
  p('billing:charge:void', 'Anular un cargo', { reason: true, approval: true }),
  p('billing:discount:apply', 'Aplicar un descuento', { reason: true }),
  p('billing:waiver:apply', 'Condonar deuda', { reason: true, approval: true }),

  // ── payments ──────────────────────────────────────────────────────────────
  p('payments:record', 'Registrar un pago'),
  p('payments:reverse', 'Revertir un pago', { reason: true, approval: true }),
  p('payments:refund', 'Emitir un reembolso', { reason: true, approval: true }),
  p('payments:backdate', 'Vender o cobrar con fecha anterior a hoy (más de 7 días)', { reason: true }),
  p('payments:reconciliation:read', 'Ver la conciliación con el procesador'),
  // Resolver es ESCRIBIR (consulta al procesador y fija el estado del intento):
  // no puede colgar de un permiso de lectura que tiene la dueña (28-04).
  p('payments:reconciliation:resolve', 'Resolver un intento de pago dudoso con el procesador'),

  // ── cash ──────────────────────────────────────────────────────────────────
  p('cash:session:open', 'Abrir caja'),
  p('cash:session:close', 'Cerrar caja'),
  p('cash:session:read', 'Ver cortes de caja'),
  p('cash:withdraw', 'Retirar efectivo de la caja', { reason: true }),
  p('cash:variance:approve', 'Aprobar un descuadre de caja', { reason: true }),

  // ── pos ───────────────────────────────────────────────────────────────────
  p('pos:sale:create', 'Vender en el punto de venta'),
  p('pos:sale:void', 'Anular una venta', { reason: true }),
  p('pos:product:manage', 'Gestionar el catálogo de productos'),
  p('pos:inventory:adjust', 'Ajustar inventario', { reason: true }),

  // ── access ────────────────────────────────────────────────────────────────
  p('access:monitor', 'Ver el monitor de acceso en vivo'),
  // NUNCA se bloquea por límite: se cuenta y se alerta (ver RoleLimits).
  p('access:manual_grant', 'Conceder acceso manualmente', { reason: true }),
  p('access:credential:manage', 'Emitir o revocar credenciales'),
  p('access:biometric:enroll', 'Enrolar un biométrico', { reason: true, module: 'biometrics' }),
  p('access:device:manage', 'Gestionar dispositivos y gateways', { module: 'turnstile' }),
  p('access:attendance:read', 'Ver el historial de asistencia'),

  // ── classes / training ────────────────────────────────────────────────────
  p('classes:read', 'Ver clases, horarios y listas de asistencia'),
  p('classes:manage', 'Gestionar clases y horarios'),
  p('classes:book_for_member', 'Reservar a nombre de un socio'),
  p('classes:booking:override', 'Cancelar una reserva fuera de la ventana', { reason: true }),
  p('training:template:manage', 'Gestionar plantillas de rutina'),
  p('training:assign', 'Asignar una rutina'),
  // Recepción contesta «¿ya tengo rutina?» y la imprime; no la cambia (12-17, bloque 2.6).
  p('training:read', 'Ver e imprimir la rutina de un socio'),

  // ── reports / audit / settings ────────────────────────────────────────────
  // Su único uso es la pantalla de Retención.
  p('reports:branch:read', 'Ver reportes de sucursal', { module: 'retention' }),
  // Anotar "le llamé" desde Retención es escribir: permiso propio, no el de ver (28-04).
  p('retention:followup:write', 'Anotar el seguimiento a un socio en riesgo', { module: 'retention' }),
  p('reports:financial:read', 'Ver reportes financieros y KPIs'),
  // El cierre lo hace el gerente y lo firma el dueño: desde entonces el mes no se reescribe (fase 4).
  p('reports:month:close', 'Cerrar el mes', { reason: true, approval: true }),
  p('expenses:manage', 'Registrar y anular gastos fijos (renta, nómina, servicios)', { reason: true }),
  p('audit:read', 'Consultar la bitácora de auditoría'),
  p('audit:export', 'Exportar la bitácora de auditoría', { reason: true }),
  p('settings:branch', 'Configurar una sucursal'),
  p('settings:org', 'Configurar la organización'),
  // Publicar un texto de consentimiento es un acto jurídico: lo firma el socio
  // y hay que poder demostrar quién lo puso en circulación y por qué.
  p('settings:consent:manage', 'Publicar y retirar textos de consentimiento', { reason: true }),
  // ── plataforma ────────────────────────────────────────────────────────────
  // Lo tiene solo quien opera la PLATAFORMA (no pertenece a ningún gimnasio):
  // dar de alta una marca nueva con su dueña, su gerencia y su recepción.
  // ── segunda firma ─────────────────────────────────────────────────────────
  // Aprobar lo que otro pide (reembolsos, condonaciones, retiros grandes,
  // descuentos sobre tope) SIN poder hacerlo uno mismo. Lo tiene el dueño:
  // firma desde su teléfono y sigue sin operar (decisión del 2026-10-05).
  p('approvals:grant', 'Dar la segunda firma a lo que pide el personal'),
  p('platform:organizations:manage', 'Dar de alta y administrar marcas de gimnasio en la plataforma', { reason: true }),
] as const satisfies readonly PermissionDef[];

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

export const PERMISSION_BY_KEY: ReadonlyMap<string, PermissionDef> = new Map(
  PERMISSIONS.map((perm) => [perm.key, perm]),
);

/** A qué módulo pertenece un permiso. Los desconocidos, a ninguno. */
export function moduleOfPermission(key: string): ModuleKey | undefined {
  return PERMISSION_BY_KEY.get(key)?.module;
}

export function getPermission(key: PermissionKey): PermissionDef {
  const def = PERMISSION_BY_KEY.get(key);
  if (!def) throw new Error(`Permiso desconocido: ${key}`);
  return def;
}

// Los puestos (roles) y sus paquetes de permisos viven en `roles.ts` (ADR-039).

