import { describe, expect, it } from 'vitest';
import { addCard, addDish, eventsOf, refusal, setup, sizes } from './menu-support';

describe('menu.setSections', () => {
  it('sets sections in order, gives new sections an id, and keeps the ids of known ones', async () => {
    const s = await setup();
    const { entrecoteDish, salmonDish } = s.kitchen.recipes;
    const cardId = await addCard(s, 'Abendkarte', [
      { title: 'Hauptgänge', recipeIds: [entrecoteDish.id] },
    ]);
    const known = (await s.t.storage.menuCards.get(cardId))?.sections[0]?.id;
    await s.run['menu.setSections']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      cardId,
      sections: [
        { title: 'Fisch', recipeIds: [salmonDish.id] },
        { id: known, title: 'Fleisch', recipeIds: [entrecoteDish.id] },
      ],
    });
    const sections = (await s.t.storage.menuCards.get(cardId))?.sections ?? [];
    expect(sections.map((section) => section.title)).toEqual(['Fisch', 'Fleisch']);
    expect(sections[0]?.id).toBeDefined();
    expect(sections[0]?.id).not.toBe(known);
    expect(sections[1]?.id).toBe(known);
    expect(sections[0]?.recipeIds).toEqual([salmonDish.id]);
    const events = await eventsOf(s.t, 'menu.sections_changed');
    expect(events.at(-1)?.payload).toEqual({ cardId, sections: 2, dishes: 2 });
  });

  it('takes the new ids from the id generator', async () => {
    const s = await setup();
    const cardId = await addCard(s, 'Abendkarte');
    await s.run['menu.setSections']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      cardId,
      sections: [{ title: 'Vorspeisen', recipeIds: [] }],
    });
    const id = (await s.t.storage.menuCards.get(cardId))?.sections[0]?.id;
    expect(id).toBeDefined();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });

  it('answers a repeated command with the same card and writes nothing twice', async () => {
    const s = await setup();
    const { entrecoteDish } = s.kitchen.recipes;
    const cardId = await addCard(s, 'Abendkarte');
    const commandId = s.t.cmd();
    const input = {
      commandId,
      businessId: s.businessId,
      cardId,
      sections: [{ title: 'Hauptgänge', recipeIds: [entrecoteDish.id] }],
    };
    const first = await s.run['menu.setSections'](input);
    const before = await sizes(s.t);
    const second = await s.run['menu.setSections'](input);
    expect(second).toEqual(first);
    expect(await sizes(s.t)).toEqual(before);
    expect(await eventsOf(s.t, 'menu.sections_changed')).toHaveLength(1);
  });

  it('lets a dish appear once per card only, also across sections', async () => {
    const s = await setup();
    const { entrecoteDish } = s.kitchen.recipes;
    const cardId = await addCard(s, 'Abendkarte');
    const error = await refusal(
      s.run['menu.setSections']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        cardId,
        sections: [
          { title: 'Eins', recipeIds: [entrecoteDish.id] },
          { title: 'Zwei', recipeIds: [entrecoteDish.id] },
        ],
      }),
    );
    expect(error.code).toBe('invalid');
    expect((await s.t.storage.menuCards.get(cardId))?.sections).toEqual([]);
  });

  it('refuses a component, a deleted and an unknown recipe', async () => {
    const s = await setup();
    const { jus } = s.kitchen.recipes;
    const cardId = await addCard(s, 'Abendkarte');
    const component = await refusal(
      s.run['menu.setSections']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        cardId,
        sections: [{ title: 'Eins', recipeIds: [jus.id] }],
      }),
    );
    expect(component.code).toBe('invalid');

    const deleted = addDish(s, { name: 'Alt', deletedAt: s.t.clock.now() });
    const deletedId = await deleted;
    const gone = await refusal(
      s.run['menu.setSections']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        cardId,
        sections: [{ title: 'Eins', recipeIds: [deletedId] }],
      }),
    );
    expect(gone.code).toBe('not_found');

    const unknown = await refusal(
      s.run['menu.setSections']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        cardId,
        sections: [{ title: 'Eins', recipeIds: [s.t.ids.next()] }],
      }),
    );
    expect(unknown.code).toBe('not_found');
  });

  it('refuses a section id that is not on this card, and one given twice', async () => {
    const s = await setup();
    const cardId = await addCard(s, 'Abendkarte', [{ title: 'Eins', recipeIds: [] }]);
    const foreign = await refusal(
      s.run['menu.setSections']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        cardId,
        sections: [{ id: s.t.ids.next(), title: 'Fremd', recipeIds: [] }],
      }),
    );
    expect(foreign.code).toBe('invalid');

    const known = (await s.t.storage.menuCards.get(cardId))?.sections[0]?.id;
    const twice = await refusal(
      s.run['menu.setSections']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        cardId,
        sections: [
          { id: known, title: 'Eins', recipeIds: [] },
          { id: known, title: 'Zwei', recipeIds: [] },
        ],
      }),
    );
    expect(twice.code).toBe('invalid');
  });

  it('keeps an inactive dish on the card: the editor shows it with its open point', async () => {
    const s = await setup();
    const inactive = await addDish(s, { name: 'Saisonales Dessert', active: false });
    const cardId = await addCard(s, 'Abendkarte', [{ title: 'Dessert', recipeIds: [inactive] }]);
    const view = await s.run['menu.get']({ businessId: s.businessId, cardId });
    expect(view.sections[0]?.dishes[0]?.active).toBe(false);
    expect(view.sections[0]?.dishes[0]?.problems).toContain('Rezept ist nicht aktiv');
  });

  it('refuses a card that does not exist', async () => {
    const s = await setup();
    const error = await refusal(
      s.run['menu.setSections']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        cardId: s.t.ids.next(),
        sections: [],
      }),
    );
    expect(error.code).toBe('not_found');
  });
});
