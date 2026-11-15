import { Plus, Utensils } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router';
import { errorText, useCommand, useQuery } from '../../app/hooks';
import { paths } from '../../app/paths';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { FormActions } from '../../ui/FormActions';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { Sheet } from '../../ui/Sheet';
import { StatusChip } from '../../ui/StatusChip';
import { TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { menuMessages } from './messages';
import { countsLine, useLast } from './shared';

const t = menuMessages;

/** Sheet «Speisekarte erfassen»: a name, then the editor of the new card. */
function NewCardSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const run = useCommand();
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    run('menu.create', { name })
      .then(({ cardId }) => {
        toast({ text: t.createSheet.created(name.trim()), tone: 'ok' });
        setName('');
        onClose();
        void navigate(paths.menuCard(cardId));
      })
      .catch((caught: unknown) => {
        setError(errorText(caught));
      })
      .finally(() => {
        setBusy(false);
      });
  }

  return (
    <Sheet open={open} onClose={onClose} title={t.createSheet.title}>
      <form onSubmit={submit} className="space-y-5">
        <TextField
          label={t.createSheet.name}
          value={name}
          onChange={setName}
          placeholder={t.createSheet.namePlaceholder}
          hint={t.createSheet.nameHint}
          required
          maxLength={80}
          autoComplete="off"
        />
        <FormActions primaryLabel={t.createSheet.submit} error={error} placement="inline" />
      </form>
    </Sheet>
  );
}

/**
 * «Speisekarte»: the cards with their sections, dishes, publication and open points. Below
 * them the published cards, each one a tap away from the guest view.
 */
export function MenuPage() {
  const data = useLast(useQuery('menu.list', {}));
  const published = useQuery('menu.published', {});
  const [creating, setCreating] = useState(false);

  const empty = data?.cards.length === 0;

  return (
    <>
      <PageHeader
        title={t.title}
        actions={
          empty ? undefined : (
            <Button
              icon={Plus}
              size="sm"
              onClick={() => {
                setCreating(true);
              }}
            >
              {t.create}
            </Button>
          )
        }
      />

      {data === undefined ? null : empty ? (
        <EmptyState
          icon={Utensils}
          title={t.list.emptyTitle}
          text={t.list.emptyText}
          action={
            <Button
              icon={Plus}
              onClick={() => {
                setCreating(true);
              }}
            >
              {t.create}
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <GroupedList label={t.list.caption}>
            {data.cards.map((card) => (
              <ListRow
                key={card.id}
                title={card.name}
                subtitle={countsLine(card.sectionCount, card.dishCount)}
                icon={Utensils}
                to={paths.menuCard(card.id)}
                trailing={
                  <span className="flex flex-wrap items-center gap-1.5">
                    {card.problems > 0 ? (
                      <StatusChip tone="soon" size="sm">
                        {t.count.open(card.problems)}
                      </StatusChip>
                    ) : null}
                    {card.published ? (
                      <StatusChip tone="ok" size="sm">
                        {t.status.published}
                      </StatusChip>
                    ) : (
                      <StatusChip tone="neutral" size="sm" outline>
                        {t.status.draft}
                      </StatusChip>
                    )}
                  </span>
                }
              />
            ))}
          </GroupedList>

          <Section title={t.list.guestsTitle} hint={t.list.guestsHint}>
            {published === undefined || published.cards.length === 0 ? (
              <p className="text-ink-muted">{t.list.guestsEmpty}</p>
            ) : (
              <GroupedList label={t.list.guestsTitle}>
                {published.cards.map((card) => (
                  <ListRow
                    key={card.id}
                    title={card.name}
                    subtitle={t.status.published}
                    icon={Utensils}
                    to={paths.guest(card.id)}
                  />
                ))}
              </GroupedList>
            )}
          </Section>
        </div>
      )}

      <NewCardSheet
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
      />
    </>
  );
}
