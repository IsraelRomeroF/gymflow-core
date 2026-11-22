import { describe, it, expect } from 'vitest';
import { computeAuditHash, verifyAuditChain, canonicalJson, type AuditContent, type ChainLink } from '../src/index.js';

function content(id: string, action: string, extra: Partial<AuditContent> = {}): AuditContent {
  return {
    id,
    organizationId: 'org-1',
    branchId: null,
    actorUserId: 'user-1',
    actorType: 'USER',
    action,
    resourceType: 'Member',
    resourceId: 'mem-1',
    beforeState: null,
    afterState: { status: 'ACTIVE' },
    reason: null,
    approvedByUserId: null,
    at: '2026-09-22T10:00:00.000Z',
    ...extra,
  };
}

function chain(...items: AuditContent[]): ChainLink[] {
  const links: ChainLink[] = [];
  let prev: string | null = null;
  for (const c of items) {
    const hash = computeAuditHash(prev, c);
    links.push({ prevHash: prev, hash, content: c });
    prev = hash;
  }
  return links;
}

describe('serialización canónica', () => {
  it('es estable ante distinto orden de claves', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });
  it('ordena en profundidad', () => {
    expect(canonicalJson({ x: { z: 1, y: 2 } })).toBe('{"x":{"y":2,"z":1}}');
  });
  it('serializa BigInt como string en vez de explotar', () => {
    expect(canonicalJson({ cents: 1000n })).toBe('{"cents":"1000"}');
  });
});

describe('cadena de hashes', () => {
  it('una cadena íntegra verifica', () => {
    const links = chain(content('a', 'member.create'), content('b', 'member.update'), content('c', 'discount.apply'));
    expect(verifyAuditChain(links)).toEqual({ ok: true, checked: 3, lastHash: links[2]!.hash });
  });

  it('detecta una fila ALTERADA', () => {
    const links = chain(content('a', 'member.create'), content('b', 'discount.apply'));
    // Alguien edita el motivo directamente en la base de datos.
    const tampered: ChainLink[] = [
      links[0]!,
      { ...links[1]!, content: { ...links[1]!.content, reason: 'motivo inventado a posteriori' } },
    ];
    const result = verifyAuditChain(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.brokenAtId).toBe('b');
  });

  it('detecta una fila BORRADA de en medio', () => {
    const links = chain(content('a', 'x'), content('b', 'y'), content('c', 'z'));
    const result = verifyAuditChain([links[0]!, links[2]!]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.brokenAtId).toBe('c');
  });

  it('la cadena vacía es válida', () => {
    expect(verifyAuditChain([])).toEqual({ ok: true, checked: 0, lastHash: null });
  });
});

describe('verificación por tramos', () => {
  it('verificar en dos tramos da lo mismo que de una vez', () => {
    const links = chain(...['a', 'b', 'c', 'd', 'e', 'f'].map((id) => content(id, 'member.update')));
    const entero = verifyAuditChain(links);
    const a = verifyAuditChain(links.slice(0, 4));
    expect(a.ok).toBe(true);
    const b = verifyAuditChain(links.slice(4), a.ok ? a.lastHash : null);
    expect(b).toEqual({ ok: true, checked: 2, lastHash: entero.ok ? entero.lastHash : 'x' });
    // Un tramo que no arranca donde terminó el anterior se detecta.
    expect(verifyAuditChain(links.slice(4)).ok).toBe(false);
  });
});
