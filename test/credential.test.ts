import { describe, it, expect } from 'vitest';
import { isValidPinFormat, PIN_LENGTH } from '../src/index.js';

describe('PIN de respaldo', () => {
  it('son seis dígitos', () => {
    expect(PIN_LENGTH).toBe(6);
    expect(isValidPinFormat('482913')).toBe(true);
  });

  it('rechaza formatos que no son un PIN', () => {
    for (const malo of ['1234', '12345a', '', '1234567']) {
      expect(isValidPinFormat(malo), malo).toBe(false);
    }
  });

  it('rechaza los PIN que la gente elige y cualquiera adivina', () => {
    for (const malo of ['111111', '000000', '123456', '654321', '987654']) {
      expect(isValidPinFormat(malo), malo).toBe(false);
    }
  });
});
