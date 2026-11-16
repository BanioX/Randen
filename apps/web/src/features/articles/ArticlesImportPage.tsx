import {
  formatUnitPrice,
  IMPORT_MAX_LINES,
  priceUnitLabel,
  type ArticleCategoryId,
  type ImportLine,
  type OperationOutput,
} from '@randen/core';
import { CircleAlert } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router';
import { errorText, useCommand, useMoney, useQuery } from '../../app/hooks';
import { paths } from '../../app/paths';
import { ButtonLink } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { DataTable, type DataTableColumn } from '../../ui/DataTable';
import { FormActions } from '../../ui/FormActions';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { CategoryPicker } from '../../ui/pickers';
import { Section } from '../../ui/Section';
import { StatusChip } from '../../ui/StatusChip';
import { TextArea } from '../../ui/TextField';
import { useToast } from '../../ui/Toast';
import { articlesMessages } from './messages';
import { useLast } from './shared';

const t = articlesMessages.import;

type Imported = OperationOutput<'articles.import'>;

/**
 * «Mehrere auf einmal»: paste one article per line, see at once what each line becomes, correct
 * the guessed group of goods, and create every line that works. Lines that do not work stay in
 * the field with their reason, so nothing is lost and nothing wrong is created.
 */
export function ArticlesImportPage() {
  const money = useMoney();
  const run = useCommand();
  const navigate = useNavigate();
  const toast = useToast();
  const [text, setText] = useState('');
  /** Corrections of the guessed group of goods, by line number of the text. */
  const [categories, setCategories] = useState<ReadonlyMap<number, ArticleCategoryId>>(new Map());
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [done, setDone] = useState<Imported | null>(null);

  const preview = useLast(useQuery('articles.importPreview', { text }));
  const lines = text.trim() === '' ? [] : (preview?.lines ?? []);
  const ready = lines.filter((line) => line.ok);
  const skipped = lines.filter((line) => !line.ok);
  const valid = ready.length;
  const newSuppliers = text.trim() === '' ? 0 : (preview?.newSuppliers.length ?? 0);

  function changeText(next: string) {
    setText(next);
    // Line numbers move with the text: corrections only hold for the text they were made on.
    setCategories(new Map());
    setFailure(null);
  }

  function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (saving || valid === 0) {
      return;
    }
    setSaving(true);
    setFailure(null);
    run('articles.import', {
      text,
      categories: [...categories].map(([line, categoryId]) => ({ line, categoryId })),
    })
      .then((result) => {
        toast({ text: t.done(result.created), tone: 'ok' });
        setDone(result);
        setText(result.remaining);
        setCategories(new Map());
      })
      .catch((error: unknown) => {
        setFailure(error);
      })
      .finally(() => {
        setSaving(false);
      });
  }

  const columns: DataTableColumn<ImportLine>[] = [
    {
      key: 'article',
      header: t.columns.article,
      render: (line) => (
        <span className="block">
          <span className="block">{line.name}</span>
          {/* On the phone the columns for unit, price and supplier are folded into this line. */}
          <span className="block text-[0.8125rem] font-normal text-ink-muted md:hidden">
            {line.supplierName === undefined
              ? priceOf(line)
              : `${priceOf(line)} · ${line.supplierName}${line.supplierIsNew ? ` (${t.newSupplier})` : ''}`}
          </span>
        </span>
      ),
    },
    {
      key: 'price',
      header: t.columns.price,
      align: 'right',
      hideBelow: 'md',
      render: (line) => (
        <span className={line.pricePer1000 === undefined ? 'text-ink-muted' : ''}>
          {priceOf(line)}
        </span>
      ),
    },
    {
      key: 'supplier',
      header: t.columns.supplier,
      hideBelow: 'md',
      render: (line) =>
        line.supplierName !== undefined ? (
          <span className="flex flex-wrap items-center gap-1.5">
            {line.supplierName}
            {line.supplierIsNew ? (
              <StatusChip tone="neutral" size="sm">
                {t.newSupplier}
              </StatusChip>
            ) : null}
          </span>
        ) : (
          ''
        ),
    },
    {
      key: 'category',
      header: t.columns.category,
      // Wide enough to read the group of goods, without squeezing the name on the phone.
      width: 'clamp(9.5rem, 30%, 15rem)',
      render: (line) => (
        <CategoryPicker
          label={t.categoryOf(line.name ?? '')}
          hideLabel
          required
          value={categories.get(line.line) ?? line.categoryId}
          onChange={(categoryId) => {
            if (categoryId !== null) {
              setCategories((current) => new Map(current).set(line.line, categoryId));
            }
          }}
        />
      ),
    },
  ];

  /** The price with its unit; without a price the unit alone, so it is never lost. */
  function priceOf(line: ImportLine): string {
    if (line.unit === undefined) {
      return '';
    }
    return line.pricePer1000 === undefined
      ? t.noPrice(priceUnitLabel(line.unit))
      : formatUnitPrice(line.pricePer1000, line.unit, money.currency);
  }

  return (
    <>
      <PageHeader title={t.title} back={{ to: paths.articles(), label: articlesMessages.title }} />
      <form onSubmit={onSubmit} className="space-y-6">
        {done === null ? null : (
          <Notice
            tone="ok"
            title={t.doneTitle(done.created)}
            action={
              <ButtonLink to={paths.articles()} variant="secondary" size="sm">
                {t.toArticles}
              </ButtonLink>
            }
          >
            {done.skipped === 0 ? t.doneAll : t.doneRemaining(done.skipped)}
          </Notice>
        )}

        <Card className="max-w-3xl space-y-3">
          <p>{t.intro}</p>
          <p className="text-[0.9375rem] text-ink-muted">{t.units}</p>
          <TextArea
            label={t.lines}
            rows={6}
            placeholder={t.placeholder}
            maxLength={100_000}
            value={text}
            onChange={changeText}
          />
        </Card>

        <Section title={t.caption}>
          {lines.length === 0 ? (
            <Card>
              <p className="text-ink-muted">{t.empty}</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {preview?.truncated === true ? (
                <Notice tone="soon" variant="row">
                  {t.truncated(IMPORT_MAX_LINES)}
                </Notice>
              ) : null}
              {skipped.length === 0 ? null : (
                <Card>
                  <h3 className="flex items-center gap-2 font-semibold">
                    <CircleAlert size={20} aria-hidden="true" className="shrink-0 text-danger" />
                    {t.skipped(skipped.length)}
                  </h3>
                  <ul aria-label={t.skippedList} className="mt-2 divide-y divide-line">
                    {skipped.map((line) => (
                      <li key={line.line} className="py-2.5">
                        <span className="block text-[0.8125rem] text-ink-muted">
                          {t.line(line.line)}
                        </span>
                        <span className="block font-medium wrap-anywhere">{line.raw.trim()}</span>
                        {line.problems.map((problem) => (
                          <span key={problem} className="block text-[0.9375rem] text-danger">
                            {t.problems[problem]}
                          </span>
                        ))}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              {ready.length === 0 ? null : (
                <DataTable
                  caption={t.caption}
                  hideCaption
                  columns={columns}
                  rows={ready}
                  getRowKey={(line) => String(line.line)}
                />
              )}
            </div>
          )}
        </Section>

        <FormActions
          primaryLabel={valid === 0 ? t.submitNone : t.submit(valid)}
          primaryBusy={saving}
          primaryDisabled={valid === 0}
          secondaryLabel={t.cancel}
          onSecondary={() => {
            void navigate(paths.articles());
          }}
          summary={lines.length === 0 ? undefined : t.summary(valid, newSuppliers, skipped.length)}
          error={failure === null ? null : errorText(failure)}
        />
      </form>
    </>
  );
}
