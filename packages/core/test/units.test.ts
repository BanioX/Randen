import { describe, expect, it } from 'vitest';
import {
  CurrencyCodeSchema,
  DEFAULT_CURRENCY,
  formatPercent,
  formatQuantity,
  formatTemperature,
  formatUnitPrice,
  lineValue,
  milliToRappen,
  parseQuantityInput,
  parseTemperature,
  parseUnitPrice,
  rappen,
  roundQuantity,
  unitPriceFromTotal,
  valueMilli,
} from '../src';

describe('formatQuantity', () => {
  it('writes grams, kilograms, litres and pieces as a kitchen does', () => {
    expect(formatQuantity(750, 'g')).toBe('750 g');
    expect(formatQuantity(2500, 'g')).toBe('2.5 kg');
    expect(formatQuantity(1000, 'g')).toBe('1 kg');
    expect(formatQuantity(12_340, 'g')).toBe('12.34 kg');
    expect(formatQuantity(2.5, 'g')).toBe('2.5 g');
    expect(formatQuantity(1200, 'ml')).toBe('1.2 l');
    expect(formatQuantity(330, 'ml')).toBe('330 ml');
    expect(formatQuantity(12, 'pcs')).toBe('12 Stk.');
    expect(formatQuantity(0.5, 'pcs')).toBe('0.5 Stk.');
    expect(formatQuantity(1_250_000, 'g')).toBe('1’250 kg');
  });

  it('uses decilitres on recipe cards only', () => {
    expect(formatQuantity(250, 'ml', { style: 'kitchen' })).toBe('2.5 dl');
    expect(formatQuantity(500, 'ml', { style: 'kitchen' })).toBe('5 dl');
    expect(formatQuantity(330, 'ml', { style: 'kitchen' })).toBe('330 ml');
    expect(formatQuantity(250, 'ml')).toBe('250 ml');
  });
});

describe('parseQuantityInput', () => {
  it('reads typed amounts into base units', () => {
    expect(parseQuantityInput('2.5 kg', 'g')).toBe(2500);
    expect(parseQuantityInput('2,5kg', 'g')).toBe(2500);
    expect(parseQuantityInput('750', 'g')).toBe(750);
    expect(parseQuantityInput('7.5 dl', 'ml')).toBe(750);
    expect(parseQuantityInput('2 l', 'ml')).toBe(2000);
    expect(parseQuantityInput('12 Stk.', 'pcs')).toBe(12);
    expect(parseQuantityInput('0.5', 'pcs')).toBe(0.5);
    expect(parseQuantityInput('1’250', 'g')).toBe(1250);
  });

  it('takes a bare number in the unit of the field', () => {
    expect(parseQuantityInput('2.5', 'g', 'kg')).toBe(2500);
    expect(parseQuantityInput('250 g', 'g', 'kg')).toBe(250);
    expect(parseQuantityInput('1.5', 'ml', 'l')).toBe(1500);
  });

  it('refuses what is not an amount of this unit', () => {
    expect(parseQuantityInput('', 'g')).toBeNull();
    expect(parseQuantityInput('zwei', 'g')).toBeNull();
    expect(parseQuantityInput('2 l', 'g')).toBeNull();
    expect(parseQuantityInput('-3', 'g')).toBeNull();
    expect(parseQuantityInput('3 kg', 'pcs')).toBeNull();
  });
});

describe('values', () => {
  it('multiplies a quantity by a price per 1000 base units', () => {
    // 2 kg at CHF 62.00/kg
    expect(valueMilli(2000, 6200)).toBe(12_400_000);
    expect(lineValue(2000, 6200)).toBe(12_400);
    // 12 eggs at CHF 0.45
    expect(lineValue(12, 45_000)).toBe(540);
    // 2.5 g of saffron at CHF 9'000/kg
    expect(lineValue(2.5, 900_000)).toBe(2250);
  });

  it('rounds half away from zero', () => {
    expect(milliToRappen(1500)).toBe(2);
    expect(milliToRappen(1499)).toBe(1);
    expect(milliToRappen(-1500)).toBe(-2);
    expect(Object.is(milliToRappen(-1), 0)).toBe(true);
  });

  it('derives the unit price from a line total', () => {
    // 10 kg for CHF 520.00 → CHF 52.00/kg
    expect(unitPriceFromTotal(rappen(52_000), 10_000)).toBe(5200);
    // 30 eggs for CHF 13.50 → CHF 0.45 each
    expect(unitPriceFromTotal(rappen(1350), 30)).toBe(45_000);
    expect(unitPriceFromTotal(rappen(1350), 0)).toBe(0);
  });

  it('keeps quantities free of float noise', () => {
    expect(roundQuantity(0.1 + 0.2)).toBe(0.3);
    expect(Object.is(roundQuantity(-0.0001), 0)).toBe(true);
  });
});

describe('unit prices', () => {
  it('formats per kilogram, litre and piece', () => {
    expect(formatUnitPrice(6200, 'g', DEFAULT_CURRENCY)).toBe('CHF 62.00 / kg');
    expect(formatUnitPrice(640, 'ml', DEFAULT_CURRENCY)).toBe('CHF 6.40 / l');
    expect(formatUnitPrice(45_000, 'pcs', DEFAULT_CURRENCY)).toBe('CHF 0.45 / Stk.');
    expect(formatUnitPrice(1200, 'pcs', DEFAULT_CURRENCY)).toBe('CHF 0.012 / Stk.');
    expect(formatUnitPrice(6200, 'g', DEFAULT_CURRENCY, { currency: false })).toBe('62.00 / kg');
  });

  it('reads typed prices', () => {
    expect(parseUnitPrice('62', 'g', DEFAULT_CURRENCY)).toBe(6200);
    expect(parseUnitPrice('62.50', 'g', DEFAULT_CURRENCY)).toBe(6250);
    expect(parseUnitPrice('CHF 6,40', 'ml', DEFAULT_CURRENCY)).toBe(640);
    expect(parseUnitPrice('0.45', 'pcs', DEFAULT_CURRENCY)).toBe(45_000);
    expect(parseUnitPrice('0.012', 'pcs', DEFAULT_CURRENCY)).toBe(1200);
    expect(parseUnitPrice('abc', 'g', DEFAULT_CURRENCY)).toBeNull();
    expect(parseUnitPrice('-5', 'g', DEFAULT_CURRENCY)).toBeNull();
    expect(parseUnitPrice('', 'g', DEFAULT_CURRENCY)).toBeNull();
  });

  it('follows the decimals of the currency', () => {
    const JPY = CurrencyCodeSchema.parse('JPY');
    expect(parseUnitPrice('1200', 'g', JPY)).toBe(1200);
    expect(formatUnitPrice(1200, 'g', JPY)).toBe('JPY 1’200 / kg');
  });
});

describe('percent and temperature', () => {
  it('formats shares', () => {
    expect(formatPercent(3000)).toBe('30 %');
    expect(formatPercent(810)).toBe('8.1 %');
    expect(formatPercent(3529)).toBe('35.3 %');
  });

  it('formats and reads temperatures in tenths of a degree', () => {
    expect(formatTemperature(45)).toBe('4.5 °C');
    expect(formatTemperature(-180)).toBe('-18 °C');
    expect(parseTemperature('4.5')).toBe(45);
    expect(parseTemperature('4,5 °C')).toBe(45);
    expect(parseTemperature('-18')).toBe(-180);
    expect(parseTemperature('72°C')).toBe(720);
    expect(parseTemperature('warm')).toBeNull();
    expect(parseTemperature('4.55')).toBeNull();
    expect(parseTemperature('999')).toBeNull();
  });
});
