import { describe, it, expect } from 'vitest';
import {
  identify, evaluateLiveness, enrollmentGaps, isUsableForAccess,
  templateDeletionDue, enrolledAtBranch,
  DEFAULT_MATCH_SETTINGS, DEFAULT_LIVENESS_SETTINGS, TEMPLATE_RETENTION_DAYS,
  type Enrollment,
} from '../src/index.js';

const AHORA = new Date('2026-09-25T10:00:00.000Z');

function enrolamiento(over: Partial<Enrollment> = {}): Enrollment {
  return {
    memberId: 'socio-1',
    modality: 'FACE',
    branchId: 'sede-centro',
    algorithmVendor: 'insightface/buffalo_sc',
    consentId: 'consentimiento-1',
    enrolledByUserId: 'recepcion-1',
    enrolledAt: new Date('2026-09-01T10:00:00.000Z'),
    revokedAt: null,
    templateDeletedAt: null,
    ...over,
  };
}

describe('identificación 1:N', () => {
  it('un ganador claro se identifica', () => {
    const r = identify([
      { memberId: 'a', score: 0.82 },
      { memberId: 'b', score: 0.41 },
    ]);
    expect(r).toMatchObject({ outcome: 'MATCH', memberId: 'a' });
  });

  it('nadie por encima del umbral es NO_MATCH', () => {
    const r = identify([{ memberId: 'a', score: 0.5 }]);
    expect(r).toEqual({ outcome: 'NO_MATCH', bestScore: 0.5 });
  });

  it('sin candidatos tampoco inventa a nadie', () => {
    expect(identify([])).toEqual({ outcome: 'NO_MATCH', bestScore: 0 });
  });

  /**
   * Es la protección que de verdad importa a escala de gimnasio, y la que
   * casi siempre falta. Tomar el máximo funciona con diez empleados; con
   * 1,850 socios basta con que dos se parezcan más entre sí que al umbral.
   */
  it('si el segundo pisa al primero, el sistema dice que NO SABE', () => {
    const r = identify([
      { memberId: 'a', score: 0.58 },
      { memberId: 'b', score: 0.56 },
    ]);
    expect(r.outcome).toBe('AMBIGUOUS');
    // Y sobre todo: NO devuelve 'a'.
    expect(r).not.toHaveProperty('memberId');
  });

  it('el margen se mide contra el SEGUNDO, no contra el resto', () => {
    const r = identify([
      { memberId: 'a', score: 0.90 },
      { memberId: 'b', score: 0.60 },
      { memberId: 'c', score: 0.59 },
    ]);
    expect(r).toMatchObject({ outcome: 'MATCH', memberId: 'a' });
  });

  it('un único candidato no tiene con quién confundirse', () => {
    const r = identify([{ memberId: 'a', score: 0.56 }]);
    expect(r.outcome).toBe('MATCH');
  });

  it('el orden de llegada no cambia el resultado', () => {
    const candidatos = [
      { memberId: 'b', score: 0.56 },
      { memberId: 'a', score: 0.58 },
    ];
    expect(identify(candidatos).outcome).toBe(identify([...candidatos].reverse()).outcome);
  });

  it('los valores por defecto son MÁS estrictos que los heredados de HRFlow', () => {
    // Allá el umbral es 0.45 y no hay margen: compara contra los empleados de
    // una empresa, no contra 1,850 socios.
    expect(DEFAULT_MATCH_SETTINGS.threshold).toBeGreaterThan(0.45);
    expect(DEFAULT_MATCH_SETTINGS.minMargin).toBeGreaterThan(0);
  });
});

describe('detección de vida', () => {
  it('sin ninguna comprobación, no pasa', () => {
    expect(evaluateLiveness({ mode: 'NONE', passiveScore: null, activePassed: null }))
      .toEqual({ outcome: 'FAIL', reason: 'NO_CHECK' });
  });

  it('el reto activo superado pasa, pero NO frena un video', () => {
    const v = evaluateLiveness({ mode: 'ACTIVE', passiveScore: null, activePassed: true });
    expect(v.outcome).toBe('PASS');
    // El propio motor lo dice: el reto activo frena una foto, no un replay.
    expect(v).toMatchObject({ stopsVideoReplay: false });
  });

  it('el reto activo fallado no pasa', () => {
    expect(evaluateLiveness({ mode: 'ACTIVE', passiveScore: null, activePassed: false }))
      .toEqual({ outcome: 'FAIL', reason: 'ACTIVE_FAILED' });
  });

  it('el modelo pasivo sí frena el video, y por eso se registra', () => {
    const v = evaluateLiveness({ mode: 'PASSIVE', passiveScore: 0.8, activePassed: null });
    expect(v).toEqual({ outcome: 'PASS', stopsVideoReplay: true });
  });

  it('un pasivo por debajo del umbral no pasa', () => {
    expect(evaluateLiveness({ mode: 'PASSIVE', passiveScore: 0.3, activePassed: null }))
      .toEqual({ outcome: 'FAIL', reason: 'PASSIVE_LOW' });
  });

  it('las dos capas juntas: basta con que una falle', () => {
    expect(evaluateLiveness({ mode: 'BOTH', passiveScore: 0.9, activePassed: false }).outcome).toBe('FAIL');
    expect(evaluateLiveness({ mode: 'BOTH', passiveScore: 0.2, activePassed: true }).outcome).toBe('FAIL');
    expect(evaluateLiveness({ mode: 'BOTH', passiveScore: 0.9, activePassed: true }).outcome).toBe('PASS');
  });

  it('se puede apagar para calibrar, y entonces se dice que no protege', () => {
    const v = evaluateLiveness(
      { mode: 'NONE', passiveScore: null, activePassed: null },
      { ...DEFAULT_LIVENESS_SETTINGS, required: false },
    );
    expect(v).toEqual({ outcome: 'PASS', stopsVideoReplay: false });
  });
});

describe('enrolamiento', () => {
  it('uno completo sirve para dar acceso', () => {
    expect(enrollmentGaps(enrolamiento())).toEqual([]);
    expect(isUsableForAccess(enrolamiento())).toBe(true);
  });

  it('SIN consentimiento no sirve para nada', () => {
    // Es el pasivo heredado que ADR-014 llama el riesgo principal, y del que
    // este sistema arranca libre por ser un alta en blanco.
    expect(enrollmentGaps(enrolamiento({ consentId: null }))).toContain('NO_CONSENT');
    expect(isUsableForAccess(enrolamiento({ consentId: null }))).toBe(false);
  });

  it('sin sucursal no se puede ordenar su borrado', () => {
    expect(enrollmentGaps(enrolamiento({ branchId: null }))).toContain('NO_BRANCH');
  });

  it('sin algoritmo no se sabe qué hay que re-enrolar al cambiar de motor', () => {
    expect(enrollmentGaps(enrolamiento({ algorithmVendor: null }))).toContain('NO_ALGORITHM');
  });

  it('revocado deja de servir', () => {
    expect(isUsableForAccess(enrolamiento({ revokedAt: AHORA }))).toBe(false);
  });
});

describe('borrado de la plantilla', () => {
  it('un enrolamiento vivo no se borra', () => {
    expect(templateDeletionDue(enrolamiento(), AHORA)).toBe(false);
  });

  it('revocado hace poco todavía no', () => {
    const e = enrolamiento({ revokedAt: new Date('2026-09-20T10:00:00.000Z') });
    expect(templateDeletionDue(e, AHORA)).toBe(false);
  });

  it('pasado el plazo, SÍ', () => {
    const e = enrolamiento({
      revokedAt: new Date(AHORA.getTime() - TEMPLATE_RETENTION_DAYS * 86_400_000),
    });
    expect(templateDeletionDue(e, AHORA)).toBe(true);
  });

  it('ya borrado no se vuelve a pedir', () => {
    const e = enrolamiento({
      revokedAt: new Date('2026-01-01T00:00:00.000Z'),
      templateDeletedAt: new Date('2026-02-01T00:00:00.000Z'),
    });
    expect(templateDeletionDue(e, AHORA)).toBe(false);
  });
});

describe('el rostro no cruza de sucursal', () => {
  const enrolados = [enrolamiento({ branchId: 'sede-centro' })];

  it('reconoce en la sede donde se enroló', () => {
    expect(enrolledAtBranch(enrolados, 'sede-centro', 'FACE')).toBe(true);
  });

  it('NO reconoce en otra sede: es la consecuencia de ADR-014', () => {
    // Y es justo lo que obliga a que exista la vía alterna de recepción.
    expect(enrolledAtBranch(enrolados, 'sede-norte', 'FACE')).toBe(false);
  });

  it('ni con otra modalidad', () => {
    expect(enrolledAtBranch(enrolados, 'sede-centro', 'FINGERPRINT')).toBe(false);
  });

  it('un enrolamiento sin consentimiento no cuenta como enrolado', () => {
    expect(enrolledAtBranch([enrolamiento({ consentId: null })], 'sede-centro', 'FACE')).toBe(false);
  });
});
