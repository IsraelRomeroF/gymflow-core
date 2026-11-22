/**
 * Dinero en CENTAVOS enteros (ADR-005).
 *
 * `bigint` y no `number`: es imposible degradarlo accidentalmente a punto
 * flotante. Deliberadamente NO existe un `toNumber()` público — quien quiera
 * un número tiene que pedirlo explícitamente por `toCentsUnsafe()`, cuyo
 * nombre avisa de lo que está haciendo.
 */

export type Currency = 'MXN';

export type Money = {
  readonly cents: bigint;
  readonly currency: Currency;
};

export class MoneyError extends Error {}

export function money(cents: bigint | number, currency: Currency = 'MXN'): Money {
  if (typeof cents === 'number') {
    if (!Number.isInteger(cents)) {
      throw new MoneyError(`Los centavos deben ser enteros, se recibió ${cents}`);
    }
    if (!Number.isSafeInteger(cents)) {
      throw new MoneyError('Importe fuera del rango seguro de Number; usa bigint');
    }
    return { cents: BigInt(cents), currency };
  }
  return { cents, currency };
}

export const ZERO: Money = { cents: 0n, currency: 'MXN' };

/** Desde una cantidad en pesos. Solo para entrada de datos y pruebas. */
export function fromMajorUnits(amount: string): Money {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match) throw new MoneyError(`Importe no reconocido: "${amount}"`);
  const [, sign, whole, frac = ''] = match;
  const cents = BigInt(whole!) * 100n + BigInt(frac.padEnd(2, '0'));
  return { cents: sign === '-' ? -cents : cents, currency: 'MXN' };
}

function sameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(`No se pueden operar monedas distintas: ${a.currency} y ${b.currency}`);
  }
}

export function addMoney(a: Money, b: Money): Money {
  sameCurrency(a, b);
  return { cents: a.cents + b.cents, currency: a.currency };
}

export function subMoney(a: Money, b: Money): Money {
  sameCurrency(a, b);
  return { cents: a.cents - b.cents, currency: a.currency };
}

export function sumMoney(items: readonly Money[], currency: Currency = 'MXN'): Money {
  return items.reduce(addMoney, { cents: 0n, currency });
}

/**
 * ÚNICA política de redondeo del sistema: *half-up* al centavo, sobre el
 * valor absoluto (simétrica respecto al cero).
 *
 * Se implementa con aritmética entera. `Math.round` sobre un producto en
 * punto flotante reintroduciría exactamente el error que este módulo existe
 * para evitar.
 */
function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new MoneyError('División entre cero');
  const negative = (numerator < 0n) !== (denominator < 0n);
  const absN = numerator < 0n ? -numerator : numerator;
  const absD = denominator < 0n ? -denominator : denominator;
  const quotient = absN / absD;
  const remainder = absN % absD;
  const rounded = remainder * 2n >= absD ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/** Multiplica por una tasa expresada en *basis points* (10000 = 100%). */
export function multiplyByBps(m: Money, bps: number): Money {
  if (!Number.isInteger(bps)) throw new MoneyError('Los basis points deben ser enteros');
  return { cents: divideRoundHalfUp(m.cents * BigInt(bps), 10_000n), currency: m.currency };
}

/** Aplica un porcentaje (p. ej. 10 = 10%). Atajo sobre `multiplyByBps`. */
export function percentOf(m: Money, percent: number): Money {
  return multiplyByBps(m, Math.round(percent * 100));
}

/** Prorrateo por días: `m * diasUsados / diasTotales`. */
export function prorate(m: Money, usedUnits: number, totalUnits: number): Money {
  if (totalUnits <= 0) throw new MoneyError('El total de unidades debe ser positivo');
  return { cents: divideRoundHalfUp(m.cents * BigInt(usedUnits), BigInt(totalUnits)), currency: m.currency };
}

/**
 * Reparte un importe entre N partes con el algoritmo de MAYOR RESIDUO.
 *
 * Garantiza `Σ partes === total` EXACTAMENTE. Redondear cada parte por
 * separado produce $33.33 × 3 = $99.99 y falta un centavo — y a escala de
 * miles de cargos mensuales, esos centavos son justo lo que impide que la
 * conciliación cuadre (ADR-005, regla 3).
 */
export function allocate(total: Money, weights: readonly number[]): Money[] {
  if (weights.length === 0) throw new MoneyError('Se requiere al menos una parte');
  if (weights.some((w) => w < 0)) throw new MoneyError('Los pesos no pueden ser negativos');

  const totalWeight = weights.reduce((acc, w) => acc + w, 0);
  if (totalWeight <= 0) throw new MoneyError('La suma de pesos debe ser positiva');

  const negative = total.cents < 0n;
  const abs = negative ? -total.cents : total.cents;

  // Parte entera por truncamiento, y se guarda el residuo de cada parte.
  const bigWeights = weights.map((w) => BigInt(Math.round(w * 1_000_000)));
  const bigTotalWeight = bigWeights.reduce((acc, w) => acc + w, 0n);

  const base: bigint[] = [];
  const remainders: Array<{ index: number; remainder: bigint }> = [];
  let assigned = 0n;

  for (let i = 0; i < bigWeights.length; i++) {
    const numerator = abs * bigWeights[i]!;
    const share = numerator / bigTotalWeight;
    base.push(share);
    remainders.push({ index: i, remainder: numerator % bigTotalWeight });
    assigned += share;
  }

  // El sobrante se reparte de uno en uno a las partes de mayor residuo.
  let leftover = abs - assigned;
  remainders.sort((a, b) => (b.remainder === a.remainder ? a.index - b.index : b.remainder > a.remainder ? 1 : -1));
  for (let i = 0; leftover > 0n; i = (i + 1) % remainders.length) {
    base[remainders[i]!.index]! += 1n;
    leftover -= 1n;
  }

  return base.map((cents) => ({ cents: negative ? -cents : cents, currency: total.currency }));
}

/**
 * Desglosa un total en subtotal e impuesto.
 *
 * Se guardan SEPARADOS desde el día 1 aunque hoy no se facture (ADR-019):
 * reconstruir el desglose después sobre miles de cargos produce diferencias
 * de centavos irreconciliables.
 */
export type TaxBreakdown = { subtotal: Money; tax: Money; total: Money };

export function breakdownTax(amount: Money, taxRateBps: number, amountIncludesTax: boolean): TaxBreakdown {
  if (taxRateBps === 0) {
    return { subtotal: amount, tax: { cents: 0n, currency: amount.currency }, total: amount };
  }
  if (amountIncludesTax) {
    // subtotal = total / (1 + tasa)
    const subtotalCents = divideRoundHalfUp(amount.cents * 10_000n, BigInt(10_000 + taxRateBps));
    const subtotal = { cents: subtotalCents, currency: amount.currency };
    return { subtotal, tax: subMoney(amount, subtotal), total: amount };
  }
  const tax = multiplyByBps(amount, taxRateBps);
  return { subtotal: amount, tax, total: addMoney(amount, tax) };
}

/** Formato para la interfaz. La presentación es el ÚNICO lugar donde hay decimales. */
export function formatMoney(m: Money, locale = 'es-MX'): string {
  const negative = m.cents < 0n;
  const abs = negative ? -m.cents : m.cents;
  const major = abs / 100n;
  const minor = abs % 100n;
  const formatted = new Intl.NumberFormat(locale, { minimumFractionDigits: 0 }).format(major);
  return `${negative ? '-' : ''}$${formatted}.${minor.toString().padStart(2, '0')}`;
}

/** Salida hacia JSON: string, NUNCA number (ADR-005, consecuencia negativa). */
export function moneyToJSON(m: Money): { cents: string; currency: Currency } {
  return { cents: m.cents.toString(), currency: m.currency };
}

/** Escape explícito. El nombre avisa de que se pierde la garantía. */
export function toCentsUnsafe(m: Money): number {
  if (m.cents > BigInt(Number.MAX_SAFE_INTEGER) || m.cents < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new MoneyError('Importe fuera del rango seguro de Number');
  }
  return Number(m.cents);
}
