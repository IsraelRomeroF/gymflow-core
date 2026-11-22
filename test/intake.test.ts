import { describe, it, expect } from 'vitest';
import {
  isUsableAsEvidence, consentGaps, validateIntake, reviewIntake, draftToCandidate,
  pendingFieldCount, yearsBetween,
  SIGNUP_REQUIRED_CONSENTS, SIGNUP_OPTIONAL_CONSENTS,
  type ConsentDocument, type IntakeDraft, type IdentityCandidate,
} from '../src/index.js';

const HOY = new Date('2026-09-24T00:00:00.000Z');

function doc(over: Partial<ConsentDocument> = {}): ConsentDocument {
  return {
    consentType: 'PRIVACY_NOTICE',
    version: '1.0.0',
    status: 'PUBLISHED',
    bodyText: 'Texto del aviso de privacidad.',
    required: true,
    ...over,
  };
}

const VIGENTES: ConsentDocument[] = [
  doc(),
  doc({ consentType: 'HOUSE_RULES', version: '2.1.0' }),
];

function borrador(over: Partial<IntakeDraft> = {}): IntakeDraft {
  return {
    firstName: 'María',
    lastName: 'Hernández',
    phone: '5512345678',
    email: 'maria@example.com',
    birthDate: new Date('1995-04-12T00:00:00.000Z'),
    emergencyContactName: 'Luis Hernández',
    emergencyContactPhone: '5598765432',
    memberSince: new Date('2023-01-15T00:00:00.000Z'),
    healthNotes: null,
    ...over,
  };
}

describe('documentos de consentimiento', () => {
  it('solo un documento publicado sirve de evidencia', () => {
    expect(isUsableAsEvidence(doc({ status: 'PUBLISHED' }))).toBe(true);
    expect(isUsableAsEvidence(doc({ status: 'DRAFT' }))).toBe(false);
    expect(isUsableAsEvidence(doc({ status: 'RETIRED' }))).toBe(false);
  });

  it('un documento publicado pero vacío tampoco sirve', () => {
    expect(isUsableAsEvidence(doc({ bodyText: '   ' }))).toBe(false);
  });

  it('NO exige biometría ni domiciliación en el alta', () => {
    // ADR-025 y P5: los dos se piden en su propio momento, con su propio
    // consentimiento. Enterrarlos en el alta es lo que invalida la evidencia.
    expect(SIGNUP_REQUIRED_CONSENTS).not.toContain('BIOMETRIC');
    expect(SIGNUP_REQUIRED_CONSENTS).not.toContain('RECURRING_CHARGE');
    expect(SIGNUP_OPTIONAL_CONSENTS).not.toContain('BIOMETRIC');
  });
});

describe('huecos de consentimiento', () => {
  const aceptaTodo = [
    { consentType: 'PRIVACY_NOTICE' as const, version: '1.0.0', granted: true },
    { consentType: 'HOUSE_RULES' as const, version: '2.1.0', granted: true },
  ];

  it('no hay huecos cuando se acepta la versión vigente de lo obligatorio', () => {
    expect(consentGaps(VIGENTES, aceptaTodo)).toEqual([]);
  });

  it('detecta el que falta', () => {
    expect(consentGaps(VIGENTES, [aceptaTodo[0]!]))
      .toEqual([{ kind: 'MISSING', consentType: 'HOUSE_RULES' }]);
  });

  it('distingue "no contestó" de "dijo que no"', () => {
    const rechaza = [aceptaTodo[0]!, { ...aceptaTodo[1]!, granted: false }];
    expect(consentGaps(VIGENTES, rechaza))
      .toEqual([{ kind: 'REFUSED', consentType: 'HOUSE_RULES' }]);
  });

  it('un BORRADOR bloquea el alta aunque el socio lo haya aceptado', () => {
    // Es el caso que importa hoy: P5 no ha llegado, los textos son borradores,
    // y recoger firmas sobre ellos produce evidencia inservible.
    const conBorrador = [doc({ status: 'DRAFT' }), VIGENTES[1]!];
    expect(consentGaps(conBorrador, aceptaTodo))
      .toEqual([{ kind: 'NOT_PUBLISHED', consentType: 'PRIVACY_NOTICE', version: '1.0.0' }]);
  });

  it('detecta que firmó una versión anterior', () => {
    const viejo = [{ ...aceptaTodo[0]!, version: '0.9.0' }, aceptaTodo[1]!];
    expect(consentGaps(VIGENTES, viejo)).toEqual([
      { kind: 'STALE_VERSION', consentType: 'PRIVACY_NOTICE', accepted: '0.9.0', current: '1.0.0' },
    ]);
  });

  it('devuelve TODOS los huecos, no solo el primero', () => {
    expect(consentGaps(VIGENTES, [])).toHaveLength(SIGNUP_REQUIRED_CONSENTS.length);
  });

  it('ignora los documentos retirados al buscar el vigente', () => {
    const conRetirado = [doc({ status: 'RETIRED', version: '0.1.0' }), ...VIGENTES];
    expect(consentGaps(conRetirado, aceptaTodo)).toEqual([]);
  });
});

describe('validación del borrador', () => {
  it('acepta un borrador completo', () => {
    expect(validateIntake(borrador(), HOY)).toEqual([]);
  });

  it('exige nombre y apellido', () => {
    const e = validateIntake(borrador({ firstName: 'A', lastName: '' }), HOY);
    expect(e.map((x) => x.field)).toEqual(['firstName', 'lastName']);
  });

  it('exige AL MENOS un medio de contacto, no los dos', () => {
    expect(validateIntake(borrador({ email: null }), HOY)).toEqual([]);
    expect(validateIntake(borrador({ phone: null }), HOY)).toEqual([]);
    const sin = validateIntake(borrador({ phone: null, email: null }), HOY);
    expect(sin.map((x) => x.field)).toContain('phone');
  });

  it('acepta un apellido compuesto o con guion sin quejarse', () => {
    expect(validateIntake(borrador({ lastName: 'Pérez-Gómez de la Torre' }), HOY)).toEqual([]);
  });

  it('rechaza un teléfono que no es teléfono', () => {
    const e = validateIntake(borrador({ phone: '123' }), HOY);
    expect(e.map((x) => x.field)).toContain('phone');
  });

  it('rechaza una antigüedad en el futuro', () => {
    const e = validateIntake(borrador({ memberSince: new Date('2027-01-01T00:00:00.000Z') }), HOY);
    expect(e.map((x) => x.field)).toContain('memberSince');
  });

  it('acepta que no sepa desde cuándo viene', () => {
    expect(validateIntake(borrador({ memberSince: null }), HOY)).toEqual([]);
  });

  it('rechaza un menor de la edad mínima', () => {
    const e = validateIntake(borrador({ birthDate: new Date('2015-01-01T00:00:00.000Z') }), HOY);
    expect(e.map((x) => x.field)).toContain('birthDate');
  });

  it('cuenta bien los años justo antes y justo después del cumpleaños', () => {
    expect(yearsBetween(new Date('2011-09-25T00:00:00.000Z'), HOY)).toBe(14);
    expect(yearsBetween(new Date('2011-09-24T00:00:00.000Z'), HOY)).toBe(15);
  });
});

describe('revisión del borrador contra el padrón', () => {
  const existentes: IdentityCandidate[] = [
    { id: 'socio-1', firstName: 'María', lastName: 'Hernández', phoneE164: '+525512345678', email: null, curp: null, birthDate: null },
    { id: 'socio-2', firstName: 'Jorge', lastName: 'Ramírez', phoneE164: '+525500000000', email: null, curp: null, birthDate: null },
  ];

  it('sin padrón, todo borrador es socio nuevo', () => {
    expect(reviewIntake(borrador(), []).outcome).toBe('NEW_MEMBER');
  });

  it('el mismo teléfono apunta al socio que ya existe', () => {
    const r = reviewIntake(borrador(), existentes);
    expect(r.outcome).toBe('AUTO_LINK');
    expect(r.matches[0]!.candidateId).toBe('socio-1');
  });

  it('un parecido sin señal fuerte va a revisión humana, no a fusión', () => {
    // Recapturar 1,500 socios a mano garantiza homónimos. Fusionarlos solo
    // porque se llaman parecido junta dos historiales de cobro distintos.
    const r = reviewIntake(borrador({ phone: null, email: null, firstName: 'Maria' }), existentes);
    expect(r.outcome).toBe('NEEDS_REVIEW');
  });

  it('nadie parecido: socio nuevo', () => {
    const r = reviewIntake(borrador({ firstName: 'Ximena', lastName: 'Villaseñor', phone: '5544332211', email: null }), existentes);
    expect(r.outcome).toBe('NEW_MEMBER');
  });

  it('el candidato derivado normaliza teléfono y correo', () => {
    const c = draftToCandidate(borrador({ phone: '55 1234 5678', email: '  MARIA@Example.COM ' }));
    expect(c.phoneE164).toBe('+525512345678');
    expect(c.email).toBe('maria@example.com');
    expect(c.birthDate).toBe('1995-04-12');
  });
});

describe('trabajo que le queda a recepción', () => {
  it('un borrador completo no deja nada por capturar', () => {
    expect(pendingFieldCount(borrador())).toBe(0);
  });

  it('cuenta lo que el socio dejó en blanco', () => {
    expect(pendingFieldCount(borrador({ birthDate: null, memberSince: null }))).toBe(2);
  });
});
