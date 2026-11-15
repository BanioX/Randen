import type { OperationOutput } from '@randen/core';
import { useState, type SyntheticEvent } from 'react';
import { errorText, useCommand } from '../../app/hooks';
import { FormActions } from '../../ui/FormActions';
import { Section } from '../../ui/Section';
import { Switch } from '../../ui/Switch';
import { TextArea, TextField } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { menuMessages } from './messages';

const t = menuMessages;
type Card = OperationOutput<'menu.get'>['card'];

/**
 * The texts of a card and its three switches. The texts are saved with «Sichern»; a switch
 * takes effect at once, as the switches of the phone do.
 */
export function CardSettings({ card }: { card: Card }) {
  const run = useCommand();
  const toast = useToast();
  const [name, setName] = useState(card.name);
  const [intro, setIntro] = useState(card.intro ?? '');
  const [footer, setFooter] = useState(card.footer ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    run('menu.update', { cardId: card.id, name, intro, footer })
      .then(() => {
        toast({ text: t.settings.saved(name.trim()), tone: 'ok' });
      })
      .catch((caught: unknown) => {
        setError(errorText(caught));
      })
      .finally(() => {
        setBusy(false);
      });
  }

  function setSwitch(change: { showPrices: boolean } | { showPhotos: boolean }) {
    run('menu.update', { cardId: card.id, ...change }).catch((caught: unknown) => {
      setError(errorText(caught));
    });
  }

  function setPublished(published: boolean) {
    setError(null);
    run('menu.setPublished', { cardId: card.id, published })
      .then(() => {
        toast({
          text: published ? t.settings.publishedToast : t.settings.draftToast,
          tone: published ? 'ok' : 'neutral',
        });
      })
      .catch((caught: unknown) => {
        setError(errorText(caught));
      });
  }

  return (
    <Section title={t.settings.title}>
      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <form
          onSubmit={save}
          className="space-y-4 rounded-2xl bg-surface p-4 shadow-card md:col-span-2 md:p-5"
        >
          <TextField
            label={t.settings.name}
            value={name}
            onChange={setName}
            required
            maxLength={80}
            autoComplete="off"
          />
          <TextArea
            label={t.settings.intro}
            hint={t.settings.introHint}
            value={intro}
            onChange={setIntro}
            maxLength={400}
            optional
            rows={2}
          />
          <TextArea
            label={t.settings.footer}
            hint={t.settings.footerHint}
            value={footer}
            onChange={setFooter}
            maxLength={600}
            optional
            rows={2}
          />
          <FormActions primaryLabel={t.settings.save} error={error} placement="inline" />
        </form>

        <div className="divide-y divide-line rounded-2xl bg-surface px-4 shadow-card md:px-5">
          <div className="py-2">
            <Switch
              label={t.settings.prices}
              description={t.settings.pricesHint}
              checked={card.showPrices}
              onChange={(checked) => {
                setSwitch({ showPrices: checked });
              }}
            />
          </div>
          <div className="py-2">
            <Switch
              label={t.settings.photos}
              description={t.settings.photosHint}
              checked={card.showPhotos}
              onChange={(checked) => {
                setSwitch({ showPhotos: checked });
              }}
            />
          </div>
          <div className="py-2">
            <Switch
              label={t.settings.publish}
              description={t.settings.publishHint}
              checked={card.published}
              onChange={setPublished}
            />
          </div>
        </div>
      </div>
    </Section>
  );
}
