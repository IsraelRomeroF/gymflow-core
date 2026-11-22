/**
 * Normalización de identidad y detección de duplicados (docs/09 §4).
 *
 * Consolidar mal produce DOS fallos igual de graves:
 *   · fusionar a dos personas distintas -> una ve los datos de la otra,
 *     que es un incidente de privacidad;
 *   · no fusionar a la misma persona -> paga dos veces o pierde su antigüedad.
 *
 * Por eso el umbral de fusión automática es alto y todo lo dudoso va a
 * revisión humana, que es quien reconoce las caras.
 */

/** Teléfonos comodín que se teclean en el mostrador para salir del paso. */
const JUNK_PHONES = new Set([
  '0000000000', '1111111111', '1234567890', '5555555555',
  '9999999999', '0123456789', '5555555', '0000000',
]);

const JUNK_EMAIL_LOCALS = new Set(['sin', 'sincorreo', 'no', 'notiene', 'na', 'nn', 'xx', 'test', 'prueba']);

/** Detecta mojibake (UTF-8 leído como Latin-1), típico de exportaciones legadas. */
export function looksLikeMojibake(value: string): boolean {
  return /[ÃÂ][\u0080-¿]|Ã­|Ã©|Ã±|Ãº|Ã¡|Ã³/.test(value);
}

export function repairMojibake(value: string): string {
  if (!looksLikeMojibake(value)) return value;
  try {
    const bytes = Uint8Array.from([...value].map((c) => c.charCodeAt(0) & 0xff));
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return value;
  }
}

/** Mayúsculas, sin acentos, sin títulos ni partículas de cortesía. */
export function normalizeName(raw: string): string {
  return repairMojibake(raw)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\b(SR|SRA|SRTA|DR|DRA|LIC|ING|MTRO|MTRA|C|DON|DONA)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Conjunto de tokens ORDENADO: neutraliza los apellidos invertidos. */
export function nameTokens(raw: string): string[] {
  return normalizeName(raw).split(' ').filter((t) => t.length > 1).sort();
}

export function normalizedNameKey(raw: string): string {
  return nameTokens(raw).join(' ');
}

/** Teléfono a E.164 mexicano. Devuelve null si es basura o no es válido. */
export function normalizePhoneMx(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return null;
  if (JUNK_PHONES.has(digits)) return null;
  // Un número con un solo dígito repetido no es un teléfono.
  if (/^(\d)\1+$/.test(digits)) return null;

  let local = digits;
  if (local.startsWith('52') && local.length === 12) local = local.slice(2);
  else if (local.startsWith('521') && local.length === 13) local = local.slice(3);
  else if (local.startsWith('0052')) local = local.slice(4);
  if (local.length !== 10) return null;
  return `+52${local}`;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return null;
  const local = value.split('@')[0]!;
  if (JUNK_EMAIL_LOCALS.has(local)) return null;
  return value;
}

export function normalizeCurp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().toUpperCase().replace(/\s/g, '');
  return /^[A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d$/.test(value) ? value : null;
}

// ── Similitud ───────────────────────────────────────────────────────────────

/** Similitud por trigramas, equivalente a `pg_trgm` para prefiltrar en memoria. */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(normalizedNameKey(a));
  const tb = trigrams(normalizedNameKey(b));
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared);
}

function trigrams(value: string): Set<string> {
  const padded = `  ${value} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
}

// ── Emparejamiento ──────────────────────────────────────────────────────────

export type IdentityCandidate = {
  id: string;
  firstName: string;
  lastName: string;
  phoneE164?: string | null | undefined;
  email?: string | null | undefined;
  curp?: string | null | undefined;
  /** ISO yyyy-mm-dd */
  birthDate?: string | null | undefined;
};

export type MatchMethod = 'CURP' | 'PHONE' | 'EMAIL' | 'FUZZY_NAME' | 'NONE';

export type MatchResult = {
  candidateId: string;
  score: number;
  method: MatchMethod;
  /** `AUTO_MERGE` solo con señal fuerte; todo lo demás lo decide una persona. */
  action: 'AUTO_MERGE' | 'REVIEW' | 'DISTINCT';
  explanation: string;
};

export const AUTO_MERGE_THRESHOLD = 90;
export const REVIEW_THRESHOLD = 55;

/**
 * Compara un registro entrante contra un candidato existente.
 *
 * Regla deliberada: **el teléfono por sí solo NO auto-fusiona.** Madre e hija
 * con el mismo celular es un caso frecuente, y fusionarlas sería un incidente
 * de privacidad. Se exige coincidencia de nombre como señal de apoyo.
 */
export function matchIdentity(incoming: IdentityCandidate, existing: IdentityCandidate): MatchResult {
  const curpA = normalizeCurp(incoming.curp);
  const curpB = normalizeCurp(existing.curp);
  const nameSimilarity = trigramSimilarity(
    `${incoming.firstName} ${incoming.lastName}`,
    `${existing.firstName} ${existing.lastName}`,
  );
  const sameNameKey =
    normalizedNameKey(`${incoming.firstName} ${incoming.lastName}`) ===
    normalizedNameKey(`${existing.firstName} ${existing.lastName}`);

  const base = { candidateId: existing.id };

  if (curpA && curpB && curpA === curpB) {
    return { ...base, score: 100, method: 'CURP', action: 'AUTO_MERGE', explanation: 'CURP idéntica' };
  }

  const phoneA = normalizePhoneMx(incoming.phoneE164);
  const phoneB = normalizePhoneMx(existing.phoneE164);
  if (phoneA && phoneB && phoneA === phoneB) {
    if (sameNameKey) {
      return { ...base, score: 95, method: 'PHONE', action: 'AUTO_MERGE', explanation: 'Teléfono y nombre idénticos' };
    }
    if (nameSimilarity >= 0.6) {
      return { ...base, score: 85, method: 'PHONE', action: 'REVIEW', explanation: 'Mismo teléfono, nombre parecido' };
    }
    // Teléfono familiar compartido: NO se fusiona automáticamente.
    return {
      ...base, score: 70, method: 'PHONE', action: 'REVIEW',
      explanation: 'Mismo teléfono pero nombres distintos (posible teléfono familiar)',
    };
  }

  const emailA = normalizeEmail(incoming.email);
  const emailB = normalizeEmail(existing.email);
  if (emailA && emailB && emailA === emailB) {
    if (sameNameKey) {
      return { ...base, score: 92, method: 'EMAIL', action: 'AUTO_MERGE', explanation: 'Correo y nombre idénticos' };
    }
    return { ...base, score: 70, method: 'EMAIL', action: 'REVIEW', explanation: 'Mismo correo, nombres distintos' };
  }

  if (sameNameKey && incoming.birthDate && existing.birthDate && incoming.birthDate === existing.birthDate) {
    return { ...base, score: 80, method: 'FUZZY_NAME', action: 'REVIEW', explanation: 'Nombre y fecha de nacimiento idénticos' };
  }
  if (sameNameKey) {
    return { ...base, score: 60, method: 'FUZZY_NAME', action: 'REVIEW', explanation: 'Nombre idéntico, sin fecha de nacimiento' };
  }
  if (nameSimilarity >= 0.85) {
    return {
      ...base, score: 55, method: 'FUZZY_NAME', action: 'REVIEW',
      explanation: `Nombre muy similar (${(nameSimilarity * 100).toFixed(0)}%)`,
    };
  }

  return { ...base, score: 0, method: 'NONE', action: 'DISTINCT', explanation: 'Sin coincidencia' };
}

export function rankMatches(incoming: IdentityCandidate, candidates: readonly IdentityCandidate[]): MatchResult[] {
  return candidates
    .filter((c) => c.id !== incoming.id)
    .map((c) => matchIdentity(incoming, c))
    .filter((m) => m.action !== 'DISTINCT')
    .sort((a, b) => b.score - a.score);
}

// ── Código de socio ─────────────────────────────────────────────────────────

/** Código legible por sucursal: el personal no maneja UUIDs (ADR-007). */
/**
 * Prefijo del código de socio: las TRES primeras letras del código de sucursal.
 *
 * Se trunca a tres a propósito —recepción dicta estos códigos por teléfono—
 * pero eso obliga a que el prefijo sea ÚNICO por organización. Dos sedes
 * llamadas "Polanco" y "Polanco Norte" darían ambas `POL`, y como el contador
 * es por sucursal, las dos emitirían `POL-00001`. La base lo impide con un
 * índice único sobre el prefijo; esta función es la definición compartida.
 */
export function memberCodePrefix(branchCode: string): string {
  return branchCode.toUpperCase().slice(0, 3);
}

export function formatMemberCode(branchCode: string, sequence: number): string {
  return `${memberCodePrefix(branchCode)}-${sequence.toString().padStart(5, '0')}`;
}
