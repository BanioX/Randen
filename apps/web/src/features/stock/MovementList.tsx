import { formatQuantity, formatSwissDate, type MovementView } from '@randen/core';
import { useMoney } from '../../app/hooks';
import { paths } from '../../app/paths';
import { DataTable, type DataTableColumn } from '../../ui/DataTable';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { movementText } from './labels';
import { stockMessages } from './messages';

const t = stockMessages.movements;

interface MovementListProps {
  movements: readonly MovementView[];
  /** The journal names the article of every line; the page of one article does not. */
  showArticle: boolean;
  /** What the table holds, for screen readers. */
  caption: string;
  /** On paper every column is wanted, also «Wer» and «Bemerkung»: a plain table for the printer. */
  printable?: boolean | undefined;
}

const PRINT_CELL = 'border border-black px-2 py-1 text-left align-top';

/**
 * Lines of the stock journal: a grouped list on the phone (what, when, who, how much), a real
 * table from tablet width, where quantities and values are compared.
 */
export function MovementList({
  movements,
  showArticle,
  caption,
  printable = false,
}: MovementListProps) {
  const money = useMoney();
  const columns: DataTableColumn<MovementView>[] = [
    ...(showArticle
      ? [{ key: 'article', header: t.article, render: (row: MovementView) => row.articleName }]
      : []),
    { key: 'day', header: t.day, render: (row) => formatSwissDate(row.on), width: '7.5rem' },
    { key: 'type', header: t.type, render: (row) => movementText(row) },
    {
      key: 'quantity',
      header: t.quantity,
      align: 'right',
      render: (row) => formatQuantity(row.quantity, row.unit),
    },
    {
      key: 'value',
      header: t.value,
      align: 'right',
      render: (row) => money.format(row.valueRappen),
    },
    {
      key: 'who',
      header: t.who,
      hideBelow: 'lg',
      render: (row) => (row.who === '' ? t.unknown : row.who),
    },
    {
      key: 'note',
      header: t.note,
      hideBelow: 'lg',
      render: (row) => <span className="text-ink-muted">{row.note ?? ''}</span>,
    },
  ];
  return (
    <>
      <div className="md:hidden print:hidden">
        <GroupedList label={caption}>
          {movements.map((row) => {
            const when = `${formatSwissDate(row.on)}${row.who === '' ? '' : ` · ${row.who}`}`;
            return (
              <ListRow
                key={row.id}
                title={showArticle ? row.articleName : movementText(row)}
                subtitle={showArticle ? `${movementText(row)} · ${when}` : when}
                meta={row.note}
                to={showArticle ? paths.stockArticle(row.articleId) : undefined}
                trailing={
                  <span>
                    <span className="block font-semibold">
                      {formatQuantity(row.quantity, row.unit)}
                    </span>
                    <span className="block text-sm text-ink-muted">
                      {money.format(row.valueRappen)}
                    </span>
                  </span>
                }
              />
            );
          })}
        </GroupedList>
      </div>
      <div className={`hidden md:block ${printable ? 'print:hidden' : 'print:block'}`}>
        <DataTable
          caption={caption}
          hideCaption
          columns={columns}
          rows={movements}
          getRowKey={(row) => row.id}
          rowLink={showArticle ? (row) => paths.stockArticle(row.articleId) : undefined}
        />
      </div>
      {printable ? (
        // Only on paper. It repeats the table on screen, so assistive technology skips it.
        <table
          aria-hidden="true"
          className="hidden w-full table-fixed border-collapse text-xs text-black print:table"
        >
          <thead>
            <tr>
              <th scope="col" className={`${PRINT_CELL} w-[11%]`}>
                {t.day}
              </th>
              <th scope="col" className={`${PRINT_CELL} w-[20%]`}>
                {t.article}
              </th>
              <th scope="col" className={`${PRINT_CELL} w-[19%]`}>
                {t.type}
              </th>
              <th scope="col" className={`${PRINT_CELL} w-[10%] text-right`}>
                {t.quantity}
              </th>
              <th scope="col" className={`${PRINT_CELL} w-[12%] text-right`}>
                {t.value}
              </th>
              <th scope="col" className={`${PRINT_CELL} w-[12%]`}>
                {t.who}
              </th>
              <th scope="col" className={PRINT_CELL}>
                {t.note}
              </th>
            </tr>
          </thead>
          <tbody>
            {movements.map((row) => (
              <tr key={row.id}>
                <td className={PRINT_CELL}>{formatSwissDate(row.on)}</td>
                <td className={PRINT_CELL}>{row.articleName}</td>
                <td className={PRINT_CELL}>{movementText(row)}</td>
                <td className={`${PRINT_CELL} text-right tabular-nums`}>
                  {formatQuantity(row.quantity, row.unit)}
                </td>
                <td className={`${PRINT_CELL} text-right tabular-nums`}>
                  {money.format(row.valueRappen)}
                </td>
                <td className={PRINT_CELL}>{row.who}</td>
                <td className={PRINT_CELL}>{row.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </>
  );
}
