import { describe, expect, it } from 'vitest';
import { analyseMenu, menuClassAdvice, menuClassLabel } from '../src';
import { sequentialIds } from '../src/testing';

const ids = sequentialIds();

describe('analyseMenu', () => {
  it('places dishes by popularity and contribution margin', () => {
    const [star, plowhorse, puzzle, dog] = [ids.next(), ids.next(), ids.next(), ids.next()];
    const analysis = analyseMenu([
      { id: star, sold: 400, marginRappen: 2600 },
      { id: plowhorse, sold: 350, marginRappen: 1400 },
      { id: puzzle, sold: 150, marginRappen: 2900 },
      { id: dog, sold: 100, marginRappen: 1200 },
    ]);
    // Four dishes: popular from 70 % of a quarter = 17.5 % of 1000 portions.
    expect(analysis.popularityThresholdBps).toBe(1750);
    expect(analysis.totalSold).toBe(1000);
    // (400×26 + 350×14 + 150×29 + 100×12) / 1000 = 20.85
    expect(analysis.averageMarginRappen).toBe(2085);
    expect(analysis.items.map((item) => item.menuClass)).toEqual([
      'star',
      'plowhorse',
      'puzzle',
      'dog',
    ]);
    expect(analysis.items[0]).toMatchObject({ shareBps: 4000, totalMarginRappen: 1_040_000 });
  });

  it('counts a dish exactly on a threshold as popular and profitable', () => {
    const [a, b] = [ids.next(), ids.next()];
    const analysis = analyseMenu([
      { id: a, sold: 35, marginRappen: 1000 },
      { id: b, sold: 65, marginRappen: 1000 },
    ]);
    // Two dishes: popular from 35 %. Both have exactly the average margin.
    expect(analysis.items.map((item) => item.menuClass)).toEqual(['star', 'star']);
  });

  it('has nothing to say when nothing was sold', () => {
    expect(analyseMenu([])).toMatchObject({ items: [], totalSold: 0 });
    expect(analyseMenu([{ id: ids.next(), sold: 0, marginRappen: 500 }]).items).toEqual([]);
  });

  it('names every class and says what to do', () => {
    for (const menuClass of ['star', 'plowhorse', 'puzzle', 'dog'] as const) {
      expect(menuClassLabel(menuClass)).not.toBe('');
      expect(menuClassAdvice(menuClass).length).toBeGreaterThan(20);
    }
  });
});
