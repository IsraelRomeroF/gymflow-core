import { describe, it, expect } from 'vitest';
import { ACTIONS_REQUIRING_REASON, AUDIT_LABELS } from '../src/index.js';

describe('acciones que exigen motivo (20-08)', () => {
  it('toda clave de la lista es una acción que el servidor asienta de verdad', () => {
    // Antes: `discount.apply`, `payment.reverse`, `charge.void`… no existían y la red no atrapaba nada.
    const inventadas = [...ACTIONS_REQUIRING_REASON].filter((a) => !(a in AUDIT_LABELS));
    expect(inventadas).toEqual([]);
  });

  it('el dinero que se descuenta, se condona, se anula, se revierte o se devuelve está', () => {
    for (const a of ['billing.discount.apply', 'billing.waiver.apply', 'billing.charge.void', 'payments.reverse', 'payment.refund', 'cash.withdraw', 'pos.sale.void']) {
      expect(ACTIONS_REQUIRING_REASON.has(a), a).toBe(true);
    }
  });

  it('lo rutinario no pide motivo: cobrar, abrir y cerrar turno, vender', () => {
    for (const a of ['payments.record', 'cash.session.open', 'cash.session.close', 'membership.sale', 'pos.sale.create', 'member.create']) {
      expect(ACTIONS_REQUIRING_REASON.has(a), a).toBe(false);
    }
  });
});
