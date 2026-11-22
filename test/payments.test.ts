import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  attemptIdempotencyKey, refundIdempotencyKey,
  classifyDecline, isAutoRetriable, HARD_DECLINE_CODES,
  mandateGaps, mandateAllowsOffSession,
  luhnValid, looksLikePan, containsPanLike, findPanLike, redactPanLike, isValidLast4,
  cardExpired, cardExpiringSoon,
  webhookVerdict, canApplyEvent, isTerminalPayment,
  statusFromProvider, unknownNeedsEscalation,
  maxRefundableCents, refundDenial, chargebackWindowEnd,
  blocksNewAttempts,
  type Mandate, type PaymentStatus,
} from '../src/index.js';

const AHORA = new Date('2026-09-24T18:00:00.000Z');

function mandato(over: Partial<Mandate> = {}): Mandate {
  return {
    consentType: 'RECURRING_CHARGE',
    documentVersion: '1.0.0',
    granted: true,
    grantedAt: new Date('2026-01-10T12:00:00.000Z'),
    revokedAt: null,
    ip: '189.203.10.4',
    userAgent: 'Mozilla/5.0 (iPhone)',
    ...over,
  };
}

describe('idempotencia', () => {
  it('la clave es DERIVADA: el mismo intento la reconstruye igual', () => {
    // Es lo que permite reintentar tras un proceso muerto sin cobrar dos
    // veces: una clave aleatoria en memoria se pierde justo cuando hace falta.
    expect(attemptIdempotencyKey('cargo-1', 1)).toBe(attemptIdempotencyKey('cargo-1', 1));
  });

  it('cada intento tiene la suya', () => {
    expect(attemptIdempotencyKey('cargo-1', 1)).not.toBe(attemptIdempotencyKey('cargo-1', 2));
  });

  it('dos cargos distintos nunca comparten clave', () => {
    expect(attemptIdempotencyKey('cargo-1', 1)).not.toBe(attemptIdempotencyKey('cargo-2', 1));
  });

  it('el número de intento empieza en 1', () => {
    expect(() => attemptIdempotencyKey('cargo-1', 0)).toThrow(RangeError);
  });

  it('el reembolso tiene su propio espacio de claves', () => {
    expect(refundIdempotencyKey('pago-1', 1)).not.toBe(attemptIdempotencyKey('pago-1', 1));
  });
});

describe('clasificación de rechazos', () => {
  it('sin saldo es blando: mañana puede haberlo', () => {
    expect(classifyDecline('insufficient_funds')).toBe('SOFT');
    expect(isAutoRetriable('SOFT')).toBe(true);
  });

  it('tarjeta robada es duro y NO se reintenta', () => {
    expect(classifyDecline('stolen_card')).toBe('HARD');
    expect(isAutoRetriable('HARD')).toBe(false);
  });

  it('un código DESCONOCIDO no se reintenta', () => {
    // Asimetría deliberada: equivocarse hacia "no reintentar" cuesta una
    // llamada; hacia "reintentar", cargos repetidos a una tarjeta negada.
    expect(classifyDecline('codigo_que_no_existe')).toBe('UNCLASSIFIED');
    expect(isAutoRetriable('UNCLASSIFIED')).toBe(false);
  });

  it('sin código tampoco se reintenta', () => {
    expect(isAutoRetriable(classifyDecline(null))).toBe(false);
  });

  it('3DS pendiente no es rechazo: es recuperable con el socio presente', () => {
    expect(classifyDecline('authentication_required')).toBe('AUTH_REQUIRED');
    expect(isAutoRetriable('AUTH_REQUIRED')).toBe(false);
  });

  it('ignora mayúsculas y espacios del proveedor', () => {
    expect(classifyDecline('  Stolen_Card ')).toBe('HARD');
  });

  it('ningún código duro se cuela como reintentable', () => {
    for (const code of HARD_DECLINE_CODES) {
      expect(isAutoRetriable(classifyDecline(code)), code).toBe(false);
    }
  });
});

describe('mandato de domiciliación', () => {
  it('un mandato completo permite cobrar sin el socio delante', () => {
    expect(mandateAllowsOffSession(mandato(), '1.0.0')).toBe(true);
  });

  it('sin mandato no se cobra', () => {
    expect(mandateGaps(null, '1.0.0')).toEqual(['MISSING']);
    expect(mandateAllowsOffSession(null, '1.0.0')).toBe(false);
  });

  it('revocado no se cobra', () => {
    const m = mandato({ revokedAt: new Date('2026-06-01T00:00:00.000Z') });
    expect(mandateGaps(m, '1.0.0')).toContain('REVOKED');
    expect(mandateAllowsOffSession(m, '1.0.0')).toBe(false);
  });

  it('un consentimiento de otro tipo NO sirve de mandato', () => {
    // Aceptar el aviso de privacidad no autoriza a cobrar. Enterrar el
    // mandato en otro consentimiento es lo que invalida la evidencia.
    const m = mandato({ consentType: 'PRIVACY_NOTICE' });
    expect(mandateGaps(m, '1.0.0')).toContain('WRONG_TYPE');
  });

  it('sin IP ni dispositivo el mandato no es prueba', () => {
    const m = mandato({ ip: null });
    expect(mandateGaps(m, '1.0.0')).toContain('NO_EVIDENCE');
    expect(mandateAllowsOffSession(m, '1.0.0')).toBe(false);
  });

  it('una versión nueva del texto NO corta el cobro, solo se marca', () => {
    // Dejar de cobrar a todo el padrón porque el abogado corrigió una coma
    // sería peor que el problema.
    const m = mandato({ documentVersion: '0.9.0' });
    expect(mandateGaps(m, '1.0.0')).toEqual(['STALE_VERSION']);
    expect(mandateAllowsOffSession(m, '1.0.0')).toBe(true);
  });
});

describe('el PAN no entra', () => {
  // Números de prueba públicos de los procesadores. NO son tarjetas reales.
  const PRUEBA = ['4242424242424242', '5555555555554444', '378282246310005', '6011111111111117'];

  it('reconoce los números de prueba de los procesadores', () => {
    for (const pan of PRUEBA) expect(looksLikePan(pan), pan).toBe(true);
  });

  it('los reconoce aunque vengan con espacios o guiones', () => {
    expect(looksLikePan('4242 4242 4242 4242')).toBe(true);
    expect(looksLikePan('4242-4242-4242-4242')).toBe(true);
  });

  it('lo atrapa con CUALQUIER separador, no solo espacio y guion', () => {
    // La primera versión solo admitía espacio y guion, y quien pega de un
    // correo trae el separador que trae. Fue un agujero real.
    for (const v of ['4111.1111.1111.1111', '4111/1111/1111/1111', '4111_1111_1111_1111']) {
      expect(containsPanLike(v), v).toBe(true);
    }
  });

  it('lo atrapa aunque venga PEGADO a otros dígitos', () => {
    // El regex voraz se comía los 18 dígitos, Luhn fallaba sobre el conjunto,
    // y `matchAll` reanudaba DESPUÉS: el PAN de dentro no se miraba nunca.
    expect(containsPanLike('ref 994111111111111111')).toBe(true);
    expect(containsPanLike('1234111111111111111')).toBe(true);
  });

  it('una marca de tiempo de 13 dígitos NO es una tarjeta', () => {
    // Lo destapó la CI. `Date.now()` tiene exactamente 13 dígitos y uno de
    // cada diez cuadra con Luhn por azar: con el mínimo en 13, el control
    // habría rechazado a diario datos normales.
    const base = Date.now();
    for (let i = 0; i < 5000; i++) {
      expect(containsPanLike(`ref ${base + i}`), String(base + i)).toBe(false);
    }
  });

  it('un UUID NO es una tarjeta, por muchos que se prueben', () => {
    // Lo encontró la CI: un `cashSessionId` fue rechazado como si fuera un
    // PAN. El UUID lleva guiones, los guiones son separadores válidos en una
    // tarjeta, y al compactarlo quedaban 32 dígitos con una subcadena de 16
    // que cuadraba con Luhn por azar. El API está lleno de UUIDs: el control
    // habría rechazado peticiones legítimas a diario.
    for (let i = 0; i < 2000; i++) {
      const uuid = randomUUID();
      expect(containsPanLike(uuid), uuid).toBe(false);
    }
  });

  it('falso positivo CONOCIDO y acotado: racha larga de dígitos PUROS', () => {
    // Una referencia de 22 dígitos seguidos puede contener por azar 16 que
    // cuadren con Luhn. Se asume: dejar pasar un PAN cuesta el alcance PCI
    // del comercio; rechazar una referencia cuesta una llamada.
    expect(containsPanLike('SPEI ref 2026092400123456789012')).toBe(true);

    // Con separadores NO se recorre por ventanas, y por eso no hay falso
    // positivo: juntar grupos que nunca fueron un número solo —una fecha, un
    // identificador, una referencia— lo hacía casi seguro.
    expect(containsPanLike('SPEI ref 2026 0924 0012 3456 7890 12')).toBe(false);
    expect(containsPanLike('CLABE 0021 8045 0012 3456 78')).toBe(false);
  });

  it('NO confunde un teléfono, un folio ni un UUID', () => {
    // Un control del borde que se dispara con datos legítimos acaba
    // desactivado por alguien harto, que es la peor forma de perderlo.
    expect(looksLikePan('5512345678')).toBe(false);
    expect(containsPanLike('IMSS 12345678901 · NSS 98765432109')).toBe(false);
    expect(containsPanLike('RFC ROJI900101ABC y CURP ROJI900101HDFMRS09')).toBe(false);
    expect(containsPanLike('Monto 1,234,567.89 en el corte del 24/09/2026')).toBe(false);
    expect(looksLikePan('01a0d4d8-71c7-72c6-b069-12a8880a9ca5')).toBe(false);
    expect(looksLikePan('CEN-000123')).toBe(false);
    expect(looksLikePan('650.00')).toBe(false);
  });

  it('dieciséis dígitos que NO pasan Luhn no son tarjeta', () => {
    expect(luhnValid('4242424242424243')).toBe(false);
    expect(looksLikePan('4242424242424243')).toBe(false);
  });

  it('lo detecta EN MEDIO de un texto, que es donde de verdad aparece', () => {
    // No en un campo `cardNumber` —ese no se manda nunca— sino en las notas
    // del socio, donde alguien pega lo que le dictaron por teléfono.
    expect(containsPanLike('me dictó su tarjeta 4242 4242 4242 4242 por teléfono')).toBe(true);
    expect(containsPanLike('su teléfono es 5512345678 y su código CEN-000123')).toBe(false);
  });

  it('encuentra el PAN escondido en cualquier rincón del cuerpo', () => {
    const body = {
      member: { name: 'Ana', notes: 'me dictó su tarjeta 4242 4242 4242 4242' },
      items: [{ ref: 'ok' }, { ref: '5555555555554444' }],
    };
    const rutas = findPanLike(body);
    expect(rutas).toEqual(['$.member.notes', '$.items[1].ref']);
  });

  it('un cuerpo limpio no produce falsos positivos', () => {
    expect(findPanLike({ amountCents: '65000', phone: '+525512345678', id: 'abc-123' })).toEqual([]);
  });

  it('lo redacta también cuando llega dentro de un texto', () => {
    const texto = redactPanLike('Error al cobrar 4242424242424242 del socio');
    expect(texto).not.toContain('4242424242424242');
    expect(texto).toContain('[PAN redactado]');
  });

  it('la redacción no destroza un texto normal', () => {
    const texto = 'Cargo de 650.00 al socio CEN-000123 el 2026-09-24';
    expect(redactPanLike(texto)).toBe(texto);
  });

  it('los últimos 4 son exactamente cuatro dígitos', () => {
    expect(isValidLast4('4242')).toBe(true);
    expect(isValidLast4('424')).toBe(false);
    expect(isValidLast4('42424')).toBe(false);
    expect(isValidLast4(null)).toBe(false);
  });
});

describe('vigencia de la tarjeta', () => {
  const tarjeta = { brand: 'visa', last4: '4242', expMonth: 9, expYear: 2026 };

  it('el mes de expiración todavía sirve', () => {
    expect(cardExpired(tarjeta, new Date('2026-09-30T23:59:59.000Z'))).toBe(false);
  });

  it('el primer día del mes siguiente ya no', () => {
    expect(cardExpired(tarjeta, new Date('2026-10-01T00:00:01.000Z'))).toBe(true);
  });

  it('avisa antes de que venza, no después', () => {
    expect(cardExpiringSoon(tarjeta, new Date('2026-09-01T00:00:00.000Z'))).toBe(true);
    expect(cardExpiringSoon(tarjeta, new Date('2026-06-01T00:00:00.000Z'))).toBe(false);
    expect(cardExpiringSoon(tarjeta, new Date('2026-11-01T00:00:00.000Z'))).toBe(false);
  });
});

describe('webhooks', () => {
  it('un evento nuevo y firmado se procesa', () => {
    expect(webhookVerdict({ signatureValid: true, alreadySeen: false })).toBe('PROCESS');
  });

  it('un evento repetido es un no-op', () => {
    expect(webhookVerdict({ signatureValid: true, alreadySeen: false })).toBe('PROCESS');
    expect(webhookVerdict({ signatureValid: true, alreadySeen: true })).toBe('DUPLICATE');
  });

  it('la firma se comprueba ANTES de deduplicar', () => {
    // Deduplicar un evento sin firma dejaría que un tercero ocupe el
    // identificador de un evento legítimo que todavía no ha llegado.
    expect(webhookVerdict({ signatureValid: false, alreadySeen: true })).toBe('INVALID_SIGNATURE');
  });

  it('un evento atrasado NO deshace un cobro exitoso', () => {
    // Los webhooks llegan desordenados: es normal, no una avería. Sin esta
    // guarda, el socio pagó, el sistema dice que no, y el torniquete le
    // cierra la puerta.
    expect(canApplyEvent('SUCCEEDED', 'FAILED')).toBe(false);
    expect(canApplyEvent('SUCCEEDED', 'REQUIRES_ACTION')).toBe(false);
  });

  it('pero una reversión SÍ se aplica: es deliberada, no atrasada', () => {
    expect(canApplyEvent('SUCCEEDED', 'REVERSED')).toBe(true);
  });

  it('nada saca a un pago revertido o cancelado', () => {
    for (const incoming of ['SUCCEEDED', 'FAILED', 'PROCESSING'] as PaymentStatus[]) {
      expect(canApplyEvent('REVERSED', incoming), incoming).toBe(false);
      expect(canApplyEvent('CANCELED', incoming), incoming).toBe(false);
    }
  });

  it('el mismo estado dos veces no se reaplica', () => {
    expect(canApplyEvent('PROCESSING', 'PROCESSING')).toBe(false);
  });

  it('desde un estado vivo sí avanza', () => {
    expect(canApplyEvent('PROCESSING', 'SUCCEEDED')).toBe(true);
    expect(canApplyEvent('REQUIRES_ACTION', 'FAILED')).toBe(true);
    expect(isTerminalPayment('PROCESSING')).toBe(false);
    expect(isTerminalPayment('SUCCEEDED')).toBe(true);
  });
});

describe('lo desconocido', () => {
  it('un estado del proveedor que no se reconoce queda en UNKNOWN', () => {
    // No en FAILED: traducir "no sé" a "falló" es exactamente lo que hace
    // que el reintento cobre por segunda vez.
    expect(statusFromProvider('estado_nuevo_del_proveedor')).toBe('UNKNOWN');
    expect(statusFromProvider('')).toBe('UNKNOWN');
  });

  it('traduce los estados conocidos', () => {
    expect(statusFromProvider('succeeded')).toBe('SUCCEEDED');
    expect(statusFromProvider('requires_action')).toBe('REQUIRES_ACTION');
    expect(statusFromProvider('failed')).toBe('FAILED');
    expect(statusFromProvider('canceled')).toBe('CANCELED');
  });

  it('UNKNOWN bloquea reintentos, que es lo que impide el doble cobro', () => {
    expect(blocksNewAttempts('UNKNOWN')).toBe(true);
    expect(blocksNewAttempts('FAILED')).toBe(false);
  });

  it('escala a las 24 horas sin resolver', () => {
    const desde = new Date('2026-09-23T17:00:00.000Z');
    expect(unknownNeedsEscalation(desde, AHORA)).toBe(true);
    expect(unknownNeedsEscalation(new Date('2026-09-24T10:00:00.000Z'), AHORA)).toBe(false);
  });
});

describe('reembolsos', () => {
  const base = {
    paymentStatus: 'SUCCEEDED' as PaymentStatus,
    amountCents: 30_000n,
    paymentAmountCents: 65_000n,
    alreadyRefundedCents: 0n,
    reason: 'Cobro duplicado',
  };

  it('permite un reembolso parcial', () => {
    expect(refundDenial(base)).toBeNull();
  });

  it('no se reembolsa más de lo cobrado, ni sumando parciales', () => {
    expect(refundDenial({ ...base, amountCents: 70_000n })).toBe('EXCEEDS_PAYMENT');
    expect(refundDenial({ ...base, amountCents: 40_000n, alreadyRefundedCents: 30_000n }))
      .toBe('EXCEEDS_PAYMENT');
    expect(maxRefundableCents(65_000n, 30_000n)).toBe(35_000n);
  });

  it('nunca devuelve un reembolsable negativo', () => {
    expect(maxRefundableCents(65_000n, 90_000n)).toBe(0n);
  });

  it('solo se reembolsa lo que se cobró de verdad', () => {
    expect(refundDenial({ ...base, paymentStatus: 'UNKNOWN' })).toBe('NOT_SUCCEEDED');
    expect(refundDenial({ ...base, paymentStatus: 'FAILED' })).toBe('NOT_SUCCEEDED');
  });

  it('exige motivo', () => {
    expect(refundDenial({ ...base, reason: '   ' })).toBe('NO_REASON');
  });

  it('rechaza importes no positivos', () => {
    expect(refundDenial({ ...base, amountCents: 0n })).toBe('AMOUNT_NOT_POSITIVE');
  });
});

describe('ventana de contracargo', () => {
  it('cuenta desde la FECHA DE CORTE, no desde el cargo', () => {
    // Un cargo del día 2 aparece en el corte del 28 y la cuenta empieza ahí.
    // Guardar la evidencia 90 días la borra justo antes de necesitarla.
    const corte = new Date('2026-09-28T00:00:00.000Z');
    expect(chargebackWindowEnd(corte).toISOString().slice(0, 10)).toBe('2027-02-10');
  });
});
