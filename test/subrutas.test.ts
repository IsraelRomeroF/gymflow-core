import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Panel y portal importan el núcleo desde el NAVEGADOR por subrutas
 * (`@gymflow/core/vocabulario`, `/contracts`, …). Si una de esas subrutas
 * arrastra `node:crypto` (ids, bitácora, padrón), Next no compila la
 * pantalla. Esta prueba sigue los imports de cada subruta y exige que ninguno
 * toque `node:` ni otro paquete que no sea `zod`.
 */
const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')) as {
  exports: Record<string, string | { types: string; default: string }>;
  dependencies?: Record<string, string>;
};

function fuenteDe(dist: string): string {
  return join(raiz, dist.replace(/^\.\/dist\//, 'src/').replace(/\.js$/, '.ts'));
}

function importsDe(archivo: string): string[] {
  const texto = readFileSync(archivo, 'utf8');
  return [...texto.matchAll(/^\s*(?:import|export)\s[^;]*?\sfrom\s+'([^']+)'/gm)]
    // `import type` desaparece al compilar: no llega al navegador.
    .filter((m) => !/^\s*(?:import|export)\s+type\s/.test(m[0]))
    .map((m) => m[1]!);
}

/** Todos los módulos que carga una subruta, y los paquetes de fuera que pide. */
function cierre(entrada: string): { archivos: Set<string>; externos: Set<string> } {
  const archivos = new Set<string>();
  const externos = new Set<string>();
  const pendientes = [entrada];
  while (pendientes.length) {
    const a = pendientes.pop()!;
    if (archivos.has(a)) continue;
    archivos.add(a);
    for (const i of importsDe(a)) {
      if (i.startsWith('.')) pendientes.push(resolve(dirname(a), i).replace(/\.js$/, '.ts'));
      else externos.add(i);
    }
  }
  return { archivos, externos };
}

const SUBRUTAS = Object.entries(pkg.exports).filter(([k, v]) => k !== '.' && typeof v === 'object') as Array<[string, { types: string; default: string }]>;

describe('subrutas del núcleo para el navegador', () => {
  it('existen las que importan panel y portal', () => {
    expect(SUBRUTAS.map(([k]) => k)).toEqual(expect.arrayContaining(['./contracts', './vocabulario', './calendario', './motivos', './secciones']));
  });

  for (const [subruta, destino] of SUBRUTAS) {
    it(`${subruta}: existe su fuente y no carga nada de Node`, () => {
      expect(destino.types).toBe(destino.default.replace(/\.js$/, '.d.ts'));
      const fuente = fuenteDe(destino.default);
      expect(existsSync(fuente), fuente).toBe(true);
      const { externos } = cierre(fuente);
      expect([...externos].filter((e) => e !== 'zod'), subruta).toEqual([]);
    });
  }

  it('solo los contratos cargan Zod (el vocabulario y el calendario van sin dependencias)', () => {
    for (const [subruta, destino] of SUBRUTAS) {
      const { externos } = cierre(fuenteDe(destino.default));
      expect(externos.has('zod'), subruta).toBe(subruta === './contracts');
    }
    expect(Object.keys(pkg.dependencies ?? {})).toEqual(['zod']);
  });

  it('la entrada principal sí puede usar Node (la API), pero no exporta los contratos', () => {
    const indice = readFileSync(join(raiz, 'src/index.ts'), 'utf8').replace(/\/\/.*$/gm, '');
    expect(indice).not.toMatch(/from '\.\/contracts/);
  });
});
