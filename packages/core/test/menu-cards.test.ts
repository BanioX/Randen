import { describe, expect, it } from 'vitest';
import { createTestContext } from '../src/testing';
import { addCard, eventsOf, refusal, setup, sizes } from './menu-support';

describe('menu.create', () => {
  it('creates an empty draft with the switches on, and says so in an event', async () => {
    const s = await setup();
    const commandId = s.t.cmd();
    const { cardId } = await s.run['menu.create']({
      commandId,
      businessId: s.businessId,
      name: 'Abendkarte',
      intro: '  Saisonal aus der Region.  ',
      footer: '   ',
    });
    const row = await s.t.storage.menuCards.get(cardId);
    expect(row).toMatchObject({
      name: 'Abendkarte',
      intro: 'Saisonal aus der Region.',
      sections: [],
      showPrices: true,
      showPhotos: true,
      published: false,
    });
    expect(row).not.toHaveProperty('footer');
    expect(await eventsOf(s.t, 'menu.card_created')).toHaveLength(1);
  });

  it('gives the same answer and writes nothing when the same command comes twice', async () => {
    const s = await setup();
    const commandId = s.t.cmd();
    const input = { commandId, businessId: s.businessId, name: 'Mittagskarte' };
    const first = await s.run['menu.create'](input);
    const before = await sizes(s.t);
    const second = await s.run['menu.create'](input);
    expect(second).toEqual(first);
    expect(await sizes(s.t)).toEqual(before);
  });

  it('refuses a name that another card has, without regard to case', async () => {
    const s = await setup();
    await addCard(s, 'Abendkarte');
    const error = await refusal(
      s.run['menu.create']({ commandId: s.t.cmd(), businessId: s.businessId, name: 'abendkarte' }),
    );
    expect(error.code).toBe('duplicate_name');
  });
});

describe('menu.update', () => {
  it('changes name, intro, footer and the two switches, and names the fields in the event', async () => {
    const s = await setup();
    const cardId = await addCard(s, 'Abendkarte');
    await s.run['menu.update']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      cardId,
      name: 'Sommerkarte',
      intro: 'Frisch vom Markt.',
      footer: 'Guten Appetit.',
      showPrices: false,
      showPhotos: false,
    });
    const row = await s.t.storage.menuCards.get(cardId);
    expect(row).toMatchObject({
      name: 'Sommerkarte',
      intro: 'Frisch vom Markt.',
      footer: 'Guten Appetit.',
      showPrices: false,
      showPhotos: false,
    });
    const [event] = await eventsOf(s.t, 'menu.card_updated');
    expect(event?.payload).toEqual({
      cardId,
      fields: ['name', 'intro', 'footer', 'showPrices', 'showPhotos'],
    });
  });

  it('clears the intro when the field is emptied, and keeps the name of the card itself', async () => {
    const s = await setup();
    const { cardId } = await s.run['menu.create']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      name: 'Abendkarte',
      intro: 'Alt',
    });
    await s.run['menu.update']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      cardId,
      intro: '',
      name: 'Abendkarte',
    });
    const row = await s.t.storage.menuCards.get(cardId);
    expect(row).not.toHaveProperty('intro');
    expect(await eventsOf(s.t, 'menu.card_updated')).toHaveLength(1);
  });

  it('writes nothing and emits nothing when nothing changes', async () => {
    const s = await setup();
    const cardId = await addCard(s, 'Abendkarte');
    const before = await sizes(s.t);
    await s.run['menu.update']({ commandId: s.t.cmd(), businessId: s.businessId, cardId });
    expect(await sizes(s.t)).toEqual(before);
    expect(await eventsOf(s.t, 'menu.card_updated')).toHaveLength(0);
  });

  it('refuses another card’s name and a card that does not exist', async () => {
    const s = await setup();
    await addCard(s, 'Abendkarte');
    const other = await addCard(s, 'Mittagskarte');
    expect(
      (
        await refusal(
          s.run['menu.update']({
            commandId: s.t.cmd(),
            businessId: s.businessId,
            cardId: other,
            name: 'ABENDKARTE',
          }),
        )
      ).code,
    ).toBe('duplicate_name');
    expect(
      (
        await refusal(
          s.run['menu.update']({
            commandId: s.t.cmd(),
            businessId: s.businessId,
            cardId: s.t.ids.next(),
            name: 'Neu',
          }),
        )
      ).code,
    ).toBe('not_found');
  });
});

describe('menu.setPublished', () => {
  it('publishes and takes back to draft, with one event each', async () => {
    const s = await setup();
    const cardId = await addCard(s, 'Abendkarte');
    await s.run['menu.setPublished']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      cardId,
      published: true,
    });
    expect((await s.t.storage.menuCards.get(cardId))?.published).toBe(true);
    expect(await eventsOf(s.t, 'menu.card_published')).toHaveLength(1);
    await s.run['menu.setPublished']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      cardId,
      published: false,
    });
    expect((await s.t.storage.menuCards.get(cardId))?.published).toBe(false);
    expect(await eventsOf(s.t, 'menu.card_unpublished')).toHaveLength(1);
  });

  it('does nothing when the card already has that state', async () => {
    const s = await setup();
    const cardId = await addCard(s, 'Abendkarte');
    const before = await sizes(s.t);
    await s.run['menu.setPublished']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      cardId,
      published: false,
    });
    expect(await sizes(s.t)).toEqual(before);
    expect(await eventsOf(s.t, 'menu.card_unpublished')).toHaveLength(0);
  });
});

describe('menu.duplicate', () => {
  it('copies the card as a draft with new section ids, and numbers the copy name', async () => {
    const s = await setup();
    const { entrecoteDish } = s.kitchen.recipes;
    const cardId = await addCard(
      s,
      'Abendkarte',
      [{ title: 'Hauptgänge', recipeIds: [entrecoteDish.id] }],
      {
        published: true,
      },
    );
    const first = await s.run['menu.duplicate']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      cardId,
    });
    expect(first.name).toBe('Abendkarte (Kopie)');
    const copy = await s.t.storage.menuCards.get(first.cardId);
    expect(copy?.published).toBe(false);
    expect(copy?.sections[0]?.recipeIds).toEqual([entrecoteDish.id]);
    expect(copy?.sections[0]?.id).not.toBe(
      (await s.t.storage.menuCards.get(cardId))?.sections[0]?.id,
    );
    expect(await eventsOf(s.t, 'menu.card_duplicated')).toHaveLength(1);

    const second = await s.run['menu.duplicate']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      cardId,
    });
    expect(second.name).toBe('Abendkarte (Kopie 2)');
  });

  it('keeps the name within the limit of the model', async () => {
    const s = await setup();
    const long = 'A'.repeat(80);
    const cardId = await addCard(s, long);
    const copy = await s.run['menu.duplicate']({
      commandId: s.t.cmd(),
      businessId: s.businessId,
      cardId,
    });
    expect(copy.name.length).toBeLessThanOrEqual(80);
    expect(copy.name.endsWith('(Kopie)')).toBe(true);
  });

  it('refuses a card that does not exist', async () => {
    const s = await setup();
    const error = await refusal(
      s.run['menu.duplicate']({
        commandId: s.t.cmd(),
        businessId: s.businessId,
        cardId: s.t.ids.next(),
      }),
    );
    expect(error.code).toBe('not_found');
  });
});

describe('menu.delete', () => {
  it('deletes softly: the row stays, the card leaves every list and every address', async () => {
    const s = await setup();
    const cardId = await addCard(s, 'Abendkarte');
    await s.run['menu.delete']({ commandId: s.t.cmd(), businessId: s.businessId, cardId });
    const row = await s.t.storage.menuCards.get(cardId);
    expect(row?.deletedAt).toBeDefined();
    expect(row?.updatedAt).toBe(row?.deletedAt);
    expect((await s.run['menu.list']({ businessId: s.businessId })).cards).toHaveLength(0);
    expect((await refusal(s.run['menu.get']({ businessId: s.businessId, cardId }))).code).toBe(
      'not_found',
    );
    expect(await eventsOf(s.t, 'menu.card_deleted')).toHaveLength(1);
  });

  it('answers a repeated delete with the same result and no second event', async () => {
    const s = await setup();
    const cardId = await addCard(s, 'Abendkarte');
    const commandId = s.t.cmd();
    const first = await s.run['menu.delete']({ commandId, businessId: s.businessId, cardId });
    const second = await s.run['menu.delete']({ commandId, businessId: s.businessId, cardId });
    expect(second).toEqual(first);
    expect(await eventsOf(s.t, 'menu.card_deleted')).toHaveLength(1);
  });

  it('refuses a card that is already gone', async () => {
    const s = await setup();
    const cardId = await addCard(s, 'Abendkarte');
    await s.run['menu.delete']({ commandId: s.t.cmd(), businessId: s.businessId, cardId });
    const error = await refusal(
      s.run['menu.delete']({ commandId: s.t.cmd(), businessId: s.businessId, cardId }),
    );
    expect(error.code).toBe('not_found');
  });
});

describe('another business', () => {
  it('sees none of the cards, and cannot reach them by id', async () => {
    const s = await setup();
    const cardId = await addCard(s, 'Abendkarte', [], { published: true });
    const other = await createTestContext({ storage: s.t.storage, idStart: 100_000 });
    const otherRun = other.useCases;
    expect((await otherRun['menu.list']({ businessId: other.businessId })).cards).toEqual([]);
    expect((await otherRun['menu.published']({ businessId: other.businessId })).cards).toEqual([]);
    const error = await refusal(otherRun['menu.guest']({ businessId: other.businessId, cardId }));
    expect(error.code).toBe('not_found');
  });
});
