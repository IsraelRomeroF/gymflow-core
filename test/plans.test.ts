import { describe, it, expect } from 'vitest';
import { planIssues, type PlanDraft } from '../src/index.js';

const mensual: PlanDraft = {
  code: 'MEN', name: 'Mensualidad', billingModel: 'RECURRING',
  durationUnit: 'MONTH', durationValue: 1,
  priceCents: 65_000n, signupFeeCents: 30_000n, taxRateBps: null,
  visitsIncluded: null, visitValidityDays: null,
  defaultGraceDays: 5, allowFreeze: true, maxFreezeDaysPerYear: 30, minFreezeDays: 7,
};

const campos = (p: PlanDraft) => planIssues(p).map((i) => i.field);

describe('coherencia de un plan', () => {
  it('un plan mensual normal no tiene problemas', () => {
    expect(planIssues(mensual)).toEqual([]);
  });

  it('un paquete de visitas se mide en visitas y dice cuántas', () => {
    const p = { ...mensual, billingModel: 'VISIT_PACK' as const };
    expect(campos(p)).toEqual(expect.arrayContaining(['durationUnit', 'visitsIncluded']));
    expect(planIssues({ ...p, durationUnit: 'VISIT', durationValue: 10, visitsIncluded: 10, visitValidityDays: 90 })).toEqual([]);
  });

  it('solo los paquetes se miden en visitas', () => {
    expect(campos({ ...mensual, durationUnit: 'VISIT' })).toContain('durationUnit');
  });

  it('una visita suelta dura días', () => {
    expect(campos({ ...mensual, billingModel: 'DAY_PASS', durationUnit: 'MONTH' })).toContain('durationUnit');
    expect(planIssues({ ...mensual, billingModel: 'DAY_PASS', durationUnit: 'DAY', signupFeeCents: 0n })).toEqual([]);
  });

  it('dinero negativo, duración cero y tasas imposibles se rechazan', () => {
    expect(campos({ ...mensual, priceCents: -1n, durationValue: 0, taxRateBps: 12_000 }))
      .toEqual(expect.arrayContaining(['priceCents', 'durationValue', 'taxRateBps']));
  });

  it('el congelamiento anual no puede ser menor que el mínimo por solicitud', () => {
    expect(campos({ ...mensual, maxFreezeDaysPerYear: 3, minFreezeDays: 7 })).toContain('maxFreezeDaysPerYear');
    // Si no se permite congelar, esos números no importan.
    expect(planIssues({ ...mensual, allowFreeze: false, maxFreezeDaysPerYear: 3, minFreezeDays: 7 })).toEqual([]);
  });

  it('el código es corto, en mayúsculas y sin espacios', () => {
    for (const malo of ['m', 'men sual', 'men', 'MENSUALIDAD-DEMASIADO-LARGA']) {
      expect(campos({ ...mensual, code: malo }), malo).toContain('code');
    }
  });

  it('devuelve TODOS los problemas, no el primero', () => {
    expect(planIssues({ ...mensual, name: 'x', priceCents: -1n, defaultGraceDays: 90 }).length).toBe(3);
  });
});
