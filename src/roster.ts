import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { canonicalJson } from './audit.js';
import type { MembershipStatus, VisitPackStatus } from './membership.js';
import type { BranchAccessScope, TimeWindow } from './access.js';

/**
 * Padrón firmado y operación sin red (§22, ADR-015).
 *
 * El gateway necesita decidir con la nube apagada. Para eso guarda una copia
 * del padrón —quién puede entrar y con qué credencial— y la nube se la manda
 * FIRMADA con Ed25519.
 *
 * La firma no es ceremonia: el gateway está en la sucursal, en una red que el
 * gimnasio no controla del todo. Sin firma, quien alcance ese equipo puede
 * escribirle un padrón propio y abrir la puerta a quien quiera. Con firma,
 * puede borrárselo —y entonces el gateway lo nota y degrada— pero no puede
 * falsificarlo.
 */

export type RosterEntry = {
  readonly memberId: string;
  readonly pinHash: string | null;
  readonly rfidCardId: string | null;
  readonly archived: boolean;
  readonly membershipStatus: MembershipStatus | null;
  readonly homeBranchId: string | null;
  readonly branchAccessScope: BranchAccessScope;
  readonly allowedBranchIds: readonly string[];
  readonly accessTimeWindows: readonly TimeWindow[] | null;
  readonly visitBalance: number | null;
  readonly visitPackExpired: boolean;
  /**
   * Estado del paquete. Va al padrón porque el gateway tiene que decidir
   * IGUAL que la nube: sin él, offline abriría con un paquete sin pagar que
   * en línea se rechaza — misma versión de política, decisiones distintas,
   * que es el fallo que el handshake no puede detectar.
   */
  readonly visitPackStatus: VisitPackStatus | null;
};

export type RosterPayload = {
  readonly organizationId: string;
  readonly branchId: string;
  /** Monótona y creciente. Es lo que impide volver a un padrón anterior. */
  readonly version: string;
  readonly issuedAtMs: number;
  /** Versión de la POLÍTICA con la que se generó. Cruza con el handshake. */
  readonly policyVersion: string;
  readonly entries: readonly RosterEntry[];
};

export type SignedRoster = {
  readonly payload: RosterPayload;
  /** Ed25519 sobre el JSON canónico del payload, en base64. */
  readonly signature: string;
};

// ── Firma ───────────────────────────────────────────────────────────────────

export function generateRosterKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

/**
 * Bytes que se firman.
 *
 * JSON **canónico**: si el orden de las claves variara, la misma información
 * daría firmas distintas y la verificación fallaría de forma intermitente —el
 * peor modo de fallo posible en una puerta.
 */
export function rosterBytes(payload: RosterPayload): Buffer {
  return Buffer.from(canonicalJson(payload), 'utf8');
}

export function signRoster(payload: RosterPayload, privateKeyPem: string): SignedRoster {
  const key = createPrivateKey(privateKeyPem);
  return { payload, signature: sign(null, rosterBytes(payload), key).toString('base64') };
}

export function verifyRoster(roster: SignedRoster, publicKeyPem: string): boolean {
  try {
    return verify(
      null,
      rosterBytes(roster.payload),
      createPublicKey(publicKeyPem),
      Buffer.from(roster.signature, 'base64'),
    );
  } catch {
    return false;
  }
}

// ── Versión monótona ────────────────────────────────────────────────────────

/**
 * ¿Se acepta el padrón entrante?
 *
 * Solo si es ESTRICTAMENTE más nuevo. Sin esta regla, reproducir un padrón
 * antiguo —uno en el que un socio expulsado todavía figuraba— le devolvería
 * el acceso. Es el ataque obvio contra un gateway en una red ajena.
 */
export function acceptsRoster(currentVersion: string | null, incomingVersion: string): boolean {
  if (currentVersion === null) return true;
  try {
    return BigInt(incomingVersion) > BigInt(currentVersion);
  } catch {
    return false;
  }
}

// ── Revocaciones: gana el NO ────────────────────────────────────────────────

export type Revocation = {
  readonly memberId: string;
  readonly issuedAtMs: number;
  readonly reason: string;
};

/**
 * Aplica revocaciones sobre el padrón cargado.
 *
 * **Gana el NO, siempre.** Una revocación se aplica aunque llegue por un canal
 * más lento que el padrón, y aunque el padrón sea posterior: retirar un acceso
 * es urgente y reponerlo no. La asimetría es deliberada — el error de negar de
 * más se resuelve en el mostrador en veinte segundos; el de permitir de más,
 * no se resuelve.
 */
export function applyRevocations(
  entries: readonly RosterEntry[],
  revocations: readonly Revocation[],
): RosterEntry[] {
  if (revocations.length === 0) return [...entries];
  const revocados = new Set(revocations.map((r) => r.memberId));
  return entries.map((e) =>
    revocados.has(e.memberId) ? { ...e, archived: true, membershipStatus: null } : e,
  );
}

// ── Escalera de degradación (§ arquitectura) ────────────────────────────────

export type DegradationLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';

/** Padrón con más de esto es viejo: se sigue abriendo, pero marcando. */
export const ROSTER_SOFT_EXPIRY_MS = 24 * 60 * 60 * 1000;
/** Con más de esto, el gateway se declara caído y se pasa a modo manual. */
export const ROSTER_HARD_EXPIRY_MS = 72 * 60 * 60 * 1000;
/** Sin nube más de esto, se opera en local. */
export const OFFLINE_THRESHOLD_MS = 60 * 1000;

export type GatewayHealth = {
  /** Milisegundos desde el último contacto con la nube. `null` = nunca. */
  readonly msSinceCloud: number | null;
  /** Antigüedad del padrón cargado. `null` = no hay padrón. */
  readonly rosterAgeMs: number | null;
  readonly cloudLatencyMs: number | null;
};

export type DegradationVerdict = {
  readonly level: DegradationLevel;
  /** ¿Puede el gateway decidir por su cuenta? */
  readonly canDecideLocally: boolean;
  /** Toda decisión se marca como excepción para revisión posterior. */
  readonly flagAsException: boolean;
  readonly detail: string;
};

/**
 * Nivel de degradación del gateway.
 *
 * El salto que importa es **L3 → L4**. Hasta L3 la puerta sigue abriendo con
 * datos viejos y marcando la excepción, porque dejar a doscientos socios fuera
 * por una caída de red es peor que dejar entrar a uno dado de baja hace dos
 * días. En L4 ya no hay información con la que decidir y se pasa a modo
 * manual, con la bitácora en papel que el instructivo del Sprint 15 describe.
 */
export function assessDegradation(health: GatewayHealth): DegradationVerdict {
  const { msSinceCloud, rosterAgeMs, cloudLatencyMs } = health;

  if (rosterAgeMs === null) {
    return {
      level: 'L4', canDecideLocally: false, flagAsException: true,
      detail: 'Sin padrón cargado: no hay con qué decidir. Modo manual',
    };
  }
  if (rosterAgeMs > ROSTER_HARD_EXPIRY_MS) {
    return {
      level: 'L4', canDecideLocally: false, flagAsException: true,
      detail: `Padrón de más de ${Math.round(ROSTER_HARD_EXPIRY_MS / 3_600_000)} h: modo manual`,
    };
  }
  if (rosterAgeMs > ROSTER_SOFT_EXPIRY_MS) {
    return {
      level: 'L3', canDecideLocally: true, flagAsException: true,
      detail: 'Padrón vencido: se permite el paso y se marca cada decisión para revisión',
    };
  }
  if (msSinceCloud === null || msSinceCloud > OFFLINE_THRESHOLD_MS) {
    return {
      level: 'L2', canDecideLocally: true, flagAsException: false,
      detail: 'Sin conexión, padrón fresco: decisión local completa',
    };
  }
  if (cloudLatencyMs !== null && cloudLatencyMs > 800) {
    return {
      level: 'L1', canDecideLocally: true, flagAsException: false,
      detail: 'Nube lenta: se decide local y el reporte se encola',
    };
  }
  return {
    level: 'L0', canDecideLocally: true, flagAsException: false,
    detail: 'Normal',
  };
}

// ── Cola local de eventos ───────────────────────────────────────────────────

export type QueuedEvent = {
  /** Generado EN EL GATEWAY. Es la clave de idempotencia al resincronizar. */
  readonly eventId: string;
  readonly atMs: number;
  readonly memberId: string | null;
  readonly outcome: 'GRANTED' | 'DENIED';
  readonly reason: string | null;
  readonly degradationLevel: DegradationLevel;
};

/**
 * Deduplica al resincronizar.
 *
 * La cola es *append-only* y el envío es *at-least-once*: un corte a mitad de
 * subida reenvía lo ya enviado. Si eso duplicara consumos de paquetes de
 * visitas, sería dinero del socio — por eso el identificador lo genera el
 * gateway y no el servidor.
 */
export function dedupeQueue(events: readonly QueuedEvent[]): QueuedEvent[] {
  const vistos = new Set<string>();
  const salida: QueuedEvent[] = [];
  for (const e of events) {
    if (vistos.has(e.eventId)) continue;
    vistos.add(e.eventId);
    salida.push(e);
  }
  return salida;
}

/** Eventos que faltan por subir, en orden cronológico. */
export function pendingSince(events: readonly QueuedEvent[], lastSyncedMs: number): QueuedEvent[] {
  return dedupeQueue(events)
    .filter((e) => e.atMs > lastSyncedMs)
    .sort((a, b) => a.atMs - b.atMs || a.eventId.localeCompare(b.eventId));
}
