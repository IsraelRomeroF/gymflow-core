import { describe, it, expect } from 'vitest';
import {
  CAMPO, CANAL_DE_CONSENTIMIENTO, CANAL_DE_CONTACTO, ESTADO_DE_HABITO, RESULTADO_DE_CONTACTO, FOLLOW_UP_CHANNELS, FOLLOW_UP_OUTCOMES, ESTADO_DE_MEMBRESIA, ESTADO_DE_SOCIO, METODO_DE_PAGO, MODALIDAD_BIOMETRICA, MOTIVO_DE_RECHAZO,
  MOVIMIENTO_DE_CAJA, ORDEN_DE_PUESTOS, ORIGEN_DEL_COBRO, ROLES, TIPO_DE_CONSENTIMIENTO, TIPO_DE_CONSENTIMIENTO_PERSONAL,
  TIPO_DE_CONSENTIMIENTO_SOCIO, TURNO_DE_CAJA, campoDeRuta, etiqueta, mensajeDeCampos, nombreDePuesto,
} from '../src/index.js';
import { ENGAGEMENT_STATES } from '../src/contracts/index.js';

const TODOS = {
  METODO_DE_PAGO, CAMPO, CANAL_DE_CONSENTIMIENTO, MODALIDAD_BIOMETRICA, MOTIVO_DE_RECHAZO, MOVIMIENTO_DE_CAJA, ORIGEN_DEL_COBRO,
  TURNO_DE_CAJA, TIPO_DE_CONSENTIMIENTO_PERSONAL, TIPO_DE_CONSENTIMIENTO_SOCIO,
};

describe('vocabulario: una palabra por código (27-07)', () => {
  it('el mismo pago se llama igual en el panel, el portal y la descarga ARCO', () => {
    // Antes: «Tarjeta (terminal)» en el panel y «Tarjeta en mostrador» en el portal.
    expect(METODO_DE_PAGO.CARD_TERMINAL).toBe('Tarjeta en mostrador');
    expect(METODO_DE_PAGO.CASH).toBe('Efectivo');
    // El pago único con tarjeta no es «domiciliado» (A5-N3) y la nota de crédito es saldo a favor.
    expect(METODO_DE_PAGO.CARD_ON_FILE).toBe('Tarjeta en línea');
    expect(METODO_DE_PAGO.CREDIT_NOTE).toBe('Saldo a favor (nota de crédito)');
    expect(Object.keys(METODO_DE_PAGO).sort()).toEqual(['CARD_ON_FILE', 'CARD_TERMINAL', 'CASH', 'CREDIT_NOTE', 'OXXO_REF', 'SPEI_TRANSFER']);
  });

  it('ninguna palabra está vacía, en inglés de relleno ni con la clave en mayúsculas', () => {
    for (const [nombre, mapa] of Object.entries(TODOS)) {
      for (const [clave, texto] of Object.entries(mapa)) {
        expect(texto.trim(), `${nombre}.${clave}`).not.toBe('');
        expect(texto, `${nombre}.${clave}`).not.toBe(clave);
        // Una clave de la API sin traducir («VISIT_PACK_UNPAID»); «CURP» es una sigla y sí vale.
        expect(/^[A-Z]+_[A-Z_]+$/.test(texto), `${nombre}.${clave}: «${texto}»`).toBe(false);
      }
    }
    for (const mapa of [ESTADO_DE_SOCIO, ESTADO_DE_MEMBRESIA]) {
      for (const [clave, v] of Object.entries(mapa)) {
        expect(v.label.trim(), clave).not.toBe('');
        expect(['ok', 'warn', 'danger', 'info', 'neutral']).toContain(v.tone);
      }
    }
  });

  it('la gracia NO se llama «vencida»: debe, pero sigue entrando (ADR-012)', () => {
    expect(ESTADO_DE_MEMBRESIA.PAST_DUE).toEqual({ label: 'Pago pendiente', tone: 'warn' });
    expect(ESTADO_DE_MEMBRESIA.ACTIVE!.label).toBe('Al corriente');
  });

  it('el paquete sin pagar ya tiene palabra (antes salía la clave en inglés)', () => {
    expect(MOTIVO_DE_RECHAZO.VISIT_PACK_UNPAID).toBe('Paquete sin pagar');
  });

  it('los consentimientos tienen las dos voces y cada mapa de una voz sale de la misma lista', () => {
    expect(TIPO_DE_CONSENTIMIENTO.BIOMETRIC).toEqual({ personal: 'Consentimiento biométrico', socio: 'Huella o rostro para entrar' });
    expect(Object.keys(TIPO_DE_CONSENTIMIENTO_PERSONAL)).toEqual(Object.keys(TIPO_DE_CONSENTIMIENTO));
    expect(TIPO_DE_CONSENTIMIENTO_SOCIO.HEALTH_DATA).toBe('Tus datos de salud');
  });

  it('`etiqueta` nunca deja un hueco: código nuevo → el código; vacío → el respaldo', () => {
    expect(etiqueta(METODO_DE_PAGO, 'SPEI_TRANSFER')).toBe('Transferencia');
    expect(etiqueta(METODO_DE_PAGO, 'CRYPTO')).toBe('CRYPTO');
    expect(etiqueta(METODO_DE_PAGO, null, '—')).toBe('—');
  });
});

describe('vocabulario: campos de un formulario (UXA-12)', () => {
  it('el teléfono se llama «Celular», como en los dos formularios', () => {
    expect(CAMPO.phoneE164).toBe('Celular');
    expect(CAMPO.phone).toBe('Celular');
  });

  it('el campo de un issue: último tramo que no sea índice, sin `body.`', () => {
    expect(campoDeRuta('body.phoneE164')).toBe('phoneE164');
    expect(campoDeRuta('receptionists.1.email')).toBe('email');
    expect(campoDeRuta('$body.items.0')).toBe('items');
    expect(campoDeRuta('')).toBe('');
    expect(campoDeRuta(undefined)).toBe('');
  });

  it('une hasta tres errores con su campo; los desconocidos van solos', () => {
    const issues = [
      { path: 'phoneE164', message: 'Debe tener 10 dígitos' },
      { path: 'joinedAt', message: 'No puede ser futura' },
      { path: 'email', message: 'Correo inválido' },
      { path: 'firstName', message: 'Obligatorio' },
    ];
    // `joinedAt` ya tiene su palabra (bloque 1.2: «Socio desde»); un campo sin palabra va solo.
    expect(mensajeDeCampos(issues)).toBe('Celular: Debe tener 10 dígitos · Socio desde: No puede ser futura · Correo: Correo inválido');
    expect(mensajeDeCampos([{ path: 'rosterVersion', message: 'Falta este dato' }])).toBe('Falta este dato');
    expect(mensajeDeCampos([{ path: 'x' }])).toBe('');
  });
});

describe('vocabulario: puestos (EST-10)', () => {
  it('el nombre sale del catálogo de puestos, el más alto primero', () => {
    expect(nombreDePuesto(['RECEPTION', 'MANAGER'])).toBe('Gerente');
    expect(nombreDePuesto(['OWNER'])).toBe(ROLES.find((r) => r.key === 'OWNER')!.name);
    expect(nombreDePuesto(['COACH'])).toBe('Coach');
    expect(nombreDePuesto([])).toBe('Personal');
    expect(nombreDePuesto(undefined)).toBe('Personal');
  });

  it('el orden cubre todos los puestos del catálogo', () => {
    expect([...ORDEN_DE_PUESTOS].sort()).toEqual(ROLES.map((r) => r.key).sort());
  });
});

describe('vocabulario: retención y seguimiento (1.15)', () => {
  it('cada estado de hábito, canal y resultado tiene su palabra, y ninguna es la clave', () => {
    expect(Object.keys(ESTADO_DE_HABITO).sort()).toEqual([...ENGAGEMENT_STATES].sort());
    expect(Object.keys(CANAL_DE_CONTACTO).sort()).toEqual([...FOLLOW_UP_CHANNELS].sort());
    expect(Object.keys(RESULTADO_DE_CONTACTO).sort()).toEqual([...FOLLOW_UP_OUTCOMES].sort());
    for (const [clave, v] of Object.entries(ESTADO_DE_HABITO)) {
      expect(v.label.trim(), clave).not.toBe('');
      expect(['ok', 'warn', 'danger', 'info', 'neutral']).toContain(v.tone);
    }
    for (const mapa of [CANAL_DE_CONTACTO, RESULTADO_DE_CONTACTO]) {
      for (const [clave, texto] of Object.entries(mapa)) expect(texto, clave).not.toBe(clave);
    }
    // Las mismas palabras que ya usaban Prospectos y Retención: nada cambia en pantalla.
    expect(ESTADO_DE_HABITO.DORMANT).toEqual({ label: 'Dejó de venir', tone: 'danger' });
    expect(RESULTADO_DE_CONTACTO.COMING_BACK).toBe('Va a regresar');
    expect(CANAL_DE_CONTACTO.VISIT).toBe('En persona');
  });
});

describe('vocabulario: estado de cuenta e inventario (1.6)', () => {
  it('cada forma de saldar un cargo tiene su palabra para el personal y para el socio', async () => {
    const { COMO_SE_SALDO, MOVIMIENTO_DE_INVENTARIO, ESTADO_DE_INTERESADO } = await import('../src/vocabulario.js');
    const { SETTLED_BY, INVENTORY_MOVEMENT_TYPES, PROSPECT_STATUSES } = await import('../src/contracts/index.js');
    for (const s of SETTLED_BY) { expect(COMO_SE_SALDO[s]?.personal, s).toBeTruthy(); expect(COMO_SE_SALDO[s]?.socio, s).toBeTruthy(); }
    // 3-06: una cuota perdonada no se le dice «Pagado» a nadie.
    expect(COMO_SE_SALDO.WAIVER!.personal).toBe('Condonado');
    expect(COMO_SE_SALDO.WAIVER!.socio).not.toMatch(/^Pagado/);
    for (const t of INVENTORY_MOVEMENT_TYPES) expect(MOVIMIENTO_DE_INVENTARIO[t], t).toBeTruthy();
    for (const e of PROSPECT_STATUSES) expect(ESTADO_DE_INTERESADO[e], e).toBeTruthy();
  });
});
