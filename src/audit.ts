import { createHash } from 'node:crypto';

export type AuditActorType = 'USER' | 'SYSTEM' | 'JOB' | 'GATEWAY' | 'MEMBER';

/** Contenido inmutable de una entrada de bitácora. Es lo que entra al hash. */
export type AuditContent = {
  readonly id: string;
  readonly organizationId: string;
  readonly branchId: string | null;
  readonly actorUserId: string | null;
  readonly actorType: AuditActorType;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly beforeState: unknown;
  readonly afterState: unknown;
  readonly reason: string | null;
  readonly approvedByUserId: string | null;
  readonly at: string; // ISO-8601 UTC
};

/**
 * Serialización canónica: claves ordenadas de forma estable en todos los
 * niveles. Sin esto, dos procesos que serializan el mismo objeto en distinto
 * orden producirían hashes distintos y la cadena se rompería sola.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'bigint' ? value.toString() : value;
  }
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value instanceof Date) return value.toISOString();

  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    out[key] = sortDeep(source[key]);
  }
  return out;
}

/**
 * Tamper-evidence barata (§28), sin caer en event sourcing (§60).
 *
 * hash = sha256(prevHash || canonicalJson(contenido)), encadenado POR
 * ORGANIZACIÓN. Un job diario recorre la cadena y alerta si se rompe: eso
 * detecta ediciones o borrados hechos directamente en la base de datos.
 *
 * Coste total: una columna y un job.
 */
export function computeAuditHash(prevHash: string | null, content: AuditContent): string {
  return createHash('sha256')
    .update(prevHash ?? 'GENESIS')
    .update('\u0000')
    .update(canonicalJson(content))
    .digest('hex');
}

export type ChainLink = { readonly prevHash: string | null; readonly hash: string; readonly content: AuditContent };

export type ChainVerification =
  | { readonly ok: true; readonly checked: number; readonly lastHash: string | null }
  | { readonly ok: false; readonly checked: number; readonly brokenAtId: string; readonly reason: string };

/**
 * Verifica una cadena, en orden cronológico ascendente.
 *
 * Se puede verificar POR TRAMOS: `expectedPrev` es el hash del último
 * eslabón del tramo anterior (null al empezar) y el resultado devuelve el
 * `lastHash` con el que sigue el próximo. Así la bitácora entera nunca tiene
 * que caber en memoria.
 */
export function verifyAuditChain(links: readonly ChainLink[], expectedPrev: string | null = null): ChainVerification {
  let prev = expectedPrev;

  for (let i = 0; i < links.length; i++) {
    const link = links[i]!;
    if (link.prevHash !== prev) {
      return {
        ok: false,
        checked: i,
        brokenAtId: link.content.id,
        reason: `prevHash no encadena: esperado ${prev ?? 'GENESIS'}, encontrado ${link.prevHash ?? 'null'}`,
      };
    }
    const recomputed = computeAuditHash(link.prevHash, link.content);
    if (recomputed !== link.hash) {
      return {
        ok: false,
        checked: i,
        brokenAtId: link.content.id,
        reason: 'el contenido no corresponde al hash almacenado (fila alterada)',
      };
    }
    prev = link.hash;
  }

  return { ok: true, checked: links.length, lastHash: prev };
}

/**
 * El SUBCONJUNTO que además exige un motivo escrito.
 *
 * Son dos cosas distintas y confundirlas sale caro. Abrir turno es sensible
 * —se audita con nombre, hora y sucursal— pero es RUTINARIO: pedir un motivo
 * tres veces al día produce "turno", "apertura", "x", y ese ruido entrena al
 * personal a rellenar cualquier campo de motivo sin pensar, incluidos los que
 * sí importan. El motivo se pide donde hay una DECISIÓN que justificar.
 *
 * Cerrar turno tampoco está: el motivo se exige solo cuando hay diferencia,
 * y eso lo gobierna `canClose` con mucha más precisión que una lista.
 *
 * LAS CLAVES SON LAS QUE EL SERVIDOR ASIENTA DE VERDAD (auditoría 8, 20-08).
 * Antes la lista decía `discount.apply`, `payment.reverse`, `charge.void`…,
 * y las acciones reales son `billing.discount.apply`, `payments.reverse`,
 * `billing.charge.void`: la segunda red (`AuditService.record`) no atrapaba
 * nada de dinero. Cada clave de aquí tiene frase en `AUDIT_LABELS` (lo fija
 * `test/audit.test.ts`) y hoy su ruta ya exige el motivo con Zod: esta lista
 * es la red para quien llame al servicio por otro camino.
 *
 * Salieron las que no corresponden a ninguna acción: `membership.extend`,
 * `payment.backdate` (la fecha atrasada va como `backdated` en
 * `membership.sale`), `price.change` y `plan.change` (el precio y el plan se
 * cambian dentro de `catalog.plan.update`, `class.type.price` y
 * `membership.plan_changed`, que también asientan cambios sin decisión),
 * `cash.variance.approve` (lo gobierna `canClose`) e `integration.configure`.
 */
export const ACTIONS_REQUIRING_REASON = new Set<string>([
  // Dinero: descontar, condonar, anular, revertir, devolver.
  'billing.discount.apply', 'billing.waiver.apply', 'billing.charge.void',
  'payments.reverse', 'payment.refund', 'payments.refund.ledger',
  'pos.sale.void', 'expense.void',
  'cash.withdraw',
  // Membresías, paquetes y existencias que se corrigen a mano.
  'membership.cancel', 'visitpack.adjust', 'pos.inventory.adjust',
  // Personal: lo que puede hacer cada quien y quién deja de entrar.
  'staff.permissions', 'staff.role', 'staff.deactivate', 'staff.rescue',
  'access.manual_grant', 'member.anonymize',
  // Publicar un texto que el socio va a firmar, retirar el que firmó, rechazar
  // un alta y cancelar la reserva de otro son decisiones, no rutina.
  'consent.document.publish', 'consent.document.retire', 'intake.reject',
  'class.booking.override_cancel',
  'access.biometric.enroll', 'access.biometric.revoke',
]);
