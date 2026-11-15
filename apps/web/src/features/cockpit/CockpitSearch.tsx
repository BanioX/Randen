import { courseLabel, formatQuantity, type CockpitSearch as SearchResult } from '@randen/core';
import { BookOpen, MapPin, Store, Tags, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useMoney, useQuery } from '../../app/hooks';
import { paths } from '../../app/paths';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { SearchField } from '../../ui/SearchField';
import { Section } from '../../ui/Section';
import { cockpitMessages } from './messages';

const t = cockpitMessages.search;

interface Hit {
  id: string;
  title: string;
  subtitle: string;
  to: string;
}

/** The last result while the next one is computed, so the list does not flicker under the fingers. */
function useKept<TValue>(value: TValue | undefined): TValue | undefined {
  const [kept, setKept] = useState(value);
  if (value !== undefined && value !== kept) {
    setKept(value);
  }
  return value ?? kept;
}

/**
 * One field for the whole business: articles, recipes, suppliers and spots whose name holds
 * every typed word. The text lives in the address (`?q=`), so «Zurück» shows the same hits.
 * Plätze belong to «Wo ist was?» (ADR-0015) and show only where the business uses it.
 */
export function CockpitSearch({
  text,
  onText,
  places,
}: {
  text: string;
  onText: (text: string) => void;
  places: boolean;
}) {
  const money = useMoney();
  const typed = text.trim();
  const live = useQuery('cockpit.search', { text: typed }, { enabled: typed !== '' });
  const result = useKept(live);

  function groups(
    data: SearchResult,
  ): { kind: keyof typeof t.groups; icon: LucideIcon; hits: Hit[] }[] {
    return [
      {
        kind: 'articles',
        icon: Tags,
        hits: data.articles.map((row) => ({
          id: row.id,
          title: row.name,
          subtitle: [
            row.stock > 0 ? t.inStock(formatQuantity(row.stock, row.unit)) : t.noStock,
            row.areaName,
            row.spotName,
          ]
            .filter((part) => part !== undefined)
            .join(' · '),
          to: paths.article(row.id),
        })),
      },
      {
        kind: 'recipes',
        icon: BookOpen,
        hits: data.recipes.map((row) => ({
          id: row.id,
          title: row.name,
          subtitle: [
            row.kind === 'component' ? t.component : courseLabel(row.course),
            row.priceRappen === undefined ? undefined : money.format(row.priceRappen),
          ]
            .filter((part) => part !== undefined)
            .join(' · '),
          to: paths.recipe(row.id),
        })),
      },
      {
        kind: 'suppliers',
        icon: Store,
        hits: data.suppliers.map((row) => ({
          id: row.id,
          title: row.name,
          subtitle:
            row.kind === 'market'
              ? `${t.market} · ${t.articleCount(row.articleCount)}`
              : t.articleCount(row.articleCount),
          to: paths.supplier(row.id),
        })),
      },
      {
        kind: 'spots',
        icon: MapPin,
        hits: places
          ? data.spots.map((row) => ({
              id: row.id,
              title: row.name,
              subtitle: `${row.areaName} · ${t.articleCount(row.articleCount)}`,
              to: paths.area(row.areaId),
            }))
          : [],
      },
    ];
  }

  const shown = result === undefined || typed === '' ? [] : groups(result);
  const count = shown.reduce((sum, group) => sum + group.hits.length, 0);
  const total =
    places || result === undefined ? (result?.total ?? 0) : result.total - result.spots.length;

  return (
    <div className="space-y-4">
      <SearchField
        label={t.label}
        hideLabel
        placeholder={t.placeholder}
        value={text}
        onChange={onText}
        className="md:max-w-md"
      />
      {typed === '' || result === undefined ? null : (
        <div role="region" aria-label={t.results} className="space-y-4">
          {count === 0 ? (
            <p className="px-4 text-ink-muted">{t.none(typed)}</p>
          ) : (
            shown
              .filter((group) => group.hits.length > 0)
              .map((group) => (
                <Section key={group.kind} title={t.groups[group.kind]} titleStyle="group">
                  <GroupedList>
                    {group.hits.map((hit) => (
                      <ListRow
                        key={hit.id}
                        title={hit.title}
                        subtitle={hit.subtitle}
                        icon={group.icon}
                        to={hit.to}
                      />
                    ))}
                  </GroupedList>
                </Section>
              ))
          )}
          {total > count ? (
            <p className="px-4 text-sm text-ink-muted">{t.more(count, total)}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
