import { formatQuantity, type WhereArticleHit, type WhereBrowseArea } from '@randen/core';
import { ChevronRight, MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '../../app/hooks';
import { paths } from '../../app/paths';
import { AreaBadge, areaLooks } from '../../ui/badges';
import { Card } from '../../ui/Card';
import { DishPhoto } from '../../ui/DishPhoto';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { PageHeader } from '../../ui/PageHeader';
import { ZoomablePhoto } from '../../ui/PhotoViewer';
import { SearchField } from '../../ui/SearchField';
import { Section } from '../../ui/Section';
import { areasMessages } from './messages';
import { useKept } from './shared';

const t = areasMessages.where;
const c = areasMessages.counts;

/** The id of the search field, to put the cursor there when the page opens empty. */
const SEARCH_ID = 'where-search';

const LINK =
  '-my-2 inline-flex min-h-11 items-center gap-0.5 rounded-lg font-semibold text-wine-800 hover:underline';

/** A small picture of a spot for a row: its photo, or a quiet pin. */
function SpotThumb({ photo }: { photo?: string | undefined }) {
  return <DishPhoto photo={photo} alt="" icon={MapPin} radius="md" className="size-12" />;
}

/** One article found: where it belongs, the photo of its spot, and where its stock lies now. */
function ArticleHit({ hit }: { hit: WhereArticleHit }) {
  const quantity = (value: number) => formatQuantity(value, hit.unit);
  return (
    <li className="flex min-w-0 flex-col rounded-2xl bg-surface p-4 shadow-card">
      <h3 className="text-xl leading-snug font-semibold break-words hyphens-calm">{hit.name}</h3>
      <p className="mt-1 flex items-start gap-1.5 font-medium">
        <MapPin size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-wine-800" />
        <span className="min-w-0 break-words">
          {hit.area === undefined
            ? t.noPlace
            : hit.spot === undefined
              ? t.areaOnly(hit.area.name)
              : t.place(hit.area.name, hit.spot.name)}
        </span>
      </p>
      {hit.spot?.note === undefined ? null : (
        <p className="mt-1 text-[0.9375rem] whitespace-pre-line text-ink-muted">{hit.spot.note}</p>
      )}
      {hit.spot?.photo === undefined || hit.area === undefined ? null : (
        <ZoomablePhoto
          src={hit.spot.photo}
          title={t.photo(hit.spot.name, hit.area.name)}
          className="mt-3 aspect-video"
        />
      )}
      <div className="mt-3 flex-1 space-y-1 text-[0.9375rem]">
        <p className="tabular-nums">{hit.stock > 0 ? t.stock(quantity(hit.stock)) : t.noStock}</p>
        {hit.stockElsewhere && hit.stockPlaces.length > 0 ? (
          <p className="text-ink-muted tabular-nums">
            {t.liesNow(
              hit.stockPlaces
                .map((place) => t.placeQuantity(place.areaName, quantity(place.quantity)))
                .join(', '),
            )}
          </p>
        ) : null}
        {hit.spot === undefined ? (
          <p className="text-ink-muted">
            {hit.area === undefined ? null : `${t.noSpot} `}
            <Link to={paths.articleEdit(hit.articleId)} className={LINK}>
              {t.setPlace}
              <span className="sr-only">, {hit.name}</span>
            </Link>
          </p>
        ) : null}
      </div>
      {hit.area === undefined ? null : (
        <div className="mt-3 border-t border-line pt-2">
          <Link to={paths.area(hit.area.id)} className={LINK}>
            {t.openArea(hit.area.name)}
            <ChevronRight size={18} aria-hidden="true" className="shrink-0" />
          </Link>
        </div>
      )}
    </li>
  );
}

/** Before anything is typed: every area with its spots, to look around. */
function Browse({ areas }: { areas: readonly WhereBrowseArea[] }) {
  return (
    <div className="space-y-6 md:grid md:grid-cols-2 md:items-start md:gap-4 md:space-y-0 lg:grid-cols-3">
      {areas.map((area) => (
        <Section
          key={area.areaId}
          title={area.name}
          titleStyle="group"
          action={{ label: t.openArea(area.name), to: paths.area(area.areaId) }}
        >
          <GroupedList>
            {area.spots.length === 0 ? (
              <ListRow
                title={t.wholeArea}
                subtitle={`${t.noSpots} · ${c.articles(area.articleCount)}`}
                icon={areaLooks[area.kind].icon}
                iconTone={areaLooks[area.kind].tone}
                to={paths.area(area.areaId)}
              />
            ) : (
              area.spots.map((spot) => (
                <ListRow
                  key={spot.spotId}
                  title={spot.name}
                  subtitle={spot.note}
                  meta={c.articles(spot.articleCount)}
                  picture={<SpotThumb photo={spot.photo} />}
                  to={paths.area(area.areaId)}
                />
              ))
            )}
          </GroupedList>
        </Section>
      ))}
    </div>
  );
}

/**
 * «Wo ist was?»: the answer while typing. Each article shows where it belongs with the photo of
 * its spot, large on a tap, and where its stock really lies. The text lives in the address, so
 * «Zurück» from an area shows the same hits.
 */
export function WherePage() {
  const [params, setParams] = useSearchParams();
  const text = (params.get('q') ?? '').slice(0, 120);
  const data = useKept(useQuery('where.search', { text }));

  // Opened without a text: the cursor waits in the field. Only when the page opens.
  const [startsEmpty] = useState(text === '');
  useEffect(() => {
    if (startsEmpty) {
      document.getElementById(SEARCH_ID)?.focus();
    }
  }, [startsEmpty]);

  function setText(value: string) {
    const next = new URLSearchParams(params);
    if (value === '') {
      next.delete('q');
    } else {
      next.set('q', value);
    }
    setParams(next, { replace: true });
  }

  const typed = text.trim() !== '';
  const hits =
    data === undefined ? 0 : data.articles.length + data.spots.length + data.areas.length;

  return (
    <>
      <PageHeader title={t.title} back={{ to: paths.areas(), label: t.back }} />
      <div role="search" className="mb-6">
        <SearchField
          id={SEARCH_ID}
          label={t.search}
          placeholder={t.placeholder}
          value={text}
          onChange={setText}
          hint={typed ? undefined : t.startHint}
        />
      </div>

      {data === undefined ? null : !typed ? (
        <Browse areas={data.browse} />
      ) : hits === 0 ? (
        <Card>
          <p className="font-semibold">{t.noHits(text.trim())}</p>
          <p className="mt-1 text-ink-muted">{t.noHitsHint}</p>
          <p className="mt-3">
            <Link to={paths.articles()} className={LINK}>
              {t.toArticles}
              <ChevronRight size={18} aria-hidden="true" className="shrink-0" />
            </Link>
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {data.articles.length === 0 ? null : (
            <Section title={t.articles}>
              <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {data.articles.map((hit) => (
                  <ArticleHit key={hit.articleId} hit={hit} />
                ))}
              </ul>
            </Section>
          )}
          <div className="space-y-6 md:grid md:grid-cols-2 md:items-start md:gap-4 md:space-y-0">
            {data.spots.length === 0 ? null : (
              <Section title={t.spots}>
                <GroupedList>
                  {data.spots.map((spot) => (
                    <ListRow
                      key={spot.spotId}
                      title={spot.name}
                      subtitle={t.spotMeta(spot.area.name, c.articles(spot.articleCount))}
                      meta={spot.note}
                      picture={<SpotThumb photo={spot.photo} />}
                      to={paths.area(spot.area.id)}
                    />
                  ))}
                </GroupedList>
              </Section>
            )}
            {data.areas.length === 0 ? null : (
              <Section title={t.areas}>
                <GroupedList>
                  {data.areas.map((area) => (
                    <ListRow
                      key={area.areaId}
                      title={area.name}
                      subtitle={c.and(c.spots(area.spotCount), c.articles(area.articleCount))}
                      meta={<AreaBadge kind={area.kind} size="sm" />}
                      picture={
                        area.photo === undefined ? undefined : <SpotThumb photo={area.photo} />
                      }
                      icon={areaLooks[area.kind].icon}
                      iconTone={areaLooks[area.kind].tone}
                      to={paths.area(area.areaId)}
                    />
                  ))}
                </GroupedList>
              </Section>
            )}
          </div>
        </div>
      )}
    </>
  );
}
