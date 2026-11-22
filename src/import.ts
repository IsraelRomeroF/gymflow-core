/**
 * IMPORTACIÓN DE SOCIOS (docs/09 §3): limpieza de lo que llega del sistema
 * anterior, sin E/S. Lo que no se puede interpretar se devuelve como `null`
 * con su problema, nunca se adivina: un saldo o una fecha mal leídos son
 * dinero o antigüedad equivocados.
 */
import { normalizeEmail, normalizePhoneMx, normalizeCurp, repairMojibake } from './identity.js';

/** Los campos que entiende el importador. Cada columna del archivo se asigna a uno (o a ninguno). */
export const CAMPOS_IMPORTACION = [
  'fullName', 'firstName', 'lastName', 'phone', 'email', 'birthDate', 'curp',
  'legacyCode', 'branch', 'joinedAt', 'balance', 'periodEnd', 'plan', 'notes',
] as const;
export type CampoImportacion = (typeof CAMPOS_IMPORTACION)[number];

/** Encabezados frecuentes de cada campo, ya normalizados (minúsculas, sin acentos ni signos). */
const SINONIMOS: Record<CampoImportacion, string[]> = {
  fullName: ['nombre completo', 'socio', 'cliente', 'nombre del socio', 'nombre del cliente', 'nombre y apellidos'],
  firstName: ['nombre', 'nombres', 'primer nombre', 'first name'],
  lastName: ['apellidos', 'apellido', 'apellido paterno y materno', 'last name'],
  phone: ['telefono', 'celular', 'tel', 'movil', 'whatsapp', 'telefono celular', 'cel'],
  email: ['correo', 'email', 'e mail', 'correo electronico', 'mail'],
  birthDate: ['fecha de nacimiento', 'nacimiento', 'cumpleanos', 'fecha nacimiento', 'f nacimiento'],
  curp: ['curp'],
  legacyCode: ['codigo', 'clave', 'no socio', 'numero de socio', 'num socio', 'folio', 'id', 'id socio', 'matricula', 'codigo de socio'],
  branch: ['sucursal', 'sede', 'gimnasio', 'club'],
  joinedAt: ['fecha de alta', 'alta', 'fecha de ingreso', 'ingreso', 'socio desde', 'fecha de registro', 'registro', 'inscripcion'],
  balance: ['saldo', 'adeudo', 'debe', 'saldo pendiente', 'deuda'],
  periodEnd: ['vigencia', 'vence', 'vencimiento', 'fecha de vencimiento', 'vigente hasta', 'fin', 'fecha fin', 'pagado hasta'],
  plan: ['plan', 'membresia', 'paquete', 'tipo de membresia'],
  notes: ['notas', 'observaciones', 'comentarios'],
};

const limpiaEncabezado = (h: string) => repairMojibake(h).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Propone a qué campo va cada columna, por su encabezado. Cada campo se usa
 * una vez; si hay "Nombre" y "Apellidos" se usan esos y no "Nombre completo".
 */
export function proponerColumnas(encabezados: readonly string[]): Array<CampoImportacion | null> {
  const usados = new Set<CampoImportacion>();
  const out = encabezados.map((h) => {
    const e = limpiaEncabezado(h);
    for (const campo of CAMPOS_IMPORTACION) {
      if (usados.has(campo)) continue;
      if (SINONIMOS[campo].includes(e)) { usados.add(campo); return campo; }
    }
    return null;
  });
  // Con nombre y apellidos separados, una columna "socio" sobra.
  if (usados.has('firstName') && usados.has('lastName')) return out.map((c) => (c === 'fullName' ? null : c));
  return out;
}

/**
 * Fecha en los formatos que de verdad exportan los sistemas de mostrador:
 * `dd/mm/aaaa`, `dd-mm-aa`, `aaaa-mm-dd` y el número de serie de Excel.
 * Día primero, como se escribe en México. Devuelve `aaaa-mm-dd` o null.
 */
export function leerFecha(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number' || /^\d{5}(\.\d+)?$/.test(String(raw).trim())) {
    const serie = Number(raw);
    // Serie de Excel (1900): 25569 = 1970-01-01. Rango razonable: 1900–2100.
    if (serie < 1 || serie > 73050) return null;
    const d = new Date(Math.round((serie - 25569) * 86_400_000));
    return valida(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const t = String(raw).trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?.*$/, '');
  if (!t) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t);
  if (m) return valida(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(t);
  if (m) {
    let anio = Number(m[3]);
    if (m[3]!.length === 2) anio += anio > 40 ? 1900 : 2000;
    return valida(anio, Number(m[2]), Number(m[1]));
  }
  // "15 de marzo de 2023", "15 mar 2023"
  m = /^(\d{1,2})\s+(?:de\s+)?([a-záéíóú]+)\.?\s+(?:de\s+)?(\d{4})$/i.exec(t);
  if (m) {
    const mes = MESES.findIndex((x) => m![2]!.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').startsWith(x));
    if (mes >= 0) return valida(Number(m[3]), mes + 1, Number(m[1]));
  }
  return null;
}
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function valida(a: number, m: number, d: number): string | null {
  if (a < 1900 || a > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCMonth() !== m - 1) return null; // 31 de febrero
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Importe en pesos a centavos: `$1,234.50`, `1234.5`, `-150`, `(150.00)`.
 * Positivo = el socio DEBE; negativo = saldo a favor. Una coma decimal
 * (`1.234,50`) solo se acepta si es inequívoca.
 */
export function leerImporte(raw: string | number | null | undefined): bigint | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    return BigInt(Math.round(raw * 100));
  }
  let t = raw.trim().replace(/\s|MXN|mxn|\$/g, '');
  if (!t) return null;
  let negativo = false;
  if (/^\(.*\)$/.test(t)) { negativo = true; t = t.slice(1, -1); }
  if (t.startsWith('-')) { negativo = !negativo; t = t.slice(1); }
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(t) || /^\d+,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  const m = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const c = BigInt(m[1]!) * 100n + BigInt((m[2] ?? '').padEnd(2, '0'));
  return negativo ? -c : c;
}

/**
 * "Nombre completo" a nombre y apellidos. Convención mexicana: los DOS
 * últimos tokens son los apellidos cuando hay tres o más; con dos, el
 * último. Partículas ("de la", "del") se pegan al apellido que sigue.
 * No es perfecto, pero la comparación de duplicados usa el conjunto de
 * tokens, así que un corte distinto no rompe el emparejamiento.
 */
export function partirNombre(raw: string): { firstName: string; lastName: string } {
  const tokens = repairMojibake(raw).trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (tokens.length <= 1) return { firstName: tokens[0] ?? '', lastName: '' };
  // Agrupar partículas con la palabra siguiente: "de la Cruz" es un apellido.
  const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'san', 'santa', 'van', 'von']);
  const grupos: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    let g = tokens[i]!;
    while (PARTICULAS.has(g.split(' ').at(-1)!.toLowerCase()) && i + 1 < tokens.length) g += ` ${tokens[++i]}`;
    grupos.push(g);
  }
  if (grupos.length === 2) return { firstName: grupos[0]!, lastName: grupos[1]! };
  return { firstName: grupos.slice(0, -2).join(' '), lastName: grupos.slice(-2).join(' ') };
}

export type FilaCruda = Partial<Record<CampoImportacion, string | number | null>>;

/**
 * Datos que mueven dinero, vigencia o antigüedad (D18-02). Si el archivo trae
 * uno de estos y no se entiende, la fila NO entra sola sin él: espera a que
 * una persona decida si entra sin ese dato, con el valor corregido o se omite.
 * Un teléfono, un correo, una CURP o un nacimiento ilegibles no detienen la
 * fila: quedan como nota.
 */
export const CAMPOS_DUDOSOS = ['balance', 'periodEnd', 'joinedAt'] as const;
export type CampoDudoso = (typeof CAMPOS_DUDOSOS)[number];
/** Un dato dudoso: qué campo, qué decía el archivo y por qué no se tomó. */
export type DatoDudoso = { field: CampoDudoso; value: string; problem: string };

export type FilaLimpia = {
  firstName: string; lastName: string;
  phoneE164: string | null; email: string | null; curp: string | null;
  birthDate: string | null; joinedAt: string | null; periodEnd: string | null;
  legacyCode: string | null; branch: string | null; plan: string | null; notes: string | null;
  /** Positivo = debe; negativo = a favor; null = sin saldo. */
  balanceCents: bigint | null;
  /** Lo que no se pudo leer. Con un problema de los que bloquean, la fila no se importa. */
  problems: string[];
  /** Saldo, vigencia o fecha de alta que venían y no se entendieron: la fila espera una decisión. */
  doubtful: DatoDudoso[];
  /** La fila no se puede importar (sin nombre). */
  invalid: boolean;
};

const texto = (v: string | number | null | undefined): string => (v === null || v === undefined ? '' : repairMojibake(String(v)).trim());
const titulo = (s: string) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());

/**
 * Limpia una fila. `hoy` (aaaa-mm-dd) acota fechas imposibles: nadie nace ni
 * se inscribe en el futuro.
 */
export function limpiarFila(f: FilaCruda, hoy: string): FilaLimpia {
  const problems: string[] = [];
  let firstName = texto(f.firstName);
  let lastName = texto(f.lastName);
  const completo = texto(f.fullName);
  if (!firstName && !lastName && completo) ({ firstName, lastName } = partirNombre(completo));
  else if (!lastName && firstName.includes(' ') && !f.lastName) ({ firstName, lastName } = partirNombre(firstName));
  // Los sistemas viejos exportan TODO EN MAYÚSCULAS: se guarda como se escribe un nombre.
  if (firstName === firstName.toUpperCase()) firstName = titulo(firstName);
  if (lastName === lastName.toUpperCase()) lastName = titulo(lastName);
  const invalid = firstName.length < 2;
  if (invalid) problems.push('Sin nombre');
  else if (!lastName) problems.push('Sin apellidos');

  const telCrudo = texto(f.phone);
  const phoneE164 = normalizePhoneMx(telCrudo);
  if (telCrudo && !phoneE164) problems.push(`Teléfono no válido: ${telCrudo}`);
  const correoCrudo = texto(f.email);
  const email = normalizeEmail(correoCrudo);
  if (correoCrudo && !email) problems.push(`Correo no válido: ${correoCrudo}`);
  const curpCruda = texto(f.curp);
  const curp = normalizeCurp(curpCruda);
  if (curpCruda && !curp) problems.push(`CURP no válida: ${curpCruda}`);

  const doubtful: DatoDudoso[] = [];
  const problema = (field: CampoDudoso | null, value: string, mensaje: string) => {
    problems.push(mensaje);
    if (field) doubtful.push({ field, value, problem: mensaje });
  };
  const fecha = (campo: 'birthDate' | 'joinedAt' | 'periodEnd', nombre: string, pasado: boolean): string | null => {
    const v = f[campo];
    if (v === null || v === undefined || texto(v) === '') return null;
    // El nacimiento no mueve dinero ni vigencia: si no se entiende, solo se anota.
    const dudoso = campo === 'birthDate' ? null : campo;
    const d = leerFecha(v);
    if (!d) { problema(dudoso, texto(v), `${nombre} no se entiende: ${texto(v)}`); return null; }
    if (pasado && d > hoy) { problema(dudoso, texto(v), `${nombre} en el futuro: ${d}`); return null; }
    return d;
  };
  const birthDate = fecha('birthDate', 'Fecha de nacimiento', true);
  const joinedAt = fecha('joinedAt', 'Fecha de alta', true);
  const periodEnd = fecha('periodEnd', 'Vigencia', false);

  let balanceCents: bigint | null = null;
  if (texto(f.balance) !== '') {
    balanceCents = leerImporte(f.balance ?? null);
    if (balanceCents === null) problema('balance', texto(f.balance), `Saldo no se entiende: ${texto(f.balance)}`);
    else if (balanceCents === 0n) balanceCents = null;
  }

  return {
    firstName, lastName, phoneE164, email, curp, birthDate, joinedAt, periodEnd,
    legacyCode: texto(f.legacyCode) || null, branch: texto(f.branch) || null,
    plan: texto(f.plan) || null, notes: texto(f.notes) || null,
    balanceCents, problems, doubtful, invalid,
  };
}

/** De dónde viene una fila: la sucursal del archivo normalizada, o GENERAL si no trae. */
export const FUENTE_GENERAL = 'GENERAL';
export function fuenteDelArchivo(sucursal: string | null | undefined): string {
  const t = (sucursal ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  return t || FUENTE_GENERAL;
}

/**
 * UN SALDO INICIAL POR SOCIO Y POR REGISTRO DEL SISTEMA ANTERIOR (D18-01,
 * docs/09 §5). ¿Las dos filas son el mismo registro de saldo? Lo son si
 * vienen de la misma sucursal del archivo (una fila sin sucursal vale para
 * cualquiera) y sus códigos no se contradicen: si las dos traen código, el
 * mismo; si a una le falta, no se distingue y no se adivina.
 *
 * Así, volver a importar el archivo corregido nunca carga dos veces el mismo
 * saldo, y la misma persona en dos sucursales (o con dos códigos) suma sus
 * saldos, como pide §4.4.
 */
export function mismoRegistroDeSaldo(
  a: { branchLabel: string | null; legacyCode: string | null },
  b: { branchLabel: string | null; legacyCode: string | null },
): boolean {
  const fa = fuenteDelArchivo(a.branchLabel);
  const fb = fuenteDelArchivo(b.branchLabel);
  const misma = fa === fb || fa === FUENTE_GENERAL || fb === FUENTE_GENERAL;
  const ca = a.legacyCode?.trim() || null;
  const cb = b.legacyCode?.trim() || null;
  return misma && (!ca || !cb || ca === cb);
}

/**
 * Corrección de un dato dudoso que escribe una persona (D18-02). Devuelve el
 * valor limpio o el texto del error; `null` = sin ese dato. Las fechas no
 * se adivinan: van como aaaa-mm-dd y la de alta no puede ser futura.
 */
export function corregirDato(field: CampoDudoso, valor: string | null, hoy: string): { ok: true; value: string | bigint | null } | { ok: false; error: string } {
  if (valor === null || valor.trim() === '') return { ok: true, value: null };
  if (field === 'balance') {
    if (!/^-?\d{1,12}$/.test(valor.trim())) return { ok: false, error: 'El saldo va en centavos: positivo si debe, negativo si tiene a favor' };
    const c = BigInt(valor.trim());
    return { ok: true, value: c === 0n ? null : c };
  }
  const d = /^\d{4}-\d{2}-\d{2}$/.test(valor.trim()) ? leerFecha(valor.trim()) : null;
  if (!d) return { ok: false, error: field === 'periodEnd' ? 'La vigencia no es una fecha válida' : 'La fecha de alta no es una fecha válida' };
  if (field === 'joinedAt' && d > hoy) return { ok: false, error: 'La fecha de alta no puede estar en el futuro' };
  return { ok: true, value: d };
}
