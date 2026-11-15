import { describe, expect, it } from 'vitest';
import {
  asksWhereGuestsEat,
  BUSINESS_KINDS,
  BusinessKindSchema,
  businessKindLabel,
  hasModule,
  MODULE_IDS,
  modulesInUse,
  orderModules,
  proposeSetup,
  STARTER_MODULES,
  suggestedSources,
  switchModule,
  type SetupAnswers,
} from '../src';
import { createTestContext } from '../src/testing';

const counter: SetupAnswers = {
  kind: 'takeaway',
  sources: { pickup: true, delivered: false, orders: false },
  team: 'solo',
};

describe('kinds of business and their functions (ADR-0015)', () => {
  it('offers every kind once in the setup, each with a name', () => {
    expect([...BUSINESS_KINDS].sort()).toEqual([...BusinessKindSchema.options].sort());
    for (const kind of BUSINESS_KINDS) {
      expect(businessKindLabel(kind).length).toBeGreaterThan(3);
    }
  });

  it('gives a cook alone at the counter only the menu card and the market', () => {
    expect(proposeSetup(counter)).toEqual({ modules: ['menu_card', 'market'], detailed: false });
  });

  it('gives a large community kitchen lines, meal counts, places, team and the detailed view', () => {
    const { modules, detailed } = proposeSetup({
      kind: 'canteen',
      sources: suggestedSources('canteen'),
      team: 'large',
    });
    expect(modules).toEqual(
      expect.arrayContaining(['planning', 'meals', 'ordering', 'places', 'team']),
    );
    expect(modules).not.toContain('market');
    expect(detailed).toBe(true);
  });

  it('lets the goods decide the market and ordering, whatever the kind', () => {
    const restaurant = (sources: SetupAnswers['sources']) =>
      proposeSetup({ kind: 'restaurant', sources, team: 'small' }).modules;
    expect(restaurant({ pickup: true, delivered: false, orders: false })).toContain('market');
    expect(restaurant({ pickup: true, delivered: false, orders: false })).not.toContain('ordering');
    // Delivered without orders ahead: the supplier exists for goods receipt, no order proposal.
    expect(restaurant({ pickup: false, delivered: true, orders: false })).not.toContain('ordering');
    expect(restaurant({ pickup: false, delivered: true, orders: true })).toContain('ordering');
  });

  it('lets the size of the team decide team, places and the view', () => {
    const restaurant = (team: SetupAnswers['team']) =>
      proposeSetup({ kind: 'restaurant', sources: suggestedSources('restaurant'), team });
    expect(restaurant('solo').modules).not.toContain('team');
    expect(restaurant('solo').modules).not.toContain('places');
    expect(restaurant('solo').detailed).toBe(false);
    expect(restaurant('small').modules).toContain('team');
    expect(restaurant('small').detailed).toBe(true);
    const bistro = proposeSetup({
      kind: 'bistro',
      sources: suggestedSources('bistro'),
      team: 'large',
    });
    expect(bistro.modules).toEqual(expect.arrayContaining(['places', 'team']));
    expect(bistro.detailed).toBe(true);
  });

  it('asks where guests eat only where take-away is common, and sets the VAT from it', () => {
    expect(asksWhereGuestsEat('takeaway')).toBe(true);
    expect(asksWhereGuestsEat('canteen')).toBe(false);
    expect(proposeSetup({ ...counter, eating: 'away' }).defaultVatBps).toBe(260);
    expect(proposeSetup({ ...counter, eating: 'here' }).defaultVatBps).toBe(810);
    expect(
      proposeSetup({ kind: 'mensa', sources: counter.sources, team: 'large', eating: 'away' })
        .defaultVatBps,
    ).toBeUndefined();
  });

  it('never proposes deliveries to satellites without production', () => {
    for (const kind of BUSINESS_KINDS) {
      for (const team of ['solo', 'small', 'large'] as const) {
        const { modules } = proposeSetup({ kind, sources: suggestedSources(kind), team });
        if (modules.includes('dispatch')) {
          expect(modules, kind).toContain('production');
        }
      }
    }
  });

  it('switches a function with what it needs and what needs it', () => {
    expect(switchModule(['menu_card'], 'dispatch', true)).toEqual([
      'menu_card',
      'production',
      'dispatch',
    ]);
    expect(switchModule(['production', 'dispatch', 'team'], 'production', false)).toEqual(['team']);
    expect(switchModule(['production', 'dispatch'], 'dispatch', false)).toEqual(['production']);
  });

  it('keeps every function for a business from before, as the view of the device says', () => {
    expect(modulesInUse({}, true)).toEqual([...MODULE_IDS]);
    expect(modulesInUse({}, false)).toEqual([...STARTER_MODULES]);
    expect(modulesInUse({ modules: ['team', 'market'] }, true)).toEqual(['market', 'team']);
    expect(hasModule({}, 'meals')).toBe(true);
    expect(hasModule({ modules: ['market'] }, 'meals')).toBe(false);
    expect(orderModules(['team', 'market', 'team'])).toEqual(['market', 'team']);
  });
});

describe('setting the business up', () => {
  it('takes kind, name and the proposed functions and remembers when', async () => {
    const t = await createTestContext();
    const { business } = await t.useCases['business.setup']({
      commandId: t.cmd(),
      businessId: t.businessId,
      ...counter,
      eating: 'away',
      name: 'Imbiss am Bach',
    });
    expect(business).toMatchObject({
      kind: 'takeaway',
      name: 'Imbiss am Bach',
      modules: ['menu_card', 'market'],
      defaultVatBps: 260,
    });
    expect(business.setupAt).toBeDefined();
    const events = await t.storage.events.ofBusiness(t.businessId);
    expect(events.map((event) => event.type)).toEqual(['business.set_up']);
  });

  it('takes the functions a person chose over the proposal, with what they need', async () => {
    const t = await createTestContext();
    const { business } = await t.useCases['business.setup']({
      commandId: t.cmd(),
      businessId: t.businessId,
      kind: 'central_kitchen',
      sources: suggestedSources('central_kitchen'),
      team: 'large',
      name: 'Produktionsküche Nord',
      modules: ['team', 'dispatch', 'team'],
    });
    expect(business.modules).toEqual(['production', 'dispatch', 'team']);
  });

  it('switches functions later and reports only a real change', async () => {
    const t = await createTestContext();
    const first = await t.useCases['business.update']({
      commandId: t.cmd(),
      businessId: t.businessId,
      modules: ['market', 'menu_card'],
    });
    expect(first.business.modules).toEqual(['menu_card', 'market']);
    await t.useCases['business.update']({
      commandId: t.cmd(),
      businessId: t.businessId,
      modules: ['menu_card', 'market'],
    });
    const events = await t.storage.events.ofBusiness(t.businessId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'business.updated', payload: { fields: ['modules'] } });
  });
});
