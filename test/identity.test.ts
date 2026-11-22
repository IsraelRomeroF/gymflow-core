import { describe, it, expect } from 'vitest';
import {
  normalizeName, normalizedNameKey, normalizePhoneMx, normalizeEmail, normalizeCurp,
  trigramSimilarity, matchIdentity, rankMatches, formatMemberCode, memberCodePrefix, repairMojibake,
  type IdentityCandidate,
} from '../src/index.js';

const p = (id: string, firstName: string, lastName: string, extra: Partial<IdentityCandidate> = {}): IdentityCandidate =>
  ({ id, firstName, lastName, ...extra });

describe('normalización de nombre', () => {
  it('quita acentos y pasa a mayúsculas', () => {
    expect(normalizeName('José Martínez')).toBe('JOSE MARTINEZ');
  });
  it('quita títulos de cortesía', () => {
    expect(normalizeName('Sr. Juan Pérez')).toBe('JUAN PEREZ');
    expect(normalizeName('LIC MARIA LOPEZ')).toBe('MARIA LOPEZ');
  });
  it('APELLIDOS INVERTIDOS producen la misma clave', () => {
    expect(normalizedNameKey('Ana Martinez Lopez')).toBe(normalizedNameKey('Ana Lopez Martinez'));
  });
  it('MARTÍNEZ y MARTINEZ son la misma clave', () => {
    expect(normalizedNameKey('Ana Martínez')).toBe(normalizedNameKey('Ana Martinez'));
  });
  it('repara mojibake de exportaciones legadas', () => {
    expect(repairMojibake('MARTÃNEZ')).toContain('MART');
    expect(normalizedNameKey('JosÃ©')).toBe(normalizedNameKey('José'));
  });
});

describe('normalización de teléfono', () => {
  it('acepta los formatos que se teclean en recepción', () => {
    for (const raw of ['5512345678', '55 1234 5678', '+52 55 1234 5678', '525512345678', '5215512345678']) {
      expect(normalizePhoneMx(raw), raw).toBe('+525512345678');
    }
  });
  it('DESCARTA los comodines del mostrador', () => {
    for (const junk of ['5555555555', '0000000000', '1234567890', '1111111111']) {
      expect(normalizePhoneMx(junk), junk).toBeNull();
    }
  });
  it('descarta longitudes imposibles', () => {
    expect(normalizePhoneMx('123')).toBeNull();
    expect(normalizePhoneMx('')).toBeNull();
    expect(normalizePhoneMx(null)).toBeNull();
  });
});

describe('normalización de correo y CURP', () => {
  it('descarta correos inventados en el mostrador', () => {
    expect(normalizeEmail('sin@correo.com')).toBeNull();
    expect(normalizeEmail('notiene@gmail.com')).toBeNull();
    expect(normalizeEmail('ana@gmail.com')).toBe('ana@gmail.com');
    expect(normalizeEmail('  ANA@Gmail.COM ')).toBe('ana@gmail.com');
  });
  it('valida el formato de CURP', () => {
    expect(normalizeCurp('MALA123')).toBeNull();
    expect(normalizeCurp('mala920514mdfrpn08')).toBe('MALA920514MDFRPN08');
  });
});

describe('emparejamiento — trampas conocidas', () => {
  it('CURP idéntica: fusión automática', () => {
    const r = matchIdentity(
      p('a', 'Ana', 'Martinez', { curp: 'MALA920514MDFRPN08' }),
      p('b', 'A.', 'Martinez L', { curp: 'MALA920514MDFRPN08' }),
    );
    expect(r.action).toBe('AUTO_MERGE');
    expect(r.score).toBe(100);
  });

  it('teléfono + mismo nombre: fusión automática', () => {
    const r = matchIdentity(
      p('a', 'Ana', 'Martinez Lopez', { phoneE164: '5512345678' }),
      p('b', 'Ana', 'Lopez Martinez', { phoneE164: '+52 55 1234 5678' }),
    );
    expect(r.action).toBe('AUTO_MERGE');
  });

  it('TELÉFONO FAMILIAR: mismo número, nombres distintos -> REVISIÓN, no fusión', () => {
    const r = matchIdentity(
      p('a', 'Guadalupe', 'Ramirez', { phoneE164: '5512345678' }),
      p('b', 'Sofia', 'Ramirez', { phoneE164: '5512345678' }),
    );
    expect(r.action).toBe('REVIEW');
    expect(r.explanation).toContain('familiar');
  });

  it('teléfono comodín NO empareja a nadie', () => {
    const r = matchIdentity(
      p('a', 'Juan', 'Perez', { phoneE164: '5555555555' }),
      p('b', 'Pedro', 'Gomez', { phoneE164: '5555555555' }),
    );
    expect(r.action).toBe('DISTINCT');
  });

  it('APODOS no se resuelven solos: van a revisión o quedan distintos', () => {
    const r = matchIdentity(p('a', 'Lupita', 'Hernandez'), p('b', 'Guadalupe', 'Hernandez'));
    expect(r.action).not.toBe('AUTO_MERGE');
  });

  it('nombre + fecha de nacimiento idénticos: revisión humana', () => {
    const r = matchIdentity(
      p('a', 'Ana', 'Martinez Lopez', { birthDate: '1992-05-14' }),
      p('b', 'Ana', 'Martinez Lopez', { birthDate: '1992-05-14' }),
    );
    expect(r.action).toBe('REVIEW');
    expect(r.score).toBe(80);
  });

  it('HOMÓNIMOS con fechas distintas siguen yendo a revisión, no se fusionan', () => {
    const r = matchIdentity(
      p('a', 'Juan', 'Perez', { birthDate: '1990-01-01' }),
      p('b', 'Juan', 'Perez', { birthDate: '1975-08-22' }),
    );
    expect(r.action).toBe('REVIEW');
    expect(r.score).toBeLessThan(90);
  });

  it('personas sin nada en común quedan DISTINCT', () => {
    expect(matchIdentity(p('a', 'Ana', 'Martinez'), p('b', 'Carlos', 'Gutierrez')).action).toBe('DISTINCT');
  });

  it('ordena los candidatos por score descendente', () => {
    const incoming = p('x', 'Ana', 'Martinez Lopez', { phoneE164: '5512345678', birthDate: '1992-05-14' });
    const ranked = rankMatches(incoming, [
      p('b', 'Carlos', 'Gutierrez'),
      p('c', 'Ana', 'Martinez Lopez', { birthDate: '1992-05-14' }),
      p('d', 'Ana', 'Lopez Martinez', { phoneE164: '5512345678' }),
    ]);
    expect(ranked[0]!.candidateId).toBe('d');
    expect(ranked.map((r) => r.candidateId)).not.toContain('b');
  });
});

describe('similitud por trigramas', () => {
  it('idénticos dan 1', () => {
    expect(trigramSimilarity('Ana Martinez', 'Ana Martinez')).toBe(1);
  });
  it('un error de captura conserva similitud alta', () => {
    expect(trigramSimilarity('Ana Martinez', 'Ana Martinz')).toBeGreaterThan(0.6);
  });
  it('nombres sin relación dan similitud baja', () => {
    expect(trigramSimilarity('Ana Martinez', 'Carlos Gutierrez')).toBeLessThan(0.2);
  });
});

describe('código de socio', () => {
  it('legible y con relleno estable', () => {
    expect(formatMemberCode('CEN', 42)).toBe('CEN-00042');
    expect(formatMemberCode('norte', 1)).toBe('NOR-00001');
  });
});

describe('prefijo del código de socio', () => {
  it('son las tres primeras letras del código de sucursal, en mayúsculas', () => {
    expect(memberCodePrefix('CEN')).toBe('CEN');
    expect(memberCodePrefix('nor')).toBe('NOR');
    expect(memberCodePrefix('POLANCO')).toBe('POL');
  });

  it('DOS sedes distintas pueden producir el MISMO prefijo: por eso la base lo impide', () => {
    // El caso real: "Polanco" y "Polanco Norte" son códigos distintos y
    // válidos, y aun así colisionan. Sin el índice único, ambas emitirían
    // POL-00001 porque el contador es por sucursal.
    expect(memberCodePrefix('POLANCO')).toBe(memberCodePrefix('POLANCONORTE'));
    expect(formatMemberCode('POLANCO', 1)).toBe(formatMemberCode('POLANCONORTE', 1));
  });

  it('el código completo va con cinco dígitos', () => {
    expect(formatMemberCode('CEN', 1)).toBe('CEN-00001');
    expect(formatMemberCode('CEN', 12345)).toBe('CEN-12345');
  });
});
