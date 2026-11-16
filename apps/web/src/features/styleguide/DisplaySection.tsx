import {
  addDays,
  dishFigures,
  foodCostBps,
  formatDecimal,
  formatPercent,
  menuClassLabel,
  netOfVat,
  rappen,
  sumRappen,
  wasteReasonLabel,
  type AllergenId,
  type DateKind,
  type Diet,
  type Rappen,
} from '@randen/core';
import {
  Beef,
  ClipboardList,
  Fish,
  MapPin,
  Milk,
  Package,
  PackageOpen,
  Plus,
  Soup,
  Trash2,
  TriangleAlert,
  Wheat,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useMoney, useToday } from '../../app/hooks';
import { paths } from '../../app/paths';
import {
  AllergenBadges,
  AreaBadge,
  areaLooks,
  DietBadge,
  ExpiryChip,
  MarginBadge,
  TemperatureBadge,
} from '../../ui/badges';
import { Button, ButtonLink } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { BarChart, Donut, HBarChart, LineChart, ProgressBar, Sparkline } from '../../ui/charts';
import { DataTable, type DataTableColumn } from '../../ui/DataTable';
import { DishPhoto } from '../../ui/DishPhoto';
import { EmptyState } from '../../ui/EmptyState';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { ConfirmDialog, Sheet } from '../../ui/Sheet';
import { KpiGrid, StatTile } from '../../ui/StatTile';
import { StatusChip } from '../../ui/StatusChip';
import { ToastProvider, useToast } from '../../ui/Toast';
import type { Tone } from '../../ui/tones';

/*
 * Sample content of the style guide: a made-up kitchen with plausible numbers. Nothing here is
 * stored; the figures of the dishes are computed with the same rules as in the app (ADR-0008).
 */

/** A drawn plate, so the picture frame has something to show without a camera. */
const DEMO_PHOTO =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120"><rect width="160" height="120" fill="#e8d9c0"/><circle cx="80" cy="60" r="46" fill="#fff"/><circle cx="80" cy="60" r="33" fill="#f0eadf"/><circle cx="80" cy="60" r="25" fill="#953447"/><circle cx="72" cy="54" r="5" fill="#bd5566"/><circle cx="89" cy="66" r="4" fill="#bd5566"/><path d="M76 70q8-10 14-2" stroke="#5aa173" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
  );

interface Lot {
  id: string;
  article: string;
  detail: string;
  icon: LucideIcon;
  dateKind: DateKind;
  /** Days from today to the date on the pack; undefined = no date. */
  inDays: number | undefined;
}

const LOTS: readonly Lot[] = [
  {
    id: 'lot-1',
    article: 'Lachsfilet',
    detail: '1.8 kg · Schublade Fisch',
    icon: Fish,
    dateKind: 'use_by',
    inDays: -1,
  },
  {
    id: 'lot-2',
    article: 'Rindsfilet',
    detail: '2.4 kg · Regal 2, oben',
    icon: Beef,
    dateKind: 'use_by',
    inDays: 0,
  },
  {
    id: 'lot-3',
    article: 'Vollrahm 35 %',
    detail: '6 l · Regal 1',
    icon: Milk,
    dateKind: 'use_by',
    inDays: 2,
  },
  {
    id: 'lot-4',
    article: 'Joghurt nature',
    detail: '3 kg · Regal 1',
    icon: Milk,
    dateKind: 'best_before',
    inDays: -3,
  },
  {
    id: 'lot-5',
    article: 'Kochbutter',
    detail: '5 kg · Regal 3',
    icon: Package,
    dateKind: 'best_before',
    inDays: 12,
  },
  {
    id: 'lot-6',
    article: 'Kalbsfond, Eigenproduktion',
    detail: '4 l · Regal 2, unten',
    icon: Soup,
    dateKind: 'use_by',
    inDays: undefined,
  },
];

interface Dish {
  id: string;
  name: string;
  /** Menu price with VAT; undefined = not on the card yet. */
  price: Rappen | undefined;
  costPerPortion: Rappen;
  sold: number;
  diet: Diet;
  allergens: readonly AllergenId[];
}

const DISHES: readonly Dish[] = [
  {
    id: 'dish-1',
    name: 'Kürbissuppe mit Kernöl',
    price: rappen(1250),
    costPerPortion: rappen(235),
    sold: 41,
    diet: 'vegan',
    allergens: [],
  },
  {
    id: 'dish-2',
    name: 'Zürcher Geschnetzeltes mit Rösti',
    price: rappen(3800),
    costPerPortion: rappen(1340),
    sold: 37,
    diet: 'omnivore',
    allergens: ['milk', 'sulphites'],
  },
  {
    id: 'dish-3',
    name: 'Randenrisotto mit Meerrettich',
    price: rappen(2400),
    costPerPortion: rappen(510),
    sold: 28,
    diet: 'vegetarian',
    allergens: ['milk', 'sulphites'],
  },
  {
    id: 'dish-4',
    name: 'Rindstatar',
    price: rappen(2800),
    costPerPortion: rappen(910),
    sold: 23,
    diet: 'omnivore',
    allergens: ['eggs', 'mustard', 'gluten'],
  },
  {
    id: 'dish-5',
    name: 'Felchenfilet mit Petersilienkartoffeln',
    price: rappen(3400),
    costPerPortion: rappen(980),
    sold: 19,
    diet: 'omnivore',
    allergens: ['fish', 'milk'],
  },
  {
    id: 'dish-6',
    name: 'Vermicelles mit Meringue',
    price: undefined,
    costPerPortion: rappen(310),
    sold: 0,
    diet: 'vegetarian',
    allergens: ['eggs', 'milk'],
  },
];

const VAT_BPS = 810;
const TARGET_FOOD_COST_BPS = 3200;

const WASTE = [
  { label: wasteReasonLabel('expired'), value: 8640 },
  { label: wasteReasonLabel('spoiled'), value: 5210 },
  { label: wasteReasonLabel('overproduction'), value: 4130 },
  { label: wasteReasonLabel('damaged'), value: 1860 },
  { label: wasteReasonLabel('prep_waste'), value: 1400 },
] as const;

const SALES_WEEK = [
  { label: 'Mo', value: 184_000 },
  { label: 'Di', value: 212_000 },
  { label: 'Mi', value: 246_000 },
  { label: 'Do', value: 298_000 },
  { label: 'Fr', value: 431_000 },
  { label: 'Sa', value: 482_000 },
  { label: 'So', value: 315_000 },
] as const;

/** Net sales and cost of goods of the first fourteen days of the month, in Rappen. */
const COURSE = [
  [171_000, 56_400],
  [196_500, 61_200],
  [228_000, 73_900],
  [276_000, 86_800],
  [399_500, 121_000],
  [446_000, 139_700],
  [291_500, 97_300],
  [170_500, 55_100],
  [196_000, 63_500],
  [227_500, 70_200],
  [275_500, 88_900],
  [398_500, 127_400],
  [445_500, 142_100],
  [291_000, 90_600],
].map(([sales = 0, goods = 0], index) => ({
  label: `${index + 1}.11.`,
  value: sales,
  second: goods,
}));

const DELIVERIES = [
  { label: 'KW 43', value: 248_000, second: 86_000 },
  { label: 'KW 44', value: 231_500, second: 64_500 },
  { label: 'KW 45', value: 262_000, second: 91_000 },
  { label: 'KW 46', value: 119_000, second: 38_000 },
] as const;

const MENU_CLASSES = [
  { label: menuClassLabel('star'), value: 7 },
  { label: menuClassLabel('plowhorse'), value: 5 },
  { label: menuClassLabel('puzzle'), value: 4 },
  { label: menuClassLabel('dog'), value: 2 },
] as const;

const CHIP_TONES: readonly { tone: Tone; label: string; icon?: LucideIcon }[] = [
  { tone: 'ok', label: 'In Ordnung' },
  { tone: 'soon', label: 'Bald' },
  { tone: 'today', label: 'Heute zu tun' },
  { tone: 'danger', label: 'Abgelaufen', icon: TriangleAlert },
  { tone: 'cold', label: 'Kühlzelle' },
  { tone: 'frozen', label: 'Tiefkühlzelle' },
  { tone: 'dry', label: 'Trockenlager' },
  { tone: 'bar', label: 'Bar und Weinkeller' },
  { tone: 'wine', label: 'Gewählt' },
  { tone: 'neutral', label: 'Entwurf' },
  { tone: 'grape', label: 'Beste Marge' },
];

function Buttons() {
  return (
    <Card>
      <div className="flex flex-wrap gap-3">
        <Button icon={Plus}>Wareneingang</Button>
        <Button variant="secondary">Inventur</Button>
        <Button variant="ghost">Journal</Button>
        <Button variant="danger" icon={Trash2}>
          Löschen
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button size="sm" icon={Plus}>
          Charge
        </Button>
        <Button size="sm" variant="secondary">
          Drucken
        </Button>
        <ButtonLink size="sm" variant="ghost" to={paths.journal()}>
          Zum Journal
        </ButtonLink>
        <Button size="sm" busy>
          Sichern
        </Button>
      </div>
    </Card>
  );
}

function KeyFigures() {
  const money = useMoney();
  return (
    <div className="space-y-4">
      <KpiGrid>
        <StatTile
          variant="premium"
          label="Lagerwert"
          unit={money.symbol}
          value={money.format(rappen(1_842_050), { currency: false })}
          hint="62 Artikel an Lager"
          trend={
            <Sparkline
              onDark
              values={[1_712_000, 1_698_400, 1_731_900, 1_790_300, 1_768_200, 1_815_600, 1_842_050]}
              summary="Der Lagerwert ist in sieben Tagen von CHF 17’120 auf CHF 18’420.50 gestiegen."
            />
          }
          to={paths.stock()}
        />
        <StatTile
          label="Wareneinsatz"
          value={formatPercent(3120)}
          tone="ok"
          hint="Ziel 32 %"
          to={paths.margins()}
        />
        <StatTile
          label="Abschreiber diese Woche"
          unit={money.symbol}
          value={money.format(rappen(21_240), { currency: false })}
          tone="soon"
          hint="CHF 38.20 mehr als letzte Woche"
        />
        <StatTile label="Läuft heute ab" value="6" tone="today" hint="Zuerst verarbeiten" />
      </KpiGrid>
      {/* A seven-digit amount in two tiles: the figure breaks inside its tile, never out of it. */}
      <KpiGrid>
        <StatTile
          variant="premium"
          label="Lagerwert, grosser Betrieb"
          unit={money.symbol}
          value={money.format(rappen(1_234_567_890), { currency: false })}
          hint="Über eine Million"
        />
        <StatTile
          label="Lagerwert, grosser Betrieb"
          unit={money.symbol}
          value={money.format(rappen(1_234_567_890), { currency: false })}
          hint="Über eine Million"
        />
      </KpiGrid>
    </div>
  );
}

function Lists() {
  const today = useToday();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section
        level={3}
        titleStyle="group"
        title="Kühlzelle 1"
        action={{ label: 'Alle anzeigen', to: paths.stock() }}
      >
        <GroupedList>
          {LOTS.map((lot) => (
            <ListRow
              key={lot.id}
              icon={lot.icon}
              title={lot.article}
              subtitle={lot.detail}
              trailing={
                <ExpiryChip
                  expiresOn={lot.inDays === undefined ? undefined : addDays(today, lot.inDays)}
                  dateKind={lot.dateKind}
                  today={today}
                />
              }
              to={paths.stock()}
            />
          ))}
        </GroupedList>
      </Section>

      <div className="space-y-6">
        <Section level={3} titleStyle="group" title="Wo ist was?">
          <GroupedList>
            <ListRow
              picture={<DishPhoto photo={DEMO_PHOTO} alt="" radius="md" className="size-10" />}
              title="Randenrisotto mit Meerrettich"
              subtitle="Pass, Posten Entremetier"
              meta={<AllergenBadges allergens={['milk', 'sulphites']} traces={['nuts']} />}
              trailing={<DietBadge diet="vegetarian" size="sm" />}
            />
            <ListRow
              picture={<DishPhoto alt="" icon={MapPin} radius="md" className="size-10" />}
              title="Regal 2, oben"
              subtitle="Fleisch, vakuumiert"
              trailing={<AreaBadge kind="cold" name="Kühlzelle 1" size="sm" />}
              onClick={() => undefined}
            />
            <ListRow
              icon={areaLooks.frozen.icon}
              iconTone={areaLooks.frozen.tone}
              title="Tiefkühlzelle"
              subtitle="14 Artikel, 3 Plätze"
              trailing={<TemperatureBadge deciC={-192} ok size="sm" />}
              to={paths.areas()}
            />
            <ListRow
              title="Trockenlager"
              subtitle="Eine Zeile ohne Symbol: Die Haarlinie beginnt beim Text."
            />
          </GroupedList>
        </Section>

        <EmptyState
          icon={PackageOpen}
          title="Noch keine Chargen"
          text="Sobald du einen Wareneingang erfasst, steht hier, was in diesem Bereich liegt und wann es abläuft."
          action={
            <ButtonLink to={paths.receive()} icon={Plus}>
              Wareneingang erfassen
            </ButtonLink>
          }
        />
      </div>
    </div>
  );
}

function Badges() {
  const today = useToday();
  return (
    <Card>
      <dl className="grid gap-x-8 gap-y-5 md:grid-cols-2">
        <div>
          <dt className="text-sm font-semibold text-ink-muted">Ablauf</dt>
          <dd className="mt-2 flex flex-wrap gap-2">
            <ExpiryChip expiresOn={addDays(today, 12)} dateKind="best_before" today={today} />
            <ExpiryChip expiresOn={addDays(today, 2)} dateKind="use_by" today={today} />
            <ExpiryChip expiresOn={today} dateKind="use_by" today={today} />
            <ExpiryChip expiresOn={addDays(today, -3)} dateKind="best_before" today={today} />
            <ExpiryChip expiresOn={addDays(today, -1)} dateKind="use_by" today={today} />
          </dd>
        </div>
        <div>
          <dt className="text-sm font-semibold text-ink-muted">Wareneinsatz gegen das Ziel</dt>
          <dd className="mt-2 flex flex-wrap gap-2">
            <MarginBadge status="good" foodCostBps={2300} />
            <MarginBadge status="watch" foodCostBps={3510} />
            <MarginBadge status="over" foodCostBps={3810} />
            <MarginBadge status="unknown" />
          </dd>
        </div>
        <div>
          <dt className="text-sm font-semibold text-ink-muted">Allergene und Ernährung</dt>
          <dd className="mt-2 flex flex-wrap items-center gap-2">
            <AllergenBadges
              size="md"
              allergens={['milk', 'gluten', 'eggs']}
              traces={['nuts', 'sesame']}
            />
            <DietBadge diet="vegan" />
            <DietBadge diet="vegetarian" />
          </dd>
          <dd className="mt-2">
            <AllergenBadges allergens={[]} empty="Keine deklarationspflichtigen Allergene" />
          </dd>
        </div>
        <div>
          <dt className="text-sm font-semibold text-ink-muted">Lagerbereiche und Temperatur</dt>
          <dd className="mt-2 flex flex-wrap gap-2">
            <AreaBadge kind="cold" name="Kühlzelle 1" />
            <AreaBadge kind="frozen" />
            <AreaBadge kind="dry" />
            <AreaBadge kind="bar" name="Weinkeller" />
            <AreaBadge kind="station" name="Garde-manger" />
            <AreaBadge kind="other" />
          </dd>
          <dd className="mt-2 flex flex-wrap gap-2">
            <TemperatureBadge deciC={38} ok />
            <TemperatureBadge deciC={-124} ok={false} />
            <TemperatureBadge deciC={45} />
          </dd>
        </div>
        <div className="md:col-span-2">
          <dt className="text-sm font-semibold text-ink-muted">Töne</dt>
          <dd className="mt-2 flex flex-wrap gap-2">
            {CHIP_TONES.map(({ tone, label, icon }) => (
              <StatusChip key={tone} tone={tone} icon={icon}>
                {label}
              </StatusChip>
            ))}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

function Notices() {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Notice
        tone="info"
        title="Inventur am Monatsende"
        action={
          <ButtonLink size="sm" variant="secondary" to={paths.count()}>
            Inventur öffnen
          </ButtonLink>
        }
      >
        Zähle das Lager am 30.11., damit der Wareneinsatz des Monats stimmt.
      </Notice>
      <Notice tone="ok" title="Alle Temperaturen im Bereich">
        Heute um 07.30 Uhr gemessen: Kühlzelle 3.8 °C, Tiefkühlzelle -19.2 °C.
      </Notice>
      <Notice tone="soon" title="6 Chargen laufen in den nächsten drei Tagen ab">
        Plane sie zuerst ein. Der Menüplan schlägt Gerichte vor, die sie verwerten.
      </Notice>
      <Notice tone="danger" title="Tiefkühlzelle zu warm">
        Gemessen -12.4 °C, verlangt sind -18 °C oder kälter. Prüfe die Tür und halte die Massnahme
        fest.
      </Notice>
      <div className="lg:col-span-2">
        <Notice tone="soon" variant="row">
          Bei 2 Zutaten fehlt der Preis: Der Wareneinsatz ist eine Untergrenze.
        </Notice>
      </div>
    </div>
  );
}

type DishFilter = 'all' | 'over';

function DishTable() {
  const money = useMoney();
  const [filter, setFilter] = useState<DishFilter>('all');
  const rows = DISHES.map((dish) => {
    const figures = dishFigures({
      costPerPortion: dish.costPerPortion,
      priceRappen: dish.price,
      vatBps: VAT_BPS,
      targetFoodCostBps: TARGET_FOOD_COST_BPS,
    });
    return {
      ...dish,
      figures,
      revenue: rappen((figures.netRappen ?? 0) * dish.sold),
      goods: rappen(dish.costPerPortion * dish.sold),
    };
  });
  type Row = (typeof rows)[number];
  const shown =
    filter === 'all'
      ? rows
      : rows.filter((row) => row.figures.status === 'watch' || row.figures.status === 'over');
  const revenue = sumRappen(shown.map((row) => row.revenue));
  const goods = sumRappen(shown.map((row) => row.goods));

  const columns: DataTableColumn<Row>[] = [
    { key: 'name', header: 'Gericht', render: (row) => row.name },
    {
      key: 'share',
      header: 'Wareneinsatz',
      render: (row) => (
        <MarginBadge
          short
          status={row.figures.status}
          foodCostBps={row.figures.foodCostBps}
          size="sm"
        />
      ),
    },
    {
      key: 'sold',
      header: 'Verkauft',
      align: 'right',
      hideBelow: 'md',
      render: (row) => formatDecimal(row.sold),
    },
    {
      key: 'cost',
      header: 'Warenkosten',
      align: 'right',
      hideBelow: 'md',
      render: (row) => money.format(row.costPerPortion),
    },
    {
      key: 'margin',
      header: 'Deckungsbeitrag',
      align: 'right',
      hideBelow: 'lg',
      render: (row) =>
        row.figures.marginRappen === undefined ? '–' : money.format(row.figures.marginRappen),
    },
    {
      key: 'price',
      header: 'Preis',
      align: 'right',
      render: (row) => (row.price === undefined ? '–' : money.format(row.price)),
    },
  ];

  return (
    <div className="space-y-3">
      <SegmentedControl
        label="Gerichte"
        hideLabel
        className="md:max-w-sm"
        options={[
          { value: 'all', label: 'Alle' },
          { value: 'over', label: 'Über dem Ziel' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      <DataTable
        caption="Gerichte dieser Woche"
        hideCaption
        columns={columns}
        rows={shown}
        getRowKey={(row) => row.id}
        rowLink={() => paths.recipes()}
        footer={{
          name: 'Total',
          sold: formatDecimal(shown.reduce((sum, row) => sum + row.sold, 0)),
          share: formatPercent(foodCostBps(goods, revenue) ?? 0),
        }}
        empty="Kein Gericht liegt über dem Ziel."
      />
    </div>
  );
}

function Feedback() {
  const toast = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState<'expired' | 'spoiled' | 'damaged'>('expired');

  function writeOff() {
    setSheetOpen(false);
    toast({
      text: '1.8 kg Lachsfilet abgeschrieben.',
      tone: 'ok',
      action: {
        label: 'Rückgängig',
        onAction: () => {
          toast({ text: 'Abschreiber zurückgenommen.' });
        },
      },
    });
  }

  return (
    <Card>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          onClick={() => {
            setSheetOpen(true);
          }}
        >
          Charge abschreiben
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setConfirmOpen(true);
          }}
        >
          Rezept löschen
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            toast({ text: 'Inventur gesichert: 62 Artikel gezählt.' });
          }}
        >
          Meldung zeigen
        </Button>
      </div>

      <Sheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
        }}
        title="Charge abschreiben"
        footer={
          <Button fullWidth onClick={writeOff}>
            Abschreiben
          </Button>
        }
      >
        <p className="text-ink-muted">
          Lachsfilet, 1.8 kg, Kühlzelle 1. Das Verbrauchsdatum ist seit gestern vorbei: Die Charge
          darf nicht mehr verarbeitet werden.
        </p>
        <SegmentedControl
          className="mt-4"
          label="Grund"
          options={[
            { value: 'expired', label: wasteReasonLabel('expired') },
            { value: 'spoiled', label: wasteReasonLabel('spoiled') },
            { value: 'damaged', label: wasteReasonLabel('damaged') },
          ]}
          value={reason}
          onChange={setReason}
        />
      </Sheet>

      <ConfirmDialog
        open={confirmOpen}
        tone="danger"
        title="Rezept löschen?"
        text="Das Rezept «Vermicelles mit Meringue» wird gelöscht. Verkäufe und Produktionen bleiben im Journal."
        confirmLabel="Löschen"
        onCancel={() => {
          setConfirmOpen(false);
        }}
        onConfirm={() => {
          setConfirmOpen(false);
          toast({ text: 'Rezept gelöscht.' });
        }}
      />
    </Card>
  );
}

function Charts() {
  const money = useMoney();
  const chf = (value: number) => money.format(rappen(Math.round(value)));
  /** Whole francs for the axis: «1’000». */
  const francs = (value: number) => formatDecimal(value / 100, { digits: 0 });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <Section level={3} title="Budget im November">
          <div className="space-y-5">
            <ProgressBar
              label="Einkauf Küche"
              value={624_000}
              max={900_000}
              valueText={`${chf(624_000)} von ${chf(900_000)}`}
              marker={{ value: 420_000, label: 'heute, 14.11.' }}
              tone="soon"
              summary="69 % des Küchenbudgets sind verbraucht, der Monat ist zu 47 % vorbei."
              hint="Es bleiben CHF 2’760.00 für 16 Tage."
            />
            <ProgressBar
              label="Einkauf Getränke"
              value={118_000}
              max={320_000}
              valueText={`${chf(118_000)} von ${chf(320_000)}`}
              marker={{ value: 149_333, label: 'heute, 14.11.' }}
              tone="ok"
              summary="37 % des Getränkebudgets sind verbraucht, der Monat ist zu 47 % vorbei."
            />
            <ProgressBar
              label="Reinigung und Verbrauchsmaterial"
              value={46_800}
              max={40_000}
              valueText={`${chf(46_800)} von ${chf(40_000)}`}
              tone="danger"
              summary="Das Budget für Reinigung ist um CHF 68.00 überschritten."
              hint="CHF 68.00 über dem Budget."
            />
          </div>
        </Section>
      </Card>

      <Card>
        <Section
          level={3}
          title="Abschreiber nach Grund"
          hint="Diese Woche, zusammen CHF 212.40"
          action={{ label: 'Journal', to: paths.journal() }}
        >
          <HBarChart
            summary="Abgelaufene Ware macht mit CHF 86.40 den grössten Teil der Abschreiber dieser Woche aus, vor verdorbener Ware und Überproduktion."
            categoryLabel="Grund"
            valueLabel="Abschreiber"
            data={WASTE}
            formatValue={chf}
          />
        </Section>
      </Card>

      <Card>
        <Section level={3} title="Umsatz pro Tag" hint="Diese Woche, netto">
          <BarChart
            summary="Der Umsatz steigt von CHF 1’840 am Montag auf CHF 4’820 am Samstag; Freitag bis Sonntag liegen über dem Tagesziel von CHF 3’000."
            categoryLabel="Tag"
            valueLabel="Umsatz"
            data={SALES_WEEK}
            formatValue={francs}
            target={{ value: 300_000, label: 'Tagesziel CHF 3’000' }}
          />
        </Section>
      </Card>

      <Card>
        <Section level={3} title="Umsatz und Warenkosten" hint="1. bis 14. November, in CHF">
          <LineChart
            summary="Umsatz und Warenkosten folgen demselben Wochenrhythmus mit der Spitze am Samstag; die Warenkosten bleiben bei rund einem Drittel des Umsatzes."
            categoryLabel="Tag"
            valueLabel="Umsatz"
            secondLabel="Warenkosten"
            data={COURSE}
            formatValue={francs}
          />
        </Section>
      </Card>

      <Card>
        <Section level={3} title="Gerichte nach Klasse" hint="Menu-Engineering, letzte 30 Tage">
          <Donut
            summary="Von 18 Gerichten sind 7 Gewinner und 5 Renner; 2 Verlierer stehen zur Prüfung."
            categoryLabel="Klasse"
            valueLabel="Gerichte"
            parts={MENU_CLASSES}
            centerValue="18"
            centerLabel="Gerichte"
            showShare
          />
        </Section>
      </Card>

      <Card>
        <Section level={3} title="Wareneingang pro Woche" hint="In CHF, Küche und Getränke">
          <BarChart
            summary="In den Wochen 43 bis 45 kam Ware für CHF 2’960 bis CHF 3’530 ins Haus, rund ein Viertel davon Getränke; die laufende Woche 46 steht bei CHF 1’570."
            categoryLabel="Woche"
            valueLabel="Küche"
            secondLabel="Getränke"
            mode="stacked"
            data={DELIVERIES}
            formatValue={francs}
            showTable
          />
        </Section>
      </Card>
    </div>
  );
}

/** Layout, lists, badges, feedback and charts of the UI kit, with the content of a real kitchen. */
export function DisplaySection() {
  const revenue = sumRappen(
    DISHES.map((dish) =>
      rappen((dish.price === undefined ? 0 : netOfVat(dish.price, VAT_BPS)) * dish.sold),
    ),
  );
  const money = useMoney();
  return (
    <ToastProvider>
      <div className="space-y-10">
        <Section title="Seitenkopf und Aktionen">
          <div className="space-y-4">
            <Card>
              <PageHeader
                level={2}
                back={{ to: paths.stock(), label: 'Lager' }}
                title="Kühlzelle 1"
                subtitle={`42 Chargen im Wert von ${money.format(rappen(618_040))}`}
                actions={
                  <>
                    <ButtonLink
                      size="sm"
                      variant="secondary"
                      to={paths.count()}
                      icon={ClipboardList}
                    >
                      Inventur
                    </ButtonLink>
                    <ButtonLink size="sm" to={paths.receive()} icon={Plus}>
                      Wareneingang
                    </ButtonLink>
                  </>
                }
              />
            </Card>
            <Buttons />
          </div>
        </Section>

        <Section title="Kennzahlen" hint="Die eine dunkle Karte trägt die Leitzahl der Seite.">
          <KeyFigures />
        </Section>

        <Section title="Listen">
          <Lists />
        </Section>

        <Section title="Chips und Auszeichnungen">
          <Badges />
        </Section>

        <Section title="Hinweise">
          <Notices />
        </Section>

        <Section
          title="Tabelle"
          hint={`Gerichte dieser Woche, Umsatz netto ${money.format(revenue)}`}
          action={{ label: 'Alle Rezepte', to: paths.recipes() }}
        >
          <DishTable />
        </Section>

        <Section title="Dialoge und Meldungen">
          <Feedback />
        </Section>

        <Section title="Diagramme">
          <Charts />
        </Section>

        <Section title="Bilder">
          <div className="grid grid-cols-2 items-start gap-4 md:grid-cols-4">
            <DishPhoto
              photo={DEMO_PHOTO}
              alt="Randenrisotto auf einem weissen Teller"
              ratio="card"
            />
            <DishPhoto alt="" ratio="card" />
            <DishPhoto alt="" ratio="square" icon={MapPin} />
            <DishPhoto alt="" ratio="wide" icon={Wheat} />
          </div>
        </Section>
      </div>
    </ToastProvider>
  );
}
