import { describe, it, expect } from 'vitest';
import {
  generateRosterKeyPair, signRoster, verifyRoster, acceptsRoster, applyRevocations,
  assessDegradation, dedupeQueue, pendingSince,
  ROSTER_SOFT_EXPIRY_MS, ROSTER_HARD_EXPIRY_MS, OFFLINE_THRESHOLD_MS,
  ACCESS_POLICY_VERSION,
  type RosterEntry, type RosterPayload, type QueuedEvent,
} from '../src/index.js';

const { publicKeyPem, privateKeyPem } = generateRosterKeyPair();

const socio = (memberId: string, over: Partial<RosterEntry> = {}): RosterEntry => ({
  memberId, pinHash: null, rfidCardId: null,
  archived: false, membershipStatus: 'ACTIVE', homeBranchId: 'b1',
  branchAccessScope: 'ALL_BRANCHES', allowedBranchIds: [], accessTimeWindows: null,
  visitBalance: null, visitPackExpired: false, ...over,
});

const padron = (version: string, entries: RosterEntry[] = [socio('m1')]): RosterPayload => ({
  organizationId: 'org1', branchId: 'b1', version,
  issuedAtMs: 1_790_000_000_000, policyVersion: ACCESS_POLICY_VERSION, entries,
});

describe('firma del padrón', () => {
  it('un padrón firmado se verifica', () => {
    const firmado = signRoster(padron('1'), privateKeyPem);
    expect(verifyRoster(firmado, publicKeyPem)).toBe(true);
  });

  /**
   * El gateway está en una red que el gimnasio no controla del todo. Sin
   * firma, quien alcance ese equipo le escribe un padrón propio.
   */
  it('MANIPULAR una entrada invalida la firma', () => {
    const firmado = signRoster(padron('1', [socio('m1', { archived: true })]), privateKeyPem);
    const manipulado = {
      ...firmado,
      payload: { ...firmado.payload, entries: [socio('m1', { archived: false })] },
    };
    expect(verifyRoster(manipulado, publicKeyPem)).toBe(false);
  });

  it('añadir un socio invalida la firma', () => {
    const firmado = signRoster(padron('1'), privateKeyPem);
    const colado = {
      ...firmado,
      payload: { ...firmado.payload, entries: [...firmado.payload.entries, socio('intruso')] },
    };
    expect(verifyRoster(colado, publicKeyPem)).toBe(false);
  });

  it('otra clave no vale', () => {
    const firmado = signRoster(padron('1'), privateKeyPem);
    expect(verifyRoster(firmado, generateRosterKeyPair().publicKeyPem)).toBe(false);
  });

  it('una firma corrupta no revienta, devuelve false', () => {
    const firmado = signRoster(padron('1'), privateKeyPem);
    expect(verifyRoster({ ...firmado, signature: 'no-es-base64-valido!!' }, publicKeyPem)).toBe(false);
  });

  it('la firma es ESTABLE: el mismo padrón firma igual', () => {
    const a = signRoster(padron('7'), privateKeyPem);
    const b = signRoster(padron('7'), privateKeyPem);
    expect(a.signature).toBe(b.signature);
  });

  it('y NO depende del orden de las claves del objeto', () => {
    const base = padron('7');
    const reordenado = {
      entries: base.entries, policyVersion: base.policyVersion, issuedAtMs: base.issuedAtMs,
      version: base.version, branchId: base.branchId, organizationId: base.organizationId,
    } as RosterPayload;
    expect(signRoster(reordenado, privateKeyPem).signature)
      .toBe(signRoster(base, privateKeyPem).signature);
  });
});

describe('versión monótona', () => {
  it('el primer padrón se acepta', () => {
    expect(acceptsRoster(null, '1')).toBe(true);
  });

  it('solo se acepta uno ESTRICTAMENTE más nuevo', () => {
    expect(acceptsRoster('5', '6')).toBe(true);
    expect(acceptsRoster('5', '5')).toBe(false);
    expect(acceptsRoster('5', '4')).toBe(false);
  });

  /**
   * El ataque obvio contra un gateway en red ajena: reproducir un padrón viejo
   * en el que un socio expulsado todavía figuraba.
   */
  it('un padrón ANTIGUO reproducido se rechaza', () => {
    expect(acceptsRoster('100', '42')).toBe(false);
  });

  it('aguanta versiones grandes sin perder precisión', () => {
    expect(acceptsRoster('9007199254740993', '9007199254740994')).toBe(true);
    expect(acceptsRoster('9007199254740994', '9007199254740993')).toBe(false);
  });

  it('una versión ilegible no se acepta', () => {
    expect(acceptsRoster('5', 'no-es-numero')).toBe(false);
  });
});

describe('revocaciones: gana el NO', () => {
  const entradas = [socio('m1'), socio('m2'), socio('m3')];

  it('una revocación archiva al socio aunque el padrón lo dé por activo', () => {
    const r = applyRevocations(entradas, [{ memberId: 'm2', issuedAtMs: 0, reason: 'Baja inmediata' }]);
    expect(r.find((e) => e.memberId === 'm2')!.archived).toBe(true);
    expect(r.find((e) => e.memberId === 'm2')!.membershipStatus).toBeNull();
  });

  it('no toca a los demás', () => {
    const r = applyRevocations(entradas, [{ memberId: 'm2', issuedAtMs: 0, reason: 'x' }]);
    expect(r.filter((e) => !e.archived).map((e) => e.memberId)).toEqual(['m1', 'm3']);
  });

  it('sin revocaciones, el padrón no cambia', () => {
    expect(applyRevocations(entradas, [])).toEqual(entradas);
  });

  it('revocar a alguien que no está no rompe nada', () => {
    expect(applyRevocations(entradas, [{ memberId: 'fantasma', issuedAtMs: 0, reason: 'x' }]))
      .toHaveLength(3);
  });
});

describe('escalera de degradación', () => {
  const h = 3_600_000;

  it('L0: todo normal', () => {
    expect(assessDegradation({ msSinceCloud: 1000, rosterAgeMs: h, cloudLatencyMs: 50 }).level).toBe('L0');
  });

  it('L1: nube lenta, se decide local y se encola el reporte', () => {
    const v = assessDegradation({ msSinceCloud: 1000, rosterAgeMs: h, cloudLatencyMs: 2000 });
    expect(v.level).toBe('L1');
    expect(v.canDecideLocally).toBe(true);
  });

  it('L2: SIN CONEXIÓN con padrón fresco, decisión local completa', () => {
    const v = assessDegradation({
      msSinceCloud: OFFLINE_THRESHOLD_MS + 1, rosterAgeMs: h, cloudLatencyMs: null,
    });
    expect(v.level).toBe('L2');
    expect(v.canDecideLocally).toBe(true);
    expect(v.flagAsException).toBe(false);
  });

  it('L3: padrón vencido — SE ABRE, pero cada decisión queda marcada', () => {
    const v = assessDegradation({
      msSinceCloud: null, rosterAgeMs: ROSTER_SOFT_EXPIRY_MS + 1, cloudLatencyMs: null,
    });
    expect(v.level).toBe('L3');
    expect(v.canDecideLocally).toBe(true);
    expect(v.flagAsException).toBe(true);
  });

  /**
   * El salto que importa. Hasta L3 se abre con datos viejos porque dejar a
   * doscientos socios fuera por una caída de red es peor que dejar entrar a
   * uno dado de baja hace dos días. En L4 ya no hay con qué decidir.
   */
  it('L4: padrón demasiado viejo — modo MANUAL', () => {
    const v = assessDegradation({
      msSinceCloud: null, rosterAgeMs: ROSTER_HARD_EXPIRY_MS + 1, cloudLatencyMs: null,
    });
    expect(v.level).toBe('L4');
    expect(v.canDecideLocally).toBe(false);
  });

  it('L4 también sin padrón alguno', () => {
    expect(assessDegradation({ msSinceCloud: 0, rosterAgeMs: null, cloudLatencyMs: 10 }).level).toBe('L4');
  });

  it('la escalera no salta pasos al envejecer el padrón', () => {
    const niveles = [h, ROSTER_SOFT_EXPIRY_MS + 1, ROSTER_HARD_EXPIRY_MS + 1].map(
      (edad) => assessDegradation({ msSinceCloud: null, rosterAgeMs: edad, cloudLatencyMs: null }).level,
    );
    expect(niveles).toEqual(['L2', 'L3', 'L4']);
  });
});

describe('cola local de eventos', () => {
  const ev = (id: string, atMs: number): QueuedEvent => ({
    eventId: id, atMs, memberId: 'm1', outcome: 'GRANTED', reason: null, degradationLevel: 'L2',
  });

  /**
   * El envío es *at-least-once*: un corte a mitad de subida reenvía lo ya
   * enviado. Si eso duplicara consumos de visitas, sería dinero del socio.
   */
  it('deduplica por identificador generado en el GATEWAY', () => {
    const r = dedupeQueue([ev('a', 1), ev('b', 2), ev('a', 1), ev('a', 9)]);
    expect(r.map((e) => e.eventId)).toEqual(['a', 'b']);
  });

  it('lo pendiente va en orden cronológico', () => {
    const r = pendingSince([ev('c', 300), ev('a', 100), ev('b', 200)], 0);
    expect(r.map((e) => e.eventId)).toEqual(['a', 'b', 'c']);
  });

  it('lo ya sincronizado no se reenvía', () => {
    const r = pendingSince([ev('a', 100), ev('b', 200), ev('c', 300)], 200);
    expect(r.map((e) => e.eventId)).toEqual(['c']);
  });

  it('el desempate es determinista', () => {
    const r = pendingSince([ev('z', 100), ev('a', 100)], 0);
    expect(r.map((e) => e.eventId)).toEqual(['a', 'z']);
  });

  it('una cola vacía no rompe', () => {
    expect(pendingSince([], 0)).toEqual([]);
  });
});
