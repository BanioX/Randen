import {
  CommandError,
  createCommandKit,
  requireRow,
  type AppContext,
  type UseCase,
} from '../../application/command';
import { CONTRACT_V1 } from '../../contract';
import { expiryInfo, mustNotUse } from '../../domain/expiry';
import { lineValue, roundQuantity } from '../../domain/units';
import type { Id } from '../../ids';
import { sumRappen } from '../../money';
import { ArticleSchema, type Article } from '../../model/article';
import type { StockLot } from '../../model/stock';
import {
  StorageAreaSchema,
  StorageSpotSchema,
  type StorageArea,
  type StorageSpot,
} from '../../model/storage-area';
import { alive } from '../../ports/storage';
import {
  areaRangeProposal,
  isAreaRangeProposal,
  TOUR_ARTICLE_NAMES,
  type AreaLot,
  type PlacedArticle,
  type StockPlace,
  type WhereArticleHit,
  type WhereMatch,
} from './contract';

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'de-CH');
const byOrder = (a: { sortOrder: number; name: string }, b: { sortOrder: number; name: string }) =>
  a.sortOrder - b.sortOrder || byName(a, b);

/** How many places a list may hold: the schema allows positions 0 to 999. */
const MAX_PLACES = 1000;
/** How many articles a search returns; a longer list helps nobody find one thing. */
const MAX_ARTICLE_HITS = 50;

/** «Entrecôte» is found by «entrecote», «Käse» by «KASE». */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('de-CH').trim();
}

/** Two names that a person would take for the same: case and outer blanks do not count. */
const nameKey = (name: string) => name.trim().toLocaleLowerCase('de-CH');

const MATCH_RANK: Record<WhereMatch, number> = { start: 0, word: 1, contains: 2 };

/**
 * How a name matches the typed words: every word must occur in it (case and accents ignored).
 * The name starting with the first typed word ranks first, a word of the name starting with
 * each typed word second, the rest third. Undefined when a word is missing.
 */
export function matchName(name: string, words: readonly string[]): WhereMatch | undefined {
  const folded = foldText(name);
  if (words.length === 0 || !words.every((word) => folded.includes(word))) {
    return undefined;
  }
  if (folded.startsWith(words[0] ?? '')) {
    return 'start';
  }
  const tokens = folded.split(/[^\p{L}\p{N}]+/u);
  return words.every((word) => tokens.some((token) => token.startsWith(word)))
    ? 'word'
    : 'contains';
}

const best = <TRow extends { match: WhereMatch; name: string }>(a: TRow, b: TRow) =>
  MATCH_RANK[a.match] - MATCH_RANK[b.match] || byName(a, b);

/** A row with optional fields left out where they are undefined (exactOptionalPropertyTypes). */
function defined<TObject extends Record<string, unknown>>(
  object: TObject,
): { [TKey in keyof TObject]?: Exclude<TObject[TKey], undefined> } {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined)) as {
    [TKey in keyof TObject]?: Exclude<TObject[TKey], undefined>;
  };
}

/** The facts of an area every view shows. */
function areaFacts(area: StorageArea) {
  return {
    id: area.id,
    name: area.name,
    kind: area.kind,
    ...defined({ minDeciC: area.minDeciC, maxDeciC: area.maxDeciC, photo: area.photo }),
    rangeIsProposal: isAreaRangeProposal(area.kind, area),
    sortOrder: area.sortOrder,
  };
}

/** Fields of an area and of a spot that a person changes; the order of the schema. */
const AREA_FIELDS = ['name', 'kind', 'minDeciC', 'maxDeciC', 'photo'] as const;
const SPOT_FIELDS = ['name', 'note', 'photo'] as const;

/** A row with a patch applied: a value replaces the field, null clears it, undefined leaves it. */
function patched(row: object, patch: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...row };
  for (const [field, value] of Object.entries(patch)) {
    if (value === null) {
      Reflect.deleteProperty(next, field);
    } else if (value !== undefined) {
      next[field] = value;
    }
  }
  return next;
}

const areaTag = (area: StorageArea) => ({ id: area.id, name: area.name, kind: area.kind });

/** Everything the reads of this module join, loaded once. */
interface Book {
  /** Live areas in their order. */
  areas: StorageArea[];
  areaById: Map<Id, StorageArea>;
  /** Live spots of live areas, in their order. */
  spots: StorageSpot[];
  spotById: Map<Id, StorageSpot>;
  /** Live, active articles: what lists show. */
  articles: Article[];
  /** Every article ever made, also deleted ones: lots keep their names. */
  allArticles: Map<Id, Article>;
  /** Active lots with something in them. */
  lots: StockLot[];
}

/** Use cases of «Wo ist was?»: areas, spots, the search and the tour. */
export function createAreasUseCases(ctx: AppContext) {
  const { storage, clock, ids } = ctx;
  const { emit, runCommand, stamps } = createCommandKit(ctx);

  async function loadBook(businessId: Id): Promise<Book> {
    const [areaRows, spotRows, articleRows, lotRows] = await Promise.all([
      storage.areas.ofBusiness(businessId),
      storage.spots.ofBusiness(businessId),
      storage.articles.ofBusiness(businessId),
      storage.lots.ofBusiness(businessId),
    ]);
    const areas = alive(areaRows).sort(byOrder);
    const areaById = new Map(areas.map((area) => [area.id, area]));
    const spots = alive(spotRows)
      .filter((spot) => areaById.has(spot.areaId))
      .sort(byOrder);
    return {
      areas,
      areaById,
      spots,
      spotById: new Map(spots.map((spot) => [spot.id, spot])),
      articles: alive(articleRows)
        .filter((article) => article.active)
        .sort(byName),
      allArticles: new Map(articleRows.map((article) => [article.id, article])),
      lots: alive(lotRows).filter((lot) => lot.status === 'active' && lot.quantity > 0),
    };
  }

  /** The live area an article belongs to, if any. */
  const homeOf = (article: Article, book: Book) =>
    article.areaId === undefined ? undefined : book.areaById.get(article.areaId);

  /** The live spot of an article, if it lies in the article's area. */
  function spotOf(article: Article, book: Book): StorageSpot | undefined {
    const spot = article.spotId === undefined ? undefined : book.spotById.get(article.spotId);
    return spot?.areaId === article.areaId ? spot : undefined;
  }

  /** Quantity of every article in every area: article → area → quantity. */
  function stockByArea(book: Book): Map<Id, Map<Id, number>> {
    const stock = new Map<Id, Map<Id, number>>();
    for (const lot of book.lots) {
      const areas = stock.get(lot.articleId) ?? new Map<Id, number>();
      areas.set(lot.areaId, roundQuantity((areas.get(lot.areaId) ?? 0) + lot.quantity));
      stock.set(lot.articleId, areas);
    }
    return stock;
  }

  const total = (areas: Map<Id, number> | undefined) =>
    roundQuantity([...(areas?.values() ?? [])].reduce((sum, quantity) => sum + quantity, 0));

  function placed(article: Article, areaId: Id, stock: Map<Id, Map<Id, number>>): PlacedArticle {
    const areas = stock.get(article.id);
    return {
      id: article.id,
      name: article.name,
      unit: article.unit,
      categoryId: article.categoryId,
      stockHere: areas?.get(areaId) ?? 0,
      stock: total(areas),
    };
  }

  // ---------------------------------------------------------------- reads

  const list: UseCase<'areas.list'> = async (raw) => {
    const input = CONTRACT_V1['areas.list'].input.parse(raw);
    const book = await loadBook(input.businessId);
    const areas = book.areas.map((area) => {
      const spots = book.spots.filter((spot) => spot.areaId === area.id);
      const lots = book.lots.filter((lot) => lot.areaId === area.id);
      return {
        ...areaFacts(area),
        spotCount: spots.length,
        spotsWithPhoto: spots.filter((spot) => spot.photo !== undefined).length,
        articleCount: book.articles.filter((article) => article.areaId === area.id).length,
        lotCount: lots.length,
        stockValueRappen: sumRappen(lots.map((lot) => lineValue(lot.quantity, lot.pricePer1000))),
        priceMissing: lots.some((lot) => lot.pricePer1000 === 0),
      };
    });
    const placedArticles = book.articles.filter((article) => homeOf(article, book) !== undefined);
    return {
      areas,
      totals: {
        spots: book.spots.length,
        spotsWithPhoto: book.spots.filter((spot) => spot.photo !== undefined).length,
        placedArticles: placedArticles.length,
        unplacedArticles: book.articles.length - placedArticles.length,
      },
    };
  };

  const get: UseCase<'areas.get'> = async (raw) => {
    const input = CONTRACT_V1['areas.get'].input.parse(raw);
    const area = await requireRow(storage.areas, input.businessId, input.areaId, 'Area');
    const book = await loadBook(input.businessId);
    const today = clock.today();
    const stock = stockByArea(book);
    const spots = book.spots.filter((spot) => spot.areaId === area.id);
    const home = book.articles.filter((article) => article.areaId === area.id);
    const lots = book.lots.filter((lot) => lot.areaId === area.id);

    const lotViews = lots
      .map((lot): AreaLot => {
        const article = book.allArticles.get(lot.articleId);
        const info = expiryInfo(lot.expiresOn, lot.dateKind, today);
        const atHome = article?.areaId === area.id;
        const spot = article !== undefined && atHome ? spotOf(article, book) : undefined;
        const home = article === undefined || atHome ? undefined : homeOf(article, book);
        return {
          lotId: lot.id,
          articleId: lot.articleId,
          articleName: article?.name ?? '',
          unit: article?.unit ?? 'pcs',
          quantity: lot.quantity,
          valueRappen: lineValue(lot.quantity, lot.pricePer1000),
          ...defined({
            expiresOn: lot.expiresOn,
            daysLeft: info.daysLeft,
            spotName: spot?.name,
            homeAreaName: home?.name,
          }),
          dateKind: lot.dateKind,
          status: info.status,
          mustNotUse: mustNotUse(lot.expiresOn, lot.dateKind, today),
          awayFromHome: !atHome,
        };
      })
      .sort(
        (a, b) =>
          (a.expiresOn ?? '9999-12-31').localeCompare(b.expiresOn ?? '9999-12-31') ||
          a.articleName.localeCompare(b.articleName, 'de-CH'),
      );

    return {
      area: areaFacts(area),
      spots: spots.map((spot) => ({
        id: spot.id,
        areaId: spot.areaId,
        name: spot.name,
        ...defined({ note: spot.note, photo: spot.photo }),
        sortOrder: spot.sortOrder,
        articles: home
          .filter((article) => spotOf(article, book)?.id === spot.id)
          .map((article) => placed(article, area.id, stock)),
      })),
      unplaced: home
        .filter((article) => spotOf(article, book) === undefined)
        .map((article) => placed(article, area.id, stock)),
      lots: lotViews,
      totals: {
        lotCount: lots.length,
        stockValueRappen: sumRappen(lotViews.map((lot) => lot.valueRappen)),
        priceMissing: lots.some((lot) => lot.pricePer1000 === 0),
        articleCount: home.length,
        spotsWithPhoto: spots.filter((spot) => spot.photo !== undefined).length,
      },
    };
  };

  const search: UseCase<'where.search'> = async (raw) => {
    const input = CONTRACT_V1['where.search'].input.parse(raw);
    const book = await loadBook(input.businessId);
    const words = foldText(input.text)
      .split(/\s+/)
      .filter((word) => word !== '');
    const articleCount = (test: (article: Article) => boolean) => book.articles.filter(test).length;

    if (words.length === 0) {
      return {
        articles: [],
        spots: [],
        areas: [],
        browse: book.areas.map((area) => ({
          areaId: area.id,
          name: area.name,
          kind: area.kind,
          ...defined({ photo: area.photo }),
          articleCount: articleCount((article) => article.areaId === area.id),
          spots: book.spots
            .filter((spot) => spot.areaId === area.id)
            .map((spot) => ({
              spotId: spot.id,
              name: spot.name,
              ...defined({ note: spot.note, photo: spot.photo }),
              articleCount: articleCount((article) => spotOf(article, book)?.id === spot.id),
            })),
        })),
      };
    }

    const stock = stockByArea(book);
    const articles: WhereArticleHit[] = [];
    for (const article of book.articles) {
      const match = matchName(article.name, words);
      if (match === undefined) {
        continue;
      }
      const home = homeOf(article, book);
      const spot = spotOf(article, book);
      const areas = stock.get(article.id);
      const stockPlaces: StockPlace[] = book.areas.flatMap((area) => {
        const quantity = areas?.get(area.id);
        return quantity === undefined
          ? []
          : [{ areaId: area.id, areaName: area.name, areaKind: area.kind, quantity }];
      });
      articles.push({
        articleId: article.id,
        name: article.name,
        unit: article.unit,
        categoryId: article.categoryId,
        match,
        ...(home === undefined ? {} : { area: areaTag(home) }),
        ...(spot === undefined
          ? {}
          : {
              spot: {
                id: spot.id,
                name: spot.name,
                ...defined({ note: spot.note, photo: spot.photo }),
              },
            }),
        stock: total(areas),
        stockPlaces,
        stockElsewhere: stockPlaces.some((place) => place.areaId !== home?.id),
      });
    }

    const spots = book.spots.flatMap((spot) => {
      const match = matchName(spot.name, words);
      const area = book.areaById.get(spot.areaId);
      if (match === undefined || area === undefined) {
        return [];
      }
      return [
        {
          spotId: spot.id,
          name: spot.name,
          ...defined({ note: spot.note, photo: spot.photo }),
          area: areaTag(area),
          articleCount: articleCount((article) => spotOf(article, book)?.id === spot.id),
          match,
        },
      ];
    });

    const areas = book.areas.flatMap((area) => {
      const match = matchName(area.name, words);
      return match === undefined
        ? []
        : [
            {
              areaId: area.id,
              name: area.name,
              kind: area.kind,
              ...defined({ photo: area.photo }),
              spotCount: book.spots.filter((spot) => spot.areaId === area.id).length,
              articleCount: articleCount((article) => article.areaId === area.id),
              match,
            },
          ];
    });

    return {
      articles: articles.sort(best).slice(0, MAX_ARTICLE_HITS),
      spots: spots.sort(best),
      areas: areas.sort(best),
      browse: [],
    };
  };

  const tour: UseCase<'tour.get'> = async (raw) => {
    const input = CONTRACT_V1['tour.get'].input.parse(raw);
    const book = await loadBook(input.businessId);
    const names = (articles: readonly Article[]) =>
      articles.slice(0, TOUR_ARTICLE_NAMES).map((article) => article.name);
    const areas = book.areas.map((area) => {
      const home = book.articles.filter((article) => article.areaId === area.id);
      const unplaced = home.filter((article) => spotOf(article, book) === undefined);
      return {
        ...areaFacts(area),
        spots: book.spots
          .filter((spot) => spot.areaId === area.id)
          .map((spot) => {
            const here = home.filter((article) => spotOf(article, book)?.id === spot.id);
            return {
              spotId: spot.id,
              name: spot.name,
              ...defined({ note: spot.note, photo: spot.photo }),
              articleNames: names(here),
              articleCount: here.length,
            };
          }),
        unplacedNames: names(unplaced),
        unplacedCount: unplaced.length,
      };
    });
    return {
      areas,
      counts: {
        areas: book.areas.length,
        spots: book.spots.length,
        spotsWithPhoto: book.spots.filter((spot) => spot.photo !== undefined).length,
      },
    };
  };

  // ------------------------------------------------------------ commands

  function assertFreeName(
    rows: readonly { id: Id; name: string }[],
    name: string,
    except?: Id,
  ): void {
    const key = nameKey(name);
    if (rows.some((row) => row.id !== except && nameKey(row.name) === key)) {
      throw new CommandError('duplicate_name', `The name «${name}» is taken`);
    }
  }

  function assertRange(minDeciC: number | undefined, maxDeciC: number | undefined): void {
    if (minDeciC !== undefined && maxDeciC !== undefined && minDeciC > maxDeciC) {
      throw new CommandError('invalid', 'The lowest temperature is above the highest');
    }
  }

  /** `row` put at `position` among `others`, which are in order; past the end means last. */
  function placeAt<TRow>(others: readonly TRow[], row: TRow, position: number): TRow[] {
    const order = [...others];
    order.splice(Math.min(position, order.length), 0, row);
    return order;
  }

  /** Refuses a further place in a list that is full: positions run from 0 to 999. */
  function assertRoom(count: number): void {
    if (count >= MAX_PLACES) {
      throw new CommandError('invalid', `A list holds at most ${String(MAX_PLACES)} places`);
    }
  }

  /**
   * Writes positions 0, 1, 2 … in the given order: every row whose position changed, and
   * `dirty` (a new or changed row) in any case. True when a position changed.
   */
  async function writeOrder<TRow extends { sortOrder: number }>(
    order: readonly TRow[],
    write: (row: TRow) => Promise<void>,
    dirty?: TRow,
  ): Promise<boolean> {
    const now = clock.now();
    let moved = false;
    for (const [index, row] of order.entries()) {
      if (row.sortOrder !== index) {
        moved = true;
      }
      if (row === dirty || row.sortOrder !== index) {
        await write({ ...row, sortOrder: index, updatedAt: now });
      }
    }
    return moved;
  }

  const putArea = (row: StorageArea) => storage.areas.put(StorageAreaSchema.parse(row));
  const putSpot = (row: StorageSpot) => storage.spots.put(StorageSpotSchema.parse(row));

  /** The article at a new place: only `areaId` and `spotId` change. */
  async function moveArticle(article: Article, areaId: Id | undefined, spotId: Id | undefined) {
    const next: Record<string, unknown> = { ...article, updatedAt: clock.now() };
    Reflect.deleteProperty(next, 'areaId');
    Reflect.deleteProperty(next, 'spotId');
    await storage.articles.put(ArticleSchema.parse({ ...next, ...defined({ areaId, spotId }) }));
  }

  const liveAreas = async (businessId: Id) =>
    alive(await storage.areas.ofBusiness(businessId)).sort(byOrder);
  const liveSpotsOf = async (businessId: Id, areaId: Id) =>
    alive(await storage.spots.ofBusiness(businessId))
      .filter((spot) => spot.areaId === areaId)
      .sort(byOrder);

  const createArea: UseCase<'areas.create'> = async (raw) => {
    const input = CONTRACT_V1['areas.create'].input.parse(raw);
    return runCommand('areas.create', input.commandId, async () => {
      const { businessId } = input;
      const areas = await liveAreas(businessId);
      assertFreeName(areas, input.name);
      assertRoom(areas.length);
      const proposal = areaRangeProposal(input.kind);
      // Left out: the guideline of the kind. Null: the person decided there is no limit.
      const minDeciC =
        input.minDeciC === undefined ? proposal.minDeciC : (input.minDeciC ?? undefined);
      const maxDeciC =
        input.maxDeciC === undefined ? proposal.maxDeciC : (input.maxDeciC ?? undefined);
      assertRange(minDeciC, maxDeciC);
      const area = StorageAreaSchema.parse({
        id: ids.next(),
        businessId,
        ...stamps(),
        name: input.name,
        kind: input.kind,
        ...defined({ minDeciC, maxDeciC, photo: input.photo }),
        sortOrder: areas.length,
      });
      await storage.areas.add(area);
      await writeOrder(placeAt(areas, area, input.sortOrder ?? areas.length), putArea);
      await emit(businessId, 'area.created', { areaId: area.id, kind: area.kind });
      return { areaId: area.id };
    });
  };

  const updateArea: UseCase<'areas.update'> = async (raw) => {
    const input = CONTRACT_V1['areas.update'].input.parse(raw);
    return runCommand('areas.update', input.commandId, async () => {
      const { businessId, areaId } = input;
      const row = await requireRow(storage.areas, businessId, areaId, 'Area');
      const candidate = StorageAreaSchema.parse(
        patched(row, {
          name: input.name,
          kind: input.kind,
          minDeciC: input.minDeciC,
          maxDeciC: input.maxDeciC,
          photo: input.photo,
        }),
      );
      const fields = AREA_FIELDS.filter((field) => candidate[field] !== row[field]);
      const areas = await liveAreas(businessId);
      if (fields.includes('name')) {
        assertFreeName(areas, candidate.name, row.id);
      }
      assertRange(candidate.minDeciC, candidate.maxDeciC);
      const updated = StorageAreaSchema.parse({ ...candidate, updatedAt: clock.now() });
      const others = areas.filter((area) => area.id !== row.id);
      const current = areas.findIndex((area) => area.id === row.id);
      const order = placeAt(others, updated, input.sortOrder ?? current);
      const moved = order.indexOf(updated) !== current;
      if (fields.length === 0 && !moved) {
        return { areaId, changed: [] };
      }
      await writeOrder(order, putArea, fields.length > 0 ? updated : undefined);
      const changed = moved ? [...fields, 'sortOrder'] : fields;
      await emit(businessId, 'area.updated', { areaId, fields: changed });
      return { areaId, changed };
    });
  };

  const deleteArea: UseCase<'areas.delete'> = async (raw) => {
    const input = CONTRACT_V1['areas.delete'].input.parse(raw);
    return runCommand('areas.delete', input.commandId, async () => {
      const { businessId, areaId } = input;
      const row = await requireRow(storage.areas, businessId, areaId, 'Area');
      const lots = alive(await storage.lots.ofBusiness(businessId)).filter(
        (lot) => lot.areaId === areaId && lot.status === 'active' && lot.quantity > 0,
      );
      if (lots.length > 0) {
        throw new CommandError('in_use', `${String(lots.length)} lots still lie in the area`);
      }
      const now = clock.now();
      const spots = await liveSpotsOf(businessId, areaId);
      for (const spot of spots) {
        await putSpot({ ...spot, deletedAt: now, updatedAt: now });
      }
      const spotIds = new Set<Id>(spots.map((spot) => spot.id));
      const articles = alive(await storage.articles.ofBusiness(businessId)).filter(
        (article) =>
          article.areaId === areaId ||
          (article.spotId !== undefined && spotIds.has(article.spotId)),
      );
      for (const article of articles) {
        await moveArticle(article, undefined, undefined);
      }
      await putArea({ ...row, deletedAt: now, updatedAt: now });
      await writeOrder(
        (await liveAreas(businessId)).filter((area) => area.id !== areaId),
        putArea,
      );
      await emit(businessId, 'area.deleted', {
        areaId,
        spotsRemoved: spots.length,
        articlesCleared: articles.length,
      });
      return { areaId, spotsRemoved: spots.length, articlesCleared: articles.length };
    });
  };

  const reorder: UseCase<'areas.reorder'> = async (raw) => {
    const input = CONTRACT_V1['areas.reorder'].input.parse(raw);
    return runCommand('areas.reorder', input.commandId, async () => {
      const { businessId } = input;
      const named = new Set<Id>(input.areaIds);
      if (named.size !== input.areaIds.length) {
        throw new CommandError('invalid', 'An area is named twice');
      }
      const first: StorageArea[] = [];
      for (const areaId of input.areaIds) {
        first.push(await requireRow(storage.areas, businessId, areaId, 'Area'));
      }
      const rest = (await liveAreas(businessId)).filter((area) => !named.has(area.id));
      const order = [...first, ...rest];
      if (await writeOrder(order, putArea)) {
        await emit(businessId, 'area.reordered', { areaIds: order.map((area) => area.id) });
      }
      return { areaIds: order.map((area) => area.id) };
    });
  };

  const createSpot: UseCase<'spots.create'> = async (raw) => {
    const input = CONTRACT_V1['spots.create'].input.parse(raw);
    return runCommand('spots.create', input.commandId, async () => {
      const { businessId, areaId } = input;
      await requireRow(storage.areas, businessId, areaId, 'Area');
      const siblings = await liveSpotsOf(businessId, areaId);
      assertFreeName(siblings, input.name);
      assertRoom(siblings.length);
      const spot = StorageSpotSchema.parse({
        id: ids.next(),
        businessId,
        ...stamps(),
        areaId,
        name: input.name,
        ...defined({ note: input.note, photo: input.photo }),
        sortOrder: siblings.length,
      });
      await storage.spots.add(spot);
      await writeOrder(placeAt(siblings, spot, input.sortOrder ?? siblings.length), putSpot);
      await emit(businessId, 'spot.created', {
        spotId: spot.id,
        areaId,
        withPhoto: spot.photo !== undefined,
      });
      return { spotId: spot.id };
    });
  };

  const updateSpot: UseCase<'spots.update'> = async (raw) => {
    const input = CONTRACT_V1['spots.update'].input.parse(raw);
    return runCommand('spots.update', input.commandId, async () => {
      const { businessId, spotId } = input;
      const row = await requireRow(storage.spots, businessId, spotId, 'Spot');
      const candidate = StorageSpotSchema.parse(
        patched(row, { name: input.name, note: input.note, photo: input.photo }),
      );
      const fields = SPOT_FIELDS.filter((field) => candidate[field] !== row[field]);
      const siblings = await liveSpotsOf(businessId, row.areaId);
      if (fields.includes('name')) {
        assertFreeName(siblings, candidate.name, row.id);
      }
      const updated = StorageSpotSchema.parse({ ...candidate, updatedAt: clock.now() });
      const current = siblings.findIndex((spot) => spot.id === row.id);
      const others = siblings.filter((spot) => spot.id !== row.id);
      const order = placeAt(others, updated, input.sortOrder ?? current);
      const moved = order.indexOf(updated) !== current;
      if (fields.length === 0 && !moved) {
        return { spotId, changed: [] };
      }
      await writeOrder(order, putSpot, fields.length > 0 ? updated : undefined);
      const changed = moved ? [...fields, 'sortOrder'] : fields;
      await emit(businessId, 'spot.updated', { spotId, areaId: row.areaId, fields: changed });
      return { spotId, changed };
    });
  };

  const deleteSpot: UseCase<'spots.delete'> = async (raw) => {
    const input = CONTRACT_V1['spots.delete'].input.parse(raw);
    return runCommand('spots.delete', input.commandId, async () => {
      const { businessId, spotId } = input;
      const row = await requireRow(storage.spots, businessId, spotId, 'Spot');
      const articles = alive(await storage.articles.ofBusiness(businessId)).filter(
        (article) => article.spotId === spotId,
      );
      for (const article of articles) {
        await moveArticle(article, article.areaId, undefined);
      }
      const now = clock.now();
      await putSpot({ ...row, deletedAt: now, updatedAt: now });
      await writeOrder(
        (await liveSpotsOf(businessId, row.areaId)).filter((spot) => spot.id !== spotId),
        putSpot,
      );
      await emit(businessId, 'spot.deleted', {
        spotId,
        areaId: row.areaId,
        articlesCleared: articles.length,
      });
      return { spotId, articlesCleared: articles.length };
    });
  };

  const assign: UseCase<'spots.assign'> = async (raw) => {
    const input = CONTRACT_V1['spots.assign'].input.parse(raw);
    return runCommand('spots.assign', input.commandId, async () => {
      const { businessId, areaId, spotId } = input;
      await requireRow(storage.areas, businessId, areaId, 'Area');
      if (spotId !== null) {
        const spot = await requireRow(storage.spots, businessId, spotId, 'Spot');
        if (spot.areaId !== areaId) {
          throw new CommandError('invalid', 'The spot is not in this storage area');
        }
      }
      const listed = [...new Set(input.articleIds)];
      const articles = [];
      for (const articleId of listed) {
        articles.push(await requireRow(storage.articles, businessId, articleId, 'Article'));
      }
      const target = spotId ?? undefined;
      const atTarget = (article: Article) => article.areaId === areaId && article.spotId === target;

      let placedCount = 0;
      for (const article of articles) {
        if (!atTarget(article)) {
          await moveArticle(article, areaId, target);
          placedCount += 1;
        }
      }
      let released = 0;
      if (input.replace) {
        const keep = new Set<Id>(listed);
        const leaving = alive(await storage.articles.ofBusiness(businessId)).filter(
          // Inactive articles are hidden everywhere; a list that cannot show them leaves them.
          (article) => article.active && atTarget(article) && !keep.has(article.id),
        );
        for (const article of leaving) {
          // Off the spot it stays in the area; out of the area it has no place any more.
          await moveArticle(article, spotId === null ? undefined : areaId, undefined);
          released += 1;
        }
      }
      if (placedCount > 0 || released > 0) {
        await emit(businessId, 'spot.articles_assigned', {
          areaId,
          spotId,
          articleIds: listed,
          placed: placedCount,
          released,
        });
      }
      return { placed: placedCount, released };
    });
  };

  return {
    'areas.list': list,
    'areas.get': get,
    'areas.create': createArea,
    'areas.update': updateArea,
    'areas.delete': deleteArea,
    'areas.reorder': reorder,
    'spots.create': createSpot,
    'spots.update': updateSpot,
    'spots.delete': deleteSpot,
    'spots.assign': assign,
    'where.search': search,
    'tour.get': tour,
  };
}
