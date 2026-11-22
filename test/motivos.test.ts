import { describe, it, expect } from 'vitest';
import {
  ACCIONES_CON_MOTIVO, DISCOUNT_REASONS, MINIMO_DE_TEXTO, MOTIVOS, OTRO, codigoDeTexto, codigosDeMotivo, revisarMotivo, textosDeMotivo,
  type CatalogoDeMotivos,
} from '../src/index.js';

const catalogos = Object.entries(MOTIVOS) as Array<[string, CatalogoDeMotivos]>;

describe('motivos de catálogo (3-07, 4-21, 5-15, 7-10, D-31)', () => {
  it('cada acción tiene una lista corta, sin códigos ni textos repetidos', () => {
    expect(ACCIONES_CON_MOTIVO.length).toBe(catalogos.length);
    for (const [accion, c] of catalogos) {
      const codigos = c.motivos.map((m) => m.codigo);
      const textos = c.motivos.map((m) => m.texto);
      expect(new Set(codigos).size, accion).toBe(codigos.length);
      expect(new Set(textos).size, accion).toBe(textos.length);
      // Al menos un motivo de un toque además de «Otro…».
      expect(c.motivos.length, accion).toBeGreaterThanOrEqual(2);
      // Una lista corta es la que se lee de un vistazo con un socio delante.
      expect(c.motivos.length, accion).toBeLessThanOrEqual(9);
      expect(c.accion.trim(), accion).not.toBe('');
      for (const m of c.motivos) {
        expect(/^[A-Z][A-Z_]*$/.test(m.codigo), `${accion}.${m.codigo}`).toBe(true);
        expect(m.texto.trim(), `${accion}.${m.codigo}`).not.toBe('');
      }
    }
  });

  it('las listas abiertas terminan en «Otro…», que pide escribir', () => {
    for (const [accion, c] of catalogos) {
      if (c.cerrado) {
        expect(c.motivos.some((m) => m.codigo === OTRO), accion).toBe(false);
        continue;
      }
      const ultimo = c.motivos.at(-1)!;
      expect(ultimo.codigo, accion).toBe(OTRO);
      expect(ultimo.pideTexto, accion).toBe(true);
      expect(c.motivos.filter((m) => m.pideTexto).length, accion).toBe(1);
    }
  });

  it('descontar usa EXACTAMENTE los códigos que valida la API (`DISCOUNT_REASONS`)', () => {
    expect(codigosDeMotivo('descuento')).toEqual([...DISCOUNT_REASONS]);
    expect(MOTIVOS.descuento.cerrado).toBe(true);
  });

  it('condonar no reutiliza los motivos de descontar (3-07)', () => {
    const descontar = new Set(codigosDeMotivo('descuento'));
    expect(codigosDeMotivo('condonacion').filter((c) => descontar.has(c) && c !== 'ERROR_DE_CAPTURA')).toEqual([]);
    expect(codigosDeMotivo('condonacion')).toContain('LESION');
  });

  it('cancelar y perder un interesado se pueden contar por precio y por horario', () => {
    for (const accion of ['cancelacion', 'interesadoPerdido'] as const) {
      expect(codigosDeMotivo(accion)).toEqual(expect.arrayContaining(['PRECIO', 'HORARIO', 'OTRO_GIMNASIO', OTRO]));
    }
  });
});

describe('revisar el motivo elegido', () => {
  it('un motivo del catálogo basta solo; la nota va detrás', () => {
    expect(revisarMotivo('cancelacion', { codigo: 'PRECIO' })).toEqual({ ok: true, codigo: 'PRECIO', texto: 'Precio' });
    expect(revisarMotivo('cancelacion', { codigo: 'PRECIO', nota: '  subió   la mensualidad ' }))
      .toEqual({ ok: true, codigo: 'PRECIO', texto: 'Precio · subió la mensualidad' });
  });

  it('«Otro…» exige escribir algo que se pueda leer', () => {
    expect(revisarMotivo('entradaManual', { codigo: OTRO })).toEqual({ ok: false, error: 'Escribe el motivo' });
    expect(revisarMotivo('entradaManual', { codigo: OTRO, nota: 'ok' }).ok).toBe(false);
    // El mismo mínimo que la API (`z.string().min(3)`) y que `CampoMotivo`.
    expect(MINIMO_DE_TEXTO).toBe(3);
    expect(revisarMotivo('entradaManual', { codigo: OTRO, nota: 'x'.repeat(MINIMO_DE_TEXTO) }).ok).toBe(true);
    expect(revisarMotivo('entradaManual', { codigo: OTRO, nota: 'Vino con su hijo menor' }))
      .toEqual({ ok: true, codigo: OTRO, texto: 'Vino con su hijo menor' });
  });

  it('un código de otra acción o inventado no sirve', () => {
    expect(revisarMotivo('descuadre', { codigo: 'PRECIO' })).toEqual({ ok: false, error: 'Elige un motivo de la lista' });
    expect(revisarMotivo('descuento', { codigo: OTRO, nota: 'lo que sea' }).ok).toBe(false);
  });
});

describe('los chips de `CampoMotivo`', () => {
  it('los de la consola de plataforma salen del núcleo, con las palabras que ya usaba (1.5)', () => {
    expect(textosDeMotivo('anularFactura')).toEqual(['Se emitió con un módulo de más', 'Cambió el acuerdo con el dueño', 'Mes sin servicio']);
    expect(textosDeMotivo('suspenderServicio')).toEqual(['Falta de pago', 'Fin del contrato', 'A petición del dueño']);
    expect(textosDeMotivo('reactivarCuenta')).toEqual(['Regresó al gimnasio']);
  });

  it('son los textos del catálogo sin «Otro…» (escribir otra cosa ya es otro motivo)', () => {
    expect(textosDeMotivo('congelamiento')).toEqual(['Viaje', 'Lesión o salud', 'Trabajo']);
    for (const accion of ACCIONES_CON_MOTIVO) {
      expect(textosDeMotivo(accion), accion).not.toContain('Otro…');
      for (const t of textosDeMotivo(accion)) expect(codigoDeTexto(accion, t), `${accion}: ${t}`).not.toBe(OTRO);
    }
  });
});

describe('agrupar lo que ya se guardó como texto', () => {
  it('reconoce el texto del catálogo, con o sin nota, y el código', () => {
    expect(codigoDeTexto('cancelacion', 'Precio')).toBe('PRECIO');
    expect(codigoDeTexto('cancelacion', 'precio · subió la mensualidad')).toBe('PRECIO');
    expect(codigoDeTexto('descuento', 'ESTUDIANTE')).toBe('ESTUDIANTE');
  });

  it('lo demás cuenta como «Otro…»; en una lista cerrada, sin código', () => {
    expect(codigoDeTexto('cancelacion', 'se fue')).toBe(OTRO);
    expect(codigoDeTexto('cancelacion', '')).toBe(OTRO);
    expect(codigoDeTexto('descuento', 'cortesía')).toBe('');
  });

  it('el texto que arma `revisarMotivo` se vuelve a leer con el mismo código', () => {
    for (const accion of ACCIONES_CON_MOTIVO) {
      const c: CatalogoDeMotivos = MOTIVOS[accion];
      for (const m of c.motivos.filter((x) => !x.pideTexto)) {
        const r = revisarMotivo(accion, { codigo: m.codigo, nota: 'con una nota' });
        expect(r.ok && codigoDeTexto(accion, r.texto), `${accion}.${m.codigo}`).toBe(m.codigo);
      }
    }
  });
});
