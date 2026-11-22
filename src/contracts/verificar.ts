import type { z } from 'zod';

/**
 * ¿LA RESPUESTA REAL DICE LO MISMO QUE EL CONTRATO?
 *
 * `Contrato.parse(respuesta)` solo revisa que lo que el contrato declara esté
 * y tenga su tipo: un campo que la API manda y el contrato NO declara pasa en
 * silencio (Zod lo quita). Eso es justo lo que rompe una pantalla después:
 * la API agregó o renombró un campo y nadie actualizó el contrato.
 *
 * `diferenciasConElContrato` devuelve las dos cosas, con su ruta:
 * - lo que no cumple el contrato (falta, tipo distinto, `null` donde no va);
 * - las claves que la respuesta trae y el contrato no conoce.
 *
 * Para las pruebas de la API (oleada B): al adoptar un contrato como
 * `schema.response`, cada ruta agrega
 * `expect(diferenciasConElContrato(Contrato, respuesta)).toEqual([])`.
 */
export type DiferenciaConElContrato = { readonly ruta: string; readonly problema: string };

type Def = {
  type: string;
  shape?: Record<string, z.ZodType>;
  element?: z.ZodType;
  innerType?: z.ZodType;
  options?: readonly z.ZodType[];
  valueType?: z.ZodType;
  catchall?: z.ZodType;
  in?: z.ZodType;
  getter?: () => z.ZodType;
};

const unir = (ruta: string, parte: string) => (ruta ? `${ruta}.${parte}` : parte);

const defDe = (s: z.ZodType): Def => (s as unknown as { _zod: { def: Def } })._zod.def;

function clavesDeMas(schema: z.ZodType, valor: unknown, ruta: string, out: DiferenciaConElContrato[]): void {
  if (valor === null || valor === undefined) return;
  const def = defDe(schema);
  switch (def.type) {
    case 'optional':
    case 'nullable':
    case 'default':
    case 'readonly':
    case 'nonoptional':
    case 'catch':
      if (def.innerType) clavesDeMas(def.innerType, valor, ruta, out);
      return;
    case 'pipe':
      if (def.in) clavesDeMas(def.in, valor, ruta, out);
      return;
    case 'lazy':
      if (def.getter) clavesDeMas(def.getter(), valor, ruta, out);
      return;
    case 'array':
      if (Array.isArray(valor) && def.element) valor.forEach((v, i) => clavesDeMas(def.element!, v, unir(ruta, String(i)), out));
      return;
    case 'record':
      if (typeof valor === 'object' && def.valueType) {
        for (const [k, v] of Object.entries(valor as Record<string, unknown>)) clavesDeMas(def.valueType, v, unir(ruta, k), out);
      }
      return;
    case 'union': {
      // La primera opción que acepta el valor es la que manda.
      const opcion = (def.options ?? []).find((o) => o.safeParse(valor).success);
      if (opcion) clavesDeMas(opcion, valor, ruta, out);
      return;
    }
    case 'object': {
      if (typeof valor !== 'object' || Array.isArray(valor)) return;
      const shape = def.shape ?? {};
      for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
        const hijo = shape[k];
        if (hijo) clavesDeMas(hijo, v, unir(ruta, k), out);
        else if (!def.catchall) out.push({ ruta: unir(ruta, k), problema: 'la respuesta lo trae y el contrato no lo declara' });
      }
      return;
    }
    default:
      return;
  }
}

export function diferenciasConElContrato(schema: z.ZodType, valor: unknown): DiferenciaConElContrato[] {
  const out: DiferenciaConElContrato[] = [];
  const r = schema.safeParse(valor);
  if (!r.success) {
    for (const i of r.error.issues) out.push({ ruta: i.path.map(String).join('.'), problema: i.message });
  }
  clavesDeMas(schema, valor, '', out);
  return out;
}
