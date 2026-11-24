import { getPermission, type PermissionKey } from './permissions.js';

export type ActorType = 'USER' | 'MEMBER' | 'SYSTEM' | 'JOB' | 'GATEWAY';

/**
 * Una concesión resuelta desde RoleAssignment + RolePermission.
 * `branchId === null` significa alcance ORGANIZACIONAL.
 */
export type Grant = {
  readonly permission: string;
  readonly branchId: string | null;
};

/**
 * Límites cuantitativos por rol (ADR-009). Un permiso booleano no basta para
 * dinero. `null` = sin límite. Viven en configuración por organización,
 * NUNCA en el código.
 */
export type RoleLimits = {
  readonly maxDiscountPercent: number | null;
  readonly maxWaiverAmountCents: bigint | null;
  readonly maxManualBalanceAdjustCents: bigint | null;
  readonly maxCashWithdrawalCents: bigint | null;
  readonly maxRefundAmountCents: bigint | null;
  /** Se ALERTA al excederlo, nunca se bloquea. Ver nota en `can()`. */
  readonly maxManualAccessGrantsPerShift: number | null;
  readonly maxPosVoidsPerShift: number | null;
};

export const UNLIMITED_LIMITS: RoleLimits = {
  maxDiscountPercent: null,
  maxWaiverAmountCents: null,
  maxManualBalanceAdjustCents: null,
  maxCashWithdrawalCents: null,
  maxRefundAmountCents: null,
  maxManualAccessGrantsPerShift: null,
  maxPosVoidsPerShift: null,
};

/**
 * Contexto del actor. Se resuelve SIEMPRE desde la sesión, NUNCA desde el
 * body ni de un query param: ese es el ataque clásico de multi-tenancy.
 */
export type TenantContext = {
  readonly organizationId: string;
  readonly actorType: ActorType;
  readonly actorUserId?: string | undefined;
  readonly memberId?: string | undefined;
  readonly grants: readonly Grant[];
  readonly limits: RoleLimits;
  readonly sessionId?: string | undefined;
  readonly requestId: string;
  readonly ip?: string | undefined;
  readonly userAgent?: string | undefined;
};

/** El recurso sobre el que se actúa. Siempre lleva su organizationId. */
export type ResourceScope = {
  readonly organizationId: string;
  readonly branchId?: string | null | undefined;
  readonly amountCents?: bigint | undefined;
  readonly percent?: number | undefined;
  readonly reason?: string | undefined;
  readonly approvedByUserId?: string | undefined;
  /** Uso acumulado en el turno, para los límites que solo alertan. */
  readonly shiftUsageCount?: number | undefined;
  /**
   * D-12 (bloque 3.5): lo que a ESTE socio todavía se le puede perdonar sin la
   * firma de la dueña (una mensualidad suya menos lo ya perdonado sin firma en
   * los últimos 30 días; `perdonSinFirma` del núcleo). Lo calcula la ruta, que
   * es quien ve la base. Sin este dato, condonar pide firma siempre.
   */
  readonly waiverAllowanceCents?: bigint | undefined;
};

export type DenyCode =
  | 'CROSS_TENANT'
  | 'NO_PERMISSION'
  | 'OUT_OF_BRANCH_SCOPE'
  | 'REASON_REQUIRED'
  | 'LIMIT_FORBIDDEN';

export type Decision =
  | { readonly outcome: 'ALLOW' }
  | { readonly outcome: 'ALLOW_WITH_ALERT'; readonly alert: string }
  | { readonly outcome: 'REQUIRE_APPROVAL'; readonly limit: string; readonly detail: string }
  | { readonly outcome: 'DENY'; readonly code: DenyCode; readonly detail: string };

const ALLOW: Decision = { outcome: 'ALLOW' };

/**
 * ÚNICO punto de decisión de autorización del sistema (§27, ADR-009).
 *
 * Recibe siempre el recurso con su organizationId y su branchId, de modo que
 * el alcance se evalúa JUNTO con el permiso y no por separado: un gerente de
 * la sucursal A no puede operar en la B aunque tenga el permiso.
 *
 * Anti-patrón explícitamente prohibido por §27: `if (role === "ADMIN")`.
 */
export function can(
  ctx: TenantContext,
  permission: PermissionKey,
  resource: ResourceScope,
): Decision {
  // 1. Frontera de tenant. Es la primera comprobación y no admite excepción.
  if (resource.organizationId !== ctx.organizationId) {
    return {
      outcome: 'DENY',
      code: 'CROSS_TENANT',
      detail: 'El recurso pertenece a otra organización',
    };
  }

  const def = getPermission(permission);

  // 2. ¿Tiene el permiso, y con alcance suficiente?
  const matching = ctx.grants.filter((g) => g.permission === permission);
  if (matching.length === 0) {
    return { outcome: 'DENY', code: 'NO_PERMISSION', detail: `Falta el permiso ${permission}` };
  }

  const hasOrgWide = matching.some((g) => g.branchId === null);
  // `branchId` ausente = la acción no es específica de sucursal.
  const branchSpecified = resource.branchId !== undefined;
  const targetBranch = resource.branchId ?? null;

  if (!hasOrgWide && branchSpecified) {
    // Solo tiene concesiones acotadas a sucursales concretas.
    if (targetBranch === null) {
      return {
        outcome: 'DENY',
        code: 'OUT_OF_BRANCH_SCOPE',
        detail: 'La acción es de alcance organizacional y el actor solo tiene alcance de sucursal',
      };
    }
    if (!matching.some((g) => g.branchId === targetBranch)) {
      return {
        outcome: 'DENY',
        code: 'OUT_OF_BRANCH_SCOPE',
        detail: 'El actor no tiene alcance sobre esa sucursal',
      };
    }
  }

  // 3. Motivo obligatorio. El motivo se elige de catálogo: si falta, se rechaza.
  if (def.requiresReason && !isNonEmpty(resource.reason)) {
    return {
      outcome: 'DENY',
      code: 'REASON_REQUIRED',
      detail: `${permission} exige motivo`,
    };
  }

  // 4. Aprobación de un segundo (maker-checker) exigida SIEMPRE por el permiso.
  if (def.requiresApproval && !isNonEmpty(resource.approvedByUserId)) {
    return {
      outcome: 'REQUIRE_APPROVAL',
      limit: 'permission.requiresApproval',
      detail: `${permission} exige autorización de un segundo usuario`,
    };
  }
  // Nadie se aprueba a sí mismo.
  if (isNonEmpty(resource.approvedByUserId) && resource.approvedByUserId === ctx.actorUserId) {
    return {
      outcome: 'DENY',
      code: 'LIMIT_FORBIDDEN',
      detail: 'El aprobador no puede ser el mismo usuario que ejecuta la acción',
    };
  }

  // 5. Límites cuantitativos.
  return checkLimits(ctx, permission, resource);
}

function checkLimits(
  ctx: TenantContext,
  permission: PermissionKey,
  resource: ResourceScope,
): Decision {
  const approved = isNonEmpty(resource.approvedByUserId);
  const { limits } = ctx;

  switch (permission) {
    case 'billing:discount:apply': {
      const tope = limits.maxDiscountPercent === null ? null : BigInt(Math.round(limits.maxDiscountPercent * 100));
      const pedido = resource.percent === undefined ? undefined : BigInt(Math.round(resource.percent * 100));
      /**
       * Choque 5 de la auditoría 8 (D-15, bloque 3.5): un descuento por encima
       * del tope del puesto es, en lo que excede, un perdón. Solo puede pedirlo
       * (con firma) quien puede perdonar; el puesto que no perdona nada
       * (`maxWaiverAmountCents` en cero: recepción) NUNCA pasa de su tope, ni
       * con la firma de la dueña. Antes recepción «pedía firma» para un 50 %.
       */
      if (tope !== null && tope > 0n && pedido !== undefined && pedido > tope && limits.maxWaiverAmountCents === 0n) {
        return { outcome: 'DENY', code: 'LIMIT_FORBIDDEN', detail: `Tu puesto no descuenta más de ${limits.maxDiscountPercent} %: pídeselo a la gerencia` };
      }
      return amountGate('maxDiscountPercent', tope, pedido, approved, `descuento por encima de ${limits.maxDiscountPercent}%`);
    }

    /**
     * D-12: la gerencia perdona sola hasta una mensualidad del socio; arriba,
     * con la firma de la dueña. El tope del puesto (`maxWaiverAmountCents`)
     * sigue valiendo: en cero, el puesto no perdona; con importe, es otro techo.
     */
    case 'billing:waiver:apply': {
      if (limits.maxWaiverAmountCents === 0n) {
        return { outcome: 'DENY', code: 'LIMIT_FORBIDDEN', detail: 'maxWaiverAmountCents: el rol no está autorizado' };
      }
      if (resource.amountCents === undefined) {
        return { outcome: 'DENY', code: 'LIMIT_FORBIDDEN', detail: 'maxWaiverAmountCents: falta el monto a evaluar' };
      }
      if (approved) return ALLOW;
      const delSocio = resource.waiverAllowanceCents ?? 0n;
      const tope = limits.maxWaiverAmountCents === null || delSocio < limits.maxWaiverAmountCents ? delSocio : limits.maxWaiverAmountCents;
      if (resource.amountCents <= tope) return ALLOW;
      return { outcome: 'REQUIRE_APPROVAL', limit: 'waiverAllowanceCents', detail: 'perdón por encima de una mensualidad del socio: lo firma la dueña' };
    }

    case 'members:balance:adjust':
      return amountGate('maxManualBalanceAdjustCents', limits.maxManualBalanceAdjustCents, resource.amountCents, approved,
        'ajuste de saldo por encima del límite del rol');

    /**
     * D-15 (bloque 3.5): aquí solo se decide si el puesto retira (en cero, no).
     * Que el retiro lleve SIEMPRE firma y que recepción no pase de su tope
     * acumulado por turno (ni con firma) lo decide `reglaDelCajon` con el tope
     * del gimnasio, en el servicio de caja, que es quien ve el turno.
     */
    case 'cash:withdraw':
      if (limits.maxCashWithdrawalCents === 0n) {
        return { outcome: 'DENY', code: 'LIMIT_FORBIDDEN', detail: 'maxCashWithdrawalCents: el rol no está autorizado' };
      }
      return ALLOW;

    case 'payments:refund':
      return amountGate('maxRefundAmountCents', limits.maxRefundAmountCents, resource.amountCents, approved,
        'reembolso por encima del límite del rol');

    /**
     * NUNCA se bloquea, se cuenta y se alerta.
     *
     * Si el sistema impidiera a recepción dejar entrar a alguien, encontrarían
     * la forma de saltárselo —una llave, una puerta lateral— y el dato se
     * perdería. Permitirlo CON MOTIVO Y NOMBRE lo convierte en un registro.
     * El objetivo es visibilidad, no prohibición (principio 8 de la visión).
     */
    case 'access:manual_grant': {
      const max = limits.maxManualAccessGrantsPerShift;
      const used = resource.shiftUsageCount ?? 0;
      if (max !== null && used >= max) {
        return {
          outcome: 'ALLOW_WITH_ALERT',
          alert: `Concesiones manuales del turno: ${used + 1}, por encima del límite de ${max}`,
        };
      }
      return ALLOW;
    }

    case 'pos:sale:void': {
      const max = limits.maxPosVoidsPerShift;
      const used = resource.shiftUsageCount ?? 0;
      if (max !== null && used >= max) {
        return { outcome: 'ALLOW_WITH_ALERT', alert: `Anulaciones del turno: ${used + 1}, por encima de ${max}` };
      }
      return ALLOW;
    }

    default:
      return ALLOW;
  }
}

function amountGate(
  limitName: string,
  limit: bigint | null,
  value: bigint | undefined,
  approved: boolean,
  detail: string,
): Decision {
  if (limit === null) return ALLOW; // sin límite configurado
  if (value === undefined) {
    return { outcome: 'DENY', code: 'LIMIT_FORBIDDEN', detail: `${limitName}: falta el monto a evaluar` };
  }
  // Límite en cero = el rol simplemente no puede hacerlo. No es cuestión de aprobar.
  if (limit === 0n) {
    return { outcome: 'DENY', code: 'LIMIT_FORBIDDEN', detail: `${limitName}: el rol no está autorizado` };
  }
  if (value <= limit) return ALLOW;
  if (approved) return ALLOW; // un segundo usuario ya lo autorizó
  return { outcome: 'REQUIRE_APPROVAL', limit: limitName, detail };
}

function isNonEmpty(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * ¿Puede ESTA persona autorizar la operación de otra? (SEC2-05, 2026-10-05)
 *
 * Firma quien tiene `approvals:grant` sobre la sede de la operación: el
 * dueño, desde su teléfono. No evalúa motivo ni la exigencia de segunda
 * firma: eso es de quien ejecuta, no de quien autoriza. Que nadie se firme a
 * sí mismo lo vigila `can()`.
 */
export function canApprove(
  ctx: TenantContext,
  permission: PermissionKey,
  resource: { organizationId: string; branchId?: string | null | undefined; amountCents?: bigint | undefined; percent?: number | undefined },
): Decision {
  // No hace falta poder ejecutar la operación ni tiene topes: firmar existe
  // justo para cuando quien la pide no alcanza. `permission` queda en la firma
  // por la bitácora y por si un día una operación pide otro firmante.
  void permission;
  return canPossess(ctx, 'approvals:grant', resource);
}

/** Azúcar para los casos en que solo interesa si pasó o no. */
export function isAllowed(decision: Decision): boolean {
  return decision.outcome === 'ALLOW' || decision.outcome === 'ALLOW_WITH_ALERT';
}

/**
 * Comprobación de TENENCIA y ALCANCE únicamente.
 *
 * La usa el registro de rutas como puerta de entrada. Deliberadamente NO
 * evalúa motivo, aprobación ni límites: esos dependen del recurso concreto
 * y del monto, que solo el handler conoce.
 *
 * `branchId` tiene TRES significados distintos, y confundirlos rompe cosas:
 *   · `undefined` -> basta con tener el permiso en CUALQUIER alcance.
 *     Es lo que usa el gate de ruta: exigir alcance organizacional aquí
 *     dejaría fuera de todo listado a quien esté acotado a una sucursal.
 *   · `null`      -> se exige alcance ORGANIZACIONAL (acción global).
 *   · un id       -> se exige alcance sobre ESA sucursal.
 */
export function canPossess(
  ctx: TenantContext,
  permission: PermissionKey,
  resource: { organizationId: string; branchId?: string | null | undefined },
): Decision {
  if (resource.organizationId !== ctx.organizationId) {
    return { outcome: 'DENY', code: 'CROSS_TENANT', detail: 'El recurso pertenece a otra organización' };
  }
  const matching = ctx.grants.filter((g) => g.permission === permission);
  if (matching.length === 0) {
    return { outcome: 'DENY', code: 'NO_PERMISSION', detail: `Falta el permiso ${permission}` };
  }

  // Cualquier alcance basta.
  if (!('branchId' in resource) || resource.branchId === undefined) return ALLOW;

  const hasOrgWide = matching.some((g) => g.branchId === null);
  if (hasOrgWide) return ALLOW;

  if (resource.branchId === null) {
    return { outcome: 'DENY', code: 'OUT_OF_BRANCH_SCOPE', detail: 'Acción organizacional con alcance de sucursal' };
  }
  if (!matching.some((g) => g.branchId === resource.branchId)) {
    return { outcome: 'DENY', code: 'OUT_OF_BRANCH_SCOPE', detail: 'Sin alcance sobre esa sucursal' };
  }
  return ALLOW;
}
