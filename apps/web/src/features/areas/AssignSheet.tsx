import { formatQuantity, type ArticleRef, type Id } from '@randen/core';
import { useState } from 'react';
import { errorText, useCommand, useQuery } from '../../app/hooks';
import { Checkbox } from '../../ui/Checkbox';
import { FormActions } from '../../ui/FormActions';
import { GroupedList, GroupedListItem } from '../../ui/GroupedList';
import { SearchField } from '../../ui/SearchField';
import { Sheet } from '../../ui/Sheet';
import { useToast } from '../../ui/Toast';
import { areasMessages } from './messages';

const t = areasMessages.assign;

/** Where the articles go: a spot, or the area itself without a spot. */
export interface AssignTarget {
  areaId: Id;
  areaName: string;
  /** Null: into the area, without a spot. */
  spotId: Id | null;
  spotName?: string | undefined;
}

/** «Entrecôte» is found by «entrecote», «Käse» by «KASE». */
const fold = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('de-CH').trim();

/**
 * «Artikel zuweisen»: every article with a box to tick, searchable. What is ticked lies at the
 * target after saving; what was there and is no longer ticked leaves it (`replace`).
 */
export function AssignSheet({
  target,
  onClose,
}: {
  /** Null keeps the sheet closed. */
  target: AssignTarget | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      title={
        target === null
          ? ''
          : target.spotId === null
            ? t.titleArea(target.areaName)
            : t.titleSpot(target.spotName ?? '')
      }
    >
      {target === null ? null : <AssignForm target={target} onClose={onClose} />}
    </Sheet>
  );
}

function AssignForm({ target, onClose }: { target: AssignTarget; onClose: () => void }) {
  const run = useCommand();
  const toast = useToast();
  const articles = useQuery('lookup.articles', {})?.articles;
  const areas = useQuery('lookup.areas', {})?.areas;
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<Set<Id> | null>(null);
  const [order, setOrder] = useState<ArticleRef[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const atTarget = (article: ArticleRef) =>
    article.areaId === target.areaId && (article.spotId ?? null) === target.spotId;

  // Once the articles are there: what lies at the target first, then the rest of the area,
  // then everything else. The order stays while boxes are ticked, so no row jumps away.
  if (articles !== undefined && order === null) {
    const rank = (article: ArticleRef) =>
      atTarget(article) ? 0 : article.areaId === target.areaId ? 1 : 2;
    setOrder([...articles].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)));
    setChosen(new Set(articles.filter(atTarget).map((article) => article.id)));
  }

  const areaById = new Map((areas ?? []).map((area) => [area.id, area]));
  function placeOf(article: ArticleRef): string {
    const area = article.areaId === undefined ? undefined : areaById.get(article.areaId);
    if (area === undefined) {
      return t.noPlace;
    }
    const spot = area.spots.find((each) => each.id === article.spotId);
    return spot === undefined ? t.areaOnly(area.name) : t.place(area.name, spot.name);
  }

  const words = fold(search).split(/\s+/).filter(Boolean);
  const shown = (order ?? []).filter((article) => {
    const name = fold(article.name);
    return words.every((word) => name.includes(word));
  });
  const count = chosen?.size ?? 0;
  const targetName = target.spotId === null ? t.areaOnly(target.areaName) : (target.spotName ?? '');

  function toggle(id: Id, on: boolean) {
    const next = new Set(chosen);
    if (on) {
      next.add(id);
    } else {
      next.delete(id);
    }
    setChosen(next);
  }

  async function save() {
    if (chosen === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await run('spots.assign', {
        areaId: target.areaId,
        spotId: target.spotId,
        articleIds: [...chosen],
        replace: true,
      });
      toast({
        text:
          result.placed + result.released === 0
            ? t.unchanged
            : t.done(targetName, areasMessages.counts.articles(chosen.size)),
      });
      onClose();
    } catch (failure) {
      setBusy(false);
      setError(errorText(failure));
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-ink-muted">{target.spotId === null ? t.hintArea : t.hintSpot}</p>
      {order === null ? (
        <p className="text-ink-muted">{t.loading}</p>
      ) : order.length === 0 ? (
        <p className="text-ink-muted">{t.empty}</p>
      ) : (
        <>
          <SearchField label={t.search} value={search} onChange={setSearch} hideLabel />
          {shown.length === 0 ? (
            <p className="text-ink-muted">{t.noMatch}</p>
          ) : (
            <GroupedList label={t.search}>
              {shown.map((article) => (
                <GroupedListItem key={article.id} inset="check">
                  <div className="px-4">
                    <Checkbox
                      label={article.name}
                      description={
                        article.stock > 0
                          ? `${placeOf(article)} · ${formatQuantity(article.stock, article.unit)}`
                          : placeOf(article)
                      }
                      checked={chosen?.has(article.id) ?? false}
                      onChange={(on) => {
                        toggle(article.id, on);
                      }}
                    />
                  </div>
                </GroupedListItem>
              ))}
            </GroupedList>
          )}
        </>
      )}
      <FormActions
        placement="inline"
        primaryLabel={t.save}
        onPrimary={() => {
          void save();
        }}
        primaryDisabled={busy || chosen === null}
        secondaryLabel={t.cancel}
        onSecondary={onClose}
        summary={count === 0 ? t.noneChecked : t.checked(areasMessages.counts.articles(count))}
        error={error}
      />
    </div>
  );
}
