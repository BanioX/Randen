import {
  CommandError,
  createCommandKit,
  requireRow,
  type AppContext,
  type UseCase,
} from '../../application/command';
import { CONTRACT_V1 } from '../../contract';
import type { Id } from '../../ids';
import type { Business } from '../../model/business';
import { MenuCardSchema, type MenuCard, type MenuSection } from '../../model/menu';
import { alive } from '../../ports/storage';
import {
  allergenRows,
  ALLERGEN_REFS,
  cardView,
  editorView,
  guestContent,
  menuBook,
  summaryOf,
  type MenuBook,
} from './view';
import { fileNameOf, renderGuestHtml } from './html';

/** Names of cards compare without regard to case, like the recipes. */
const nameKey = (name: string) => name.trim().toLocaleLowerCase('de-CH');
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'de-CH');
/** The longest a card name may be (the model) and the word a copy carries. */
const NAME_MAX = 80;
const COPY_WORD = 'Kopie';

/** Copies a value without its undefined entries, so optional fields are left out. */
function defined<TObject extends Record<string, unknown>>(object: TObject) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined)) as {
    [TKey in keyof TObject]?: Exclude<TObject[TKey], undefined>;
  };
}

/** A card without its free texts: they are set again from the input, or stay out. */
function withoutTexts(row: MenuCard): Partial<MenuCard> {
  const copy: Partial<MenuCard> = { ...row };
  delete copy.intro;
  delete copy.footer;
  return copy;
}

/** Text as typed: an empty field removes the text, so the card has no empty intro. */
function textOrUndefined(value: string | undefined, fallback: string | undefined) {
  if (value === undefined) {
    return fallback;
  }
  return value === '' ? undefined : value;
}

/** Use cases of «Speisekarte»: the cards for guests and the allergen list for the staff. */
export function createMenuUseCases(ctx: AppContext) {
  const { storage, clock, ids } = ctx;
  const { emit, runCommand, stamps } = createCommandKit(ctx);

  async function businessOf(businessId: Id): Promise<Business> {
    const row = await storage.businesses.get(businessId);
    if (row === undefined) {
      throw new CommandError('not_found', `Business ${businessId} not found`);
    }
    return row;
  }

  /** The business, its live cards and the rows the rules read. */
  async function loadBook(businessId: Id): Promise<{ cards: MenuCard[]; book: MenuBook }> {
    const business = await businessOf(businessId);
    const [articleRows, recipeRows, cardRows] = await Promise.all([
      storage.articles.ofBusiness(businessId),
      storage.recipes.ofBusiness(businessId),
      storage.menuCards.ofBusiness(businessId),
    ]);
    return {
      cards: alive(cardRows),
      book: menuBook(business, alive(articleRows), recipeRows),
    };
  }

  function assertNameFree(cards: readonly MenuCard[], name: string, exceptId?: Id): void {
    const key = nameKey(name);
    if (cards.some((card) => card.id !== exceptId && nameKey(card.name) === key)) {
      throw new CommandError('duplicate_name', `Menu card name «${name}» is taken`);
    }
  }

  /** «Sommerkarte (Kopie)», then «Sommerkarte (Kopie 2)» …, free among the cards. */
  function copyName(cards: readonly MenuCard[], name: string): string {
    const taken = (candidate: string) =>
      cards.some((card) => nameKey(card.name) === nameKey(candidate));
    for (let number = 1; ; number += 1) {
      const suffix = number === 1 ? ` (${COPY_WORD})` : ` (${COPY_WORD} ${String(number)})`;
      const base = name.slice(0, NAME_MAX - suffix.length).trimEnd();
      const candidate = `${base}${suffix}`;
      if (!taken(candidate)) {
        return candidate;
      }
    }
  }

  // ── Reads ────────────────────────────────────────────────────────────────────────────────

  const list: UseCase<'menu.list'> = async (raw) => {
    const input = CONTRACT_V1['menu.list'].input.parse(raw);
    const { cards, book } = await loadBook(input.businessId);
    return { cards: [...cards].sort(byName).map((card) => summaryOf(card, book)) };
  };

  const get: UseCase<'menu.get'> = async (raw) => {
    const input = CONTRACT_V1['menu.get'].input.parse(raw);
    const card = await requireRow(storage.menuCards, input.businessId, input.cardId, 'Menu card');
    const { book } = await loadBook(input.businessId);
    const view = editorView(card, book);
    return {
      card: cardView(card),
      sections: view.sections,
      problems: view.problems,
      problemCount: view.problemCount,
    };
  };

  const published: UseCase<'menu.published'> = async (raw) => {
    const input = CONTRACT_V1['menu.published'].input.parse(raw);
    const { cards } = await loadBook(input.businessId);
    return {
      cards: cards
        .filter((card) => card.published)
        .sort(byName)
        .map((card) => ({ id: card.id, name: card.name })),
    };
  };

  /** A guest view of a card: unpublished cards only in the preview of the editor. */
  async function guestOf(businessId: Id, cardId: Id, preview: boolean) {
    const card = await requireRow(storage.menuCards, businessId, cardId, 'Menu card');
    if (!card.published && !preview) {
      throw new CommandError('not_found', `Menu card ${cardId} is not published`);
    }
    const { book } = await loadBook(businessId);
    return { card, book, content: guestContent(card, book) };
  }

  const guest: UseCase<'menu.guest'> = async (raw) => {
    const input = CONTRACT_V1['menu.guest'].input.parse(raw);
    const { card, book, content } = await guestOf(input.businessId, input.cardId, input.preview);
    return {
      businessName: book.businessName,
      card: cardView(card),
      sections: content.sections,
      allergens: content.allergens,
      traces: content.traces,
      diets: content.diets,
      incomplete: content.incomplete,
      preview: input.preview,
    };
  };

  const allergenSheet: UseCase<'menu.allergenSheet'> = async (raw) => {
    const input = CONTRACT_V1['menu.allergenSheet'].input.parse(raw);
    const card = await requireRow(storage.menuCards, input.businessId, input.cardId, 'Menu card');
    const { book } = await loadBook(input.businessId);
    return {
      businessName: book.businessName,
      card: cardView(card),
      allergens: ALLERGEN_REFS.map((ref) => ({ ...ref })),
      rows: allergenRows(card, book),
    };
  };

  const exportCard: UseCase<'menu.export'> = async (raw) => {
    const input = CONTRACT_V1['menu.export'].input.parse(raw);
    const business = await businessOf(input.businessId);
    const { card, content } = await guestOf(input.businessId, input.cardId, true);
    return {
      fileName: fileNameOf(card.name),
      html: renderGuestHtml({
        businessName: business.name,
        currency: business.currency,
        card: cardView(card),
        sections: content.sections,
      }),
    };
  };

  // ── Commands ─────────────────────────────────────────────────────────────────────────────

  const create: UseCase<'menu.create'> = async (raw) => {
    const input = CONTRACT_V1['menu.create'].input.parse(raw);
    return runCommand('menu.create', input.commandId, async () => {
      const { businessId } = input;
      const { cards } = await loadBook(businessId);
      assertNameFree(cards, input.name);
      const cardId = ids.next();
      const intro = textOrUndefined(input.intro, undefined);
      const footer = textOrUndefined(input.footer, undefined);
      await storage.menuCards.add(
        MenuCardSchema.parse({
          id: cardId,
          businessId,
          ...stamps(),
          name: input.name,
          ...defined({ intro, footer }),
          sections: [],
          showPrices: input.showPrices,
          showPhotos: input.showPhotos,
          published: false,
        }),
      );
      await emit(businessId, 'menu.card_created', { cardId });
      return { cardId };
    });
  };

  const update: UseCase<'menu.update'> = async (raw) => {
    const input = CONTRACT_V1['menu.update'].input.parse(raw);
    return runCommand('menu.update', input.commandId, async () => {
      const { businessId } = input;
      const row = await requireRow(storage.menuCards, businessId, input.cardId, 'Menu card');
      const { cards } = await loadBook(businessId);
      if (input.name !== undefined) {
        assertNameFree(cards, input.name, row.id);
      }
      const intro = textOrUndefined(input.intro, row.intro);
      const footer = textOrUndefined(input.footer, row.footer);
      const next = MenuCardSchema.parse({
        ...withoutTexts(row),
        name: input.name ?? row.name,
        ...defined({ intro, footer }),
        showPrices: input.showPrices ?? row.showPrices,
        showPhotos: input.showPhotos ?? row.showPhotos,
        updatedAt: clock.now(),
      });
      const fields = [
        ...(next.name === row.name ? [] : ['name']),
        ...(next.intro === row.intro ? [] : ['intro']),
        ...(next.footer === row.footer ? [] : ['footer']),
        ...(next.showPrices === row.showPrices ? [] : ['showPrices']),
        ...(next.showPhotos === row.showPhotos ? [] : ['showPhotos']),
      ];
      if (fields.length > 0) {
        await storage.menuCards.put(next);
        await emit(businessId, 'menu.card_updated', { cardId: row.id, fields });
      }
      return { cardId: row.id };
    });
  };

  const setPublished: UseCase<'menu.setPublished'> = async (raw) => {
    const input = CONTRACT_V1['menu.setPublished'].input.parse(raw);
    return runCommand('menu.setPublished', input.commandId, async () => {
      const { businessId } = input;
      const row = await requireRow(storage.menuCards, businessId, input.cardId, 'Menu card');
      if (row.published !== input.published) {
        await storage.menuCards.put(
          MenuCardSchema.parse({ ...row, published: input.published, updatedAt: clock.now() }),
        );
        await emit(businessId, input.published ? 'menu.card_published' : 'menu.card_unpublished', {
          cardId: row.id,
        });
      }
      return { cardId: row.id };
    });
  };

  const setSections: UseCase<'menu.setSections'> = async (raw) => {
    const input = CONTRACT_V1['menu.setSections'].input.parse(raw);
    return runCommand('menu.setSections', input.commandId, async () => {
      const { businessId } = input;
      const row = await requireRow(storage.menuCards, businessId, input.cardId, 'Menu card');
      const { book } = await loadBook(businessId);
      const known = new Set(row.sections.map((section) => section.id));
      const seenSections = new Set<Id>();
      const seenDishes = new Set<Id>();
      for (const section of input.sections) {
        if (section.id !== undefined) {
          if (!known.has(section.id) || seenSections.has(section.id)) {
            throw new CommandError('invalid', `Section ${section.id} does not belong to this card`);
          }
          seenSections.add(section.id);
        }
        for (const recipeId of section.recipeIds) {
          if (seenDishes.has(recipeId)) {
            throw new CommandError('invalid', 'A dish can be on a card only once');
          }
          seenDishes.add(recipeId);
          const recipe = book.recipes.get(recipeId);
          if (recipe === undefined || recipe.deletedAt !== undefined) {
            throw new CommandError('not_found', `Recipe ${recipeId} not found`);
          }
          if (recipe.kind !== 'dish') {
            throw new CommandError('invalid', `Recipe ${recipeId} is a component, not a dish`);
          }
        }
      }
      const sections: MenuSection[] = input.sections.map((section) => ({
        id: section.id ?? ids.next(),
        title: section.title,
        recipeIds: section.recipeIds,
      }));
      await storage.menuCards.put(
        MenuCardSchema.parse({ ...row, sections, updatedAt: clock.now() }),
      );
      await emit(businessId, 'menu.sections_changed', {
        cardId: row.id,
        sections: sections.length,
        dishes: seenDishes.size,
      });
      return { cardId: row.id };
    });
  };

  const duplicate: UseCase<'menu.duplicate'> = async (raw) => {
    const input = CONTRACT_V1['menu.duplicate'].input.parse(raw);
    return runCommand('menu.duplicate', input.commandId, async () => {
      const { businessId } = input;
      const row = await requireRow(storage.menuCards, businessId, input.cardId, 'Menu card');
      const { cards } = await loadBook(businessId);
      const name = copyName(cards, row.name);
      const cardId = ids.next();
      await storage.menuCards.add(
        MenuCardSchema.parse({
          id: cardId,
          businessId,
          ...stamps(),
          name,
          ...defined({ intro: row.intro, footer: row.footer }),
          sections: row.sections.map((section) => ({
            id: ids.next(),
            title: section.title,
            recipeIds: section.recipeIds,
          })),
          showPrices: row.showPrices,
          showPhotos: row.showPhotos,
          published: false,
        }),
      );
      await emit(businessId, 'menu.card_duplicated', { cardId, fromCardId: row.id });
      return { cardId, name };
    });
  };

  const remove: UseCase<'menu.delete'> = async (raw) => {
    const input = CONTRACT_V1['menu.delete'].input.parse(raw);
    return runCommand('menu.delete', input.commandId, async () => {
      const { businessId } = input;
      const row = await requireRow(storage.menuCards, businessId, input.cardId, 'Menu card');
      const now = clock.now();
      await storage.menuCards.put(MenuCardSchema.parse({ ...row, deletedAt: now, updatedAt: now }));
      await emit(businessId, 'menu.card_deleted', { cardId: row.id });
      return { cardId: row.id };
    });
  };

  return {
    'menu.list': list,
    'menu.get': get,
    'menu.published': published,
    'menu.guest': guest,
    'menu.allergenSheet': allergenSheet,
    'menu.export': exportCard,
    'menu.create': create,
    'menu.update': update,
    'menu.setPublished': setPublished,
    'menu.setSections': setSections,
    'menu.duplicate': duplicate,
    'menu.delete': remove,
  };
}
