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
  // D-29 (fase 3, bloque 3.8). Recepción elige el coach AL ALTA (`members:create`); después lo
  // cambia solo la gerencia. Reasignar socios entre coaches es reasignar clientes.
  p('members:coach:assign', 'Poner o cambiar el coach de un socio'),
  // «Hacerme su coach»: el coach se suma a un socio SIN coach con el código que el socio le
  // dicta en persona. No abre el padrón: sin código no hay socio.
  p('members:coach:claim', 'Hacerse coach de un socio sin coach, con el código que el socio le dicta'),
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
  // `memberships:override` («mover una membresía sin cobrarla») se retiró del
  // catálogo en el bloque 3.16: sus cinco rutas se quitaron con D-12 (bloque 3.5)
  // y ya nada lo pedía. `pnpm seed` lo borra de la base con sus concesiones.
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
  // D-12 (bloque 3.5): ya no pide firma SIEMPRE. La gerencia perdona sola hasta una mensualidad
  // del socio; arriba de eso, `can()` exige la firma de la dueña (`waiverAllowanceCents`).
  p('billing:waiver:apply', 'Condonar deuda', { reason: true }),
  // D-18 (bloque 4.4). Los plazos de la deuda (venta sin cobrar y deuda que se da por perdida)
  // los cambia la gerencia SOLO con la firma de la dueña: dar dinero por perdido es control.
  p('billing:debt-terms:set', 'Ajustar los plazos de la deuda', { reason: true, approval: true }),

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
  // D-15 (bloque 3.5). Retirar a la caja fuerte o depositar: siempre con la firma de la dueña
  // (lo decide la ruta con `reglaDelCajon`); recepción, además, hasta su tope por turno.
  p('cash:withdraw', 'Retirar efectivo de la caja o depositarlo', { reason: true }),
  // Fondo y gasto chico del cajón: con motivo y sin firma hasta el tope del gimnasio ($500).
  p('cash:petty:record', 'Anotar fondo y gasto chico del cajón', { reason: true }),
  // Los topes del cajón los cambia la gerencia SOLO con la firma de la dueña: son los que la limitan.
  p('cash:limits:set', 'Ajustar los topes del cajón', { reason: true, approval: true }),
  p('cash:variance:approve', 'Aprobar un descuadre de caja', { reason: true }),

  // ── pos ───────────────────────────────────────────────────────────────────
  p('pos:sale:create', 'Vender en el punto de venta'),
  p('pos:sale:void', 'Anular una venta', { reason: true }),
  // D-13 (bloque 3.5). La venta de OTRO día no se anula: se devuelve, con la firma de la dueña,
  // y el producto vuelve al inventario. Recepción no la tiene: marca la venta «por corregir».
  p('pos:sale:return', 'Registrar la devolución de una venta de otro día', { reason: true, approval: true }),
  p('pos:product:manage', 'Gestionar el catálogo de productos'),
  p('pos:inventory:adjust', 'Ajustar inventario', { reason: true }),

  // ── access ────────────────────────────────────────────────────────────────
  p('access:monitor', 'Ver el monitor de acceso en vivo'),
  // NUNCA se bloquea por límite: se cuenta y se alerta (ver RoleLimits).
  p('access:manual_grant', 'Conceder acceso manualmente', { reason: true }),
  // D-06 (fase 3, bloque 3.3): quien no tiene su rostro registrado solo entra si la
  // gerencia autoriza ESA visita. No viene con el mostrador ni se le puede liberar.
  p('access:entry:authorize', 'Autorizar la entrada de un socio sin rostro registrado', { reason: true, module: 'biometrics' }),
  p('access:credential:manage', 'Emitir o revocar credenciales'),
  p('access:biometric:enroll', 'Enrolar un biométrico', { reason: true, module: 'biometrics' }),
  p('access:device:manage', 'Gestionar dispositivos y gateways', { module: 'turnstile' }),
  p('access:attendance:read', 'Ver el historial de asistencia'),

  // ── classes / training ────────────────────────────────────────────────────
  p('classes:read', 'Ver clases, horarios y listas de asistencia'),
  p('classes:manage', 'Gestionar clases y horarios'),
  // D-28 (fase 3, bloque 3.8). El coach OPERA sus clases: pone suplente y cambia el cupo de la
  // sesión que imparte, sin armar el horario (`classes:manage` se le da por persona).
  p('classes:session:operate', 'Operar sus clases: poner suplente y cambiar el cupo de la sesión que imparte'),
  // Y nadie fuera de la gerencia cancela: ni una sesión, ni un horario, ni una clase, ni una
  // pausa por fechas (todo lo que le quita su lugar a quien reservó). No se le enciende a nadie.
  p('classes:session:cancel', 'Cancelar clases: una sesión, un horario, una clase o una pausa por fechas', { reason: true }),
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
  // D-18 (bloque 4.4). Los plazos de retención (dejó de venir, baja, perdido, Recuperar) los ajusta
  // la gerencia con motivo. Es del módulo base: «baja» también la cuentan el Inicio y el Tablero.
  p('retention:terms:set', 'Ajustar los plazos de retención', { reason: true, module: 'core' }),
  p('reports:financial:read', 'Ver reportes financieros y KPIs'),
  // El cierre lo hace el gerente y lo firma el dueño: desde entonces el mes no se reescribe (fase 4).
  p('reports:month:close', 'Cerrar el mes', { reason: true, approval: true }),
  p('expenses:manage', 'Registrar y anular gastos fijos (renta, nómina, servicios)', { reason: true }),
  // D-26 (fase 4, bloque 4.5): la nómina se anota por pago, con nombre. Verlo es de quien tiene Movimientos.
  p('expenses:payroll:read', 'Ver cuánto se le paga a cada persona (nómina por pago)'),
  p('audit:read', 'Consultar la bitácora de auditoría'),
  p('audit:export', 'Exportar la bitácora de auditoría', { reason: true }),
  p('settings:branch', 'Configurar una sucursal'),
  p('settings:org', 'Configurar la organización'),
  // Publicar un texto de consentimiento es un acto jurídico: lo firma el socio
  // y hay que poder demostrar quién lo puso en circulación y por qué.
  p('settings:consent:manage', 'Publicar y retirar textos de consentimiento', { reason: true }),
  // D-25 (bloque 3.7): la dueña LEE los textos legales completos sin abrir expedientes
  // (`members:consent:read` también abre lo firmado por cada socio: por eso es otro).
  p('settings:consent:read', 'Leer los textos legales del gimnasio'),
  // ── plataforma ────────────────────────────────────────────────────────────
  // Lo tiene solo quien opera la PLATAFORMA (no pertenece a ningún gimnasio):
  // dar de alta una marca nueva con su dueña, su gerencia y su recepción.
  // ── segunda firma ─────────────────────────────────────────────────────────
  // Aprobar lo que otro pide (reembolsos, condonaciones, retiros grandes,
  // descuentos sobre tope) SIN poder hacerlo uno mismo. Lo tiene el dueño:
  // firma desde su teléfono y sigue sin operar (decisión del 2026-10-05).
  p('approvals:grant', 'Dar la segunda firma a lo que pide el personal'),
  // D-02 (bloque 3.1): NO es de ningún puesto. La sesión lo trae solo mientras
  // la persona tiene un nombramiento de apoderado vigente; con él ve
  // Autorizaciones. Quién firma lo decide `ApprovalService.requireAuthority`.
  p('approvals:proxy', 'Dar la segunda firma como apoderado temporal del dueño (lo da un nombramiento, no un puesto)'),
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

