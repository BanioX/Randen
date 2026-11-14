import { describe, expect, it } from 'vitest';
import {
  CurrencyCodeSchema,
  currencySymbol,
  DEFAULT_CURRENCY,
  formatChf,
  formatMoney,
  minorDigits,
  parseMoney,
  rappen,
} from '../src';

const EUR = CurrencyCodeSchema.parse('EUR');
const JPY = CurrencyCodeSchema.parse('JPY');
const KWD = CurrencyCodeSchema.parse('KWD');
const USD = CurrencyCodeSchema.parse('USD');

describe('formatMoney', () => {
  it('writes francs exactly like formatChf', () => {
    for (const amount of [0, 5, 95, 395, -395, 100_000, 123_456_789]) {
      expect(formatMoney(rappen(amount), DEFAULT_CURRENCY)).toBe(formatChf(rappen(amount)));
      expect(formatMoney(rappen(amount), DEFAULT_CURRENCY, { currency: false })).toBe(
        formatChf(rappen(amount), { currency: false }),
      );
    }
  });

  it('writes euros the German and Austrian way', () => {
    expect(formatMoney(rappen(123_450), EUR)).toBe('1.234,50 €');
    expect(formatMoney(rappen(-395), EUR)).toBe('-3,95 €');
    expect(formatMoney(rappen(5), EUR, { currency: false })).toBe('0,05');
  });

  it('follows the minor units of the currency', () => {
    expect(minorDigits(JPY)).toBe(0);
    expect(formatMoney(rappen(1234), JPY)).toBe('JPY 1’234');
    expect(minorDigits(KWD)).toBe(3);
    expect(formatMoney(rappen(1234), KWD)).toBe('KWD 1.234');
    expect(formatMoney(rappen(199), USD)).toBe('USD 1.99');
  });

  it('names the symbol for labels', () => {
    expect(currencySymbol(DEFAULT_CURRENCY)).toBe('CHF');
    expect(currencySymbol(EUR)).toBe('€');
    expect(currencySymbol(USD)).toBe('USD');
  });
});

describe('parseMoney', () => {
  it('reads euros with either decimal mark and grouped thousands', () => {
    expect(parseMoney('3,95', EUR)).toBe(395);
    expect(parseMoney('3.95', EUR)).toBe(395);
    expect(parseMoney('1.234,50 €', EUR)).toBe(123_450);
    expect(parseMoney('1.234', EUR)).toBe(123_400);
    expect(parseMoney('12', EUR)).toBe(1200);
    expect(parseMoney('-0,80', EUR)).toBe(-80);
    expect(parseMoney('1,5', EUR)).toBe(150);
  });

  it('refuses what is not one clear amount', () => {
    expect(parseMoney('abc', EUR)).toBeNull();
    expect(parseMoney('1.2345', EUR)).toBeNull();
    expect(parseMoney('', EUR)).toBeNull();
  });

  it('keeps the Swiss receipt parser for francs and reads other minor units', () => {
    expect(parseMoney('CHF 12.–', DEFAULT_CURRENCY)).toBe(1200);
    expect(parseMoney('1’234', JPY)).toBe(1234);
    expect(parseMoney('1,234', KWD)).toBe(1234);
  });

  it('round-trips what it formats', () => {
    for (const amount of [0, 7, 395, 123_450, -80]) {
      expect(parseMoney(formatMoney(rappen(amount), EUR), EUR)).toBe(amount);
    }
  });
});
