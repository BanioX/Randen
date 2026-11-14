import {
  ARTICLE_CATEGORIES,
  COURSES,
  courseLabel,
  formatQuantity,
  lineValue,
  rappen,
  type AllergenId,
  type ArticleCategoryId,
  type ArticleRef,
  type Course,
  type DateKind,
  type Id,
  type LocalDate,
  type Photo,
  type Rappen,
  type Weekday,
} from '@randen/core';
import { useState, type ReactNode } from 'react';
import { useMoney } from '../../app/hooks';
import { AllergenPicker } from '../../ui/AllergenPicker';
import { Card } from '../../ui/Card';
import { Checkbox } from '../../ui/Checkbox';
import { ChoiceChips, MultiChoiceChips } from '../../ui/ChoiceChips';
import { DateField } from '../../ui/DateField';
import { FormActions } from '../../ui/FormActions';
import { MoneyField } from '../../ui/MoneyField';
import { NumberField } from '../../ui/NumberField';
import { PercentField } from '../../ui/PercentField';
import { PhotoField } from '../../ui/PhotoField';
import { ZoomablePhoto } from '../../ui/PhotoViewer';
import {
  AreaPicker,
  ArticlePicker,
  CategoryPicker,
  Combobox,
  CountryPicker,
  RecipePicker,
  SpotPicker,
  StaffPicker,
  SupplierPicker,
} from '../../ui/pickers';
import { QuantityField } from '../../ui/QuantityField';
import { SearchField } from '../../ui/SearchField';
import { SelectField } from '../../ui/SelectField';
import { Switch } from '../../ui/Switch';
import { TemperatureField } from '../../ui/TemperatureField';
import { TextArea, TextField } from '../../ui/TextField';
import { UnitPriceField } from '../../ui/UnitPriceField';

/** Texts of this part of the style guide. Examples from a kitchen, no real names. */
export const formsSectionTexts = {
  title: 'Formulare',
  intro:
    'Jedes Feld hat eine sichtbare Beschriftung, nimmt Punkt und Komma und sagt, was es nicht lesen kann.',
  receipt: {
    title: 'Wareneingang',
    text: 'Eine Zeile vom Lieferschein: Artikel, Menge, Preis und Datum.',
    article: 'Artikel',
    quantity: 'Menge',
    price: 'Einkaufspreis',
    useBy: 'Zu verbrauchen bis',
    bestBefore: 'Mindestens haltbar bis',
    presets: [
      { label: 'morgen', days: 1 },
      { label: '3 Tage', days: 3 },
      { label: '1 Woche', days: 7 },
      { label: '2 Wochen', days: 14 },
    ],
    supplier: 'Lieferant',
    noSupplier: 'Kein Lieferant',
    area: 'Lagerbereich',
    spot: 'Platz',
    total: 'Betrag laut Lieferschein',
    totalHint: 'Zum Abgleich mit der Summe der Zeilen.',
    checked: 'Ware kontrolliert',
    checkedText: 'Temperatur, Verpackung und Datum stimmen.',
    book: 'Wareneingang buchen',
    cancel: 'Abbrechen',
    summary: (quantity: string, name: string, value: string) => `${quantity} ${name}, ${value}`,
    done: 'Im Styleguide wird nichts gebucht.',
  },
  temperature: {
    title: 'Temperatur',
    text: 'Eine Messung der Selbstkontrolle.',
    cold: 'Kühlzelle',
    coldHint: 'Richtwert: höchstens 5 °C.',
    frozen: 'Tiefkühlzelle',
    frozenHint: 'Richtwert: -18 °C oder kälter.',
    who: 'Gemessen von',
    action: 'Massnahme',
    actionPlaceholder: 'Was du getan hast, wenn der Wert ausserhalb liegt.',
  },
  article: {
    title: 'Artikel',
    text: 'Stammdaten mit Auswahl, Anteilen und Allergenen.',
    search: 'Artikel suchen',
    searchPlaceholder: 'Name oder Warengruppe',
    name: 'Name',
    namePlaceholder: 'Wie auf dem Lieferschein',
    category: 'Warengruppe',
    dateKind: 'Datum auf der Packung',
    dateKinds: [
      { value: 'best_before', label: 'Mindestens haltbar bis' },
      { value: 'use_by', label: 'Zu verbrauchen bis' },
    ],
    shelfLife: 'Haltbarkeit',
    days: 'Tage',
    shelfLifeHint: 'Richtwert für den Vorschlag beim Wareneingang.',
    yield: 'Ausbeute',
    yieldHint: 'Was nach dem Rüsten bleibt.',
    origin: 'Herkunft',
    contains: 'Enthält',
    traces: 'Kann Spuren enthalten',
    tracesHint: 'Was der Artikel schon enthält, steht hier nicht zur Wahl.',
    deliveryDays: 'Liefertage',
    weekdays: [
      { value: 'mon', label: 'Mo' },
      { value: 'tue', label: 'Di' },
      { value: 'wed', label: 'Mi' },
      { value: 'thu', label: 'Do' },
      { value: 'fri', label: 'Fr' },
      { value: 'sat', label: 'Sa' },
    ],
    active: 'Aktiv',
    activeText: 'Der Artikel steht in Listen und im Bestellvorschlag.',
    recipe: 'Hergestellt nach Rezept',
    course: 'Gang',
    portions: 'Portionen',
    categorySearch: 'Warengruppe mit Suche',
    categorySearchHint: 'Für lange Listen: tippen grenzt ein, die Pfeiltasten wählen.',
  },
  photo: {
    title: 'Foto eines Platzes',
    text: 'Aufnehmen oder aus den Dateien wählen. Das Foto bleibt auf dem Gerät.',
    empty: 'Foto des Platzes',
    emptyHint: 'Zeig das ganze Regal, damit neue Mitarbeitende den Platz finden.',
    stored: 'Regal 1, oben',
    alone: 'Trockenlager, Regal 1',
  },
  states: {
    title: 'Zustände',
    text: 'So sehen Fehler, Hinweise und ruhende Felder aus.',
    name: 'Name',
    nameError: 'Diesen Namen gibt es schon.',
    quantity: 'Menge',
    quantityError: 'Die Charge hat 4 kg. Trag höchstens so viel ein.',
    date: 'Produziert am',
    dateError: 'Trag das Datum der Produktion ein.',
    price: 'Verkaufspreis',
    priceHint: 'Gesperrt, solange das Gericht auf einer Speisekarte steht.',
    area: 'Lagerbereich',
    note: 'Notiz',
    kind: 'Abschreiber',
    kindError: 'Wähle, warum die Ware abgeschrieben wird.',
    kinds: [
      { value: 'expired', label: 'Abgelaufen', danger: true },
      { value: 'spoiled', label: 'Verdorben', danger: true },
      { value: 'overproduction', label: 'Überproduktion' },
    ],
    shown: 'Auf der Speisekarte zeigen',
    confirmed: 'Inventur geprüft',
    save: 'Sichern',
    discard: 'Verwerfen',
    saveError: 'Dafür ist zu wenig an Lager.',
    sticky: 'Am Handy bleibt die Hauptaktion über der Tab-Leiste in Reichweite.',
  },
} as const;

const t = formsSectionTexts;

/**
 * A drawing instead of a real photo, so the style guide ships no picture of a real kitchen.
 * An SVG inside a data URL cannot read the design tokens: it uses named colours.
 */
const SHELF_DRAWING: Photo = `data:image/svg+xml;utf8,${encodeURIComponent(
  [
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'>",
    "<rect width='400' height='300' fill='linen'/>",
    "<rect x='40' y='30' width='320' height='12' fill='peru'/>",
    "<rect x='40' y='140' width='320' height='12' fill='peru'/>",
    "<rect x='40' y='250' width='320' height='12' fill='peru'/>",
    "<rect x='70' y='70' width='60' height='70' rx='6' fill='tan'/>",
    "<rect x='150' y='85' width='90' height='55' rx='6' fill='burlywood'/>",
    "<rect x='260' y='60' width='50' height='80' rx='6' fill='tan'/>",
    "<rect x='80' y='180' width='110' height='70' rx='6' fill='burlywood'/>",
    "<rect x='220' y='195' width='90' height='55' rx='6' fill='tan'/>",
    '</svg>',
  ].join(''),
)}`;

function Group({
  title,
  text,
  children,
  after,
}: {
  title: string;
  text: string;
  children: ReactNode;
  /** Stands under the card, on the ground of the page: the place of a form's actions. */
  after?: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-xl font-semibold">{title}</h3>
        <p className="text-ink-muted">{text}</p>
      </div>
      <Card>{children}</Card>
      {after}
    </section>
  );
}

const GRID = 'grid gap-x-4 gap-y-5 sm:grid-cols-2';

function ReceiptExample() {
  const money = useMoney();
  const [article, setArticle] = useState<ArticleRef | null>(null);
  const [quantity, setQuantity] = useState<number | null>(null);
  const [price, setPrice] = useState<Rappen | null>(null);
  const [expiresOn, setExpiresOn] = useState<LocalDate | null>(null);
  const [supplierId, setSupplierId] = useState<Id | null>(null);
  const [areaId, setAreaId] = useState<Id | null>(null);
  const [spotId, setSpotId] = useState<Id | null>(null);
  const [total, setTotal] = useState<Rappen | null>(null);
  const [checked, setChecked] = useState(false);
  const [done, setDone] = useState(false);
  const unit = article?.unit ?? 'g';

  function reset() {
    setArticle(null);
    setQuantity(null);
    setPrice(null);
    setExpiresOn(null);
    setSupplierId(null);
    setAreaId(null);
    setSpotId(null);
    setTotal(null);
    setChecked(false);
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        setDone(true);
      }}
    >
      <div className={GRID}>
        <ArticlePicker
          label={t.receipt.article}
          className="sm:col-span-2"
          required
          value={article?.id ?? null}
          onChange={(_id, next) => {
            setArticle(next);
            setDone(false);
            // What the article knows is filled in, as a proposal.
            setPrice(next === null ? null : next.pricePer1000);
            setSupplierId(next?.supplierId ?? null);
            setAreaId(next?.areaId ?? null);
            setSpotId(next?.spotId ?? null);
          }}
        />
        <QuantityField
          label={t.receipt.quantity}
          unit={unit}
          positive
          required
          value={quantity}
          onChange={setQuantity}
        />
        <UnitPriceField label={t.receipt.price} unit={unit} value={price} onChange={setPrice} />
        <DateField
          label={article?.dateKind === 'use_by' ? t.receipt.useBy : t.receipt.bestBefore}
          className="sm:col-span-2"
          presets={t.receipt.presets}
          value={expiresOn}
          onChange={setExpiresOn}
        />
        <SupplierPicker
          label={t.receipt.supplier}
          placeholder={t.receipt.noSupplier}
          optional
          value={supplierId}
          onChange={setSupplierId}
        />
        <MoneyField
          label={t.receipt.total}
          hint={t.receipt.totalHint}
          optional
          value={total}
          onChange={setTotal}
        />
        <AreaPicker
          label={t.receipt.area}
          required
          value={areaId}
          onChange={(next) => {
            setAreaId(next);
            setSpotId(null);
          }}
        />
        <SpotPicker label={t.receipt.spot} areaId={areaId} value={spotId} onChange={setSpotId} />
      </div>
      <Checkbox
        label={t.receipt.checked}
        description={t.receipt.checkedText}
        checked={checked}
        onChange={setChecked}
      />
      <p role="status" className="text-sm text-ink-muted">
        {done ? t.receipt.done : null}
      </p>
      <FormActions
        placement="inline"
        primaryLabel={t.receipt.book}
        secondaryLabel={t.receipt.cancel}
        onSecondary={reset}
        summary={
          article !== null && quantity !== null && price !== null
            ? t.receipt.summary(
                formatQuantity(quantity, article.unit),
                article.name,
                money.format(lineValue(quantity, price)),
              )
            : undefined
        }
      />
    </form>
  );
}

function TemperatureExample() {
  const [cold, setCold] = useState<number | null>(45);
  const [frozen, setFrozen] = useState<number | null>(-180);
  const [staffId, setStaffId] = useState<Id | null>(null);
  const [action, setAction] = useState('');
  return (
    <div className={GRID}>
      <TemperatureField
        label={t.temperature.cold}
        hint={t.temperature.coldHint}
        value={cold}
        onChange={setCold}
      />
      <TemperatureField
        label={t.temperature.frozen}
        hint={t.temperature.frozenHint}
        value={frozen}
        onChange={setFrozen}
      />
      <StaffPicker label={t.temperature.who} value={staffId} onChange={setStaffId} />
      <TextArea
        label={t.temperature.action}
        placeholder={t.temperature.actionPlaceholder}
        optional
        rows={2}
        value={action}
        onChange={setAction}
      />
    </div>
  );
}

function ArticleExample() {
  const [query, setQuery] = useState('');
  const [name, setName] = useState('Lachsfilet');
  const [category, setCategory] = useState<ArticleCategoryId | null>('fish');
  const [dateKind, setDateKind] = useState<DateKind | null>('use_by');
  const [shelfLife, setShelfLife] = useState<number | null>(3);
  const [yieldBps, setYieldBps] = useState<number | null>(9000);
  const [origin, setOrigin] = useState<string | null>('NO');
  const [allergens, setAllergens] = useState<AllergenId[]>(['fish']);
  const [traces, setTraces] = useState<AllergenId[]>(['crustaceans']);
  const [days, setDays] = useState<Weekday[]>(['tue', 'fri']);
  const [active, setActive] = useState(true);
  const [recipeId, setRecipeId] = useState<Id | null>(null);
  const [course, setCourse] = useState<Course | null>('main');
  const [portions, setPortions] = useState<number | null>(10);
  return (
    <div className="space-y-5">
      <SearchField
        label={t.article.search}
        hideLabel
        placeholder={t.article.searchPlaceholder}
        value={query}
        onChange={setQuery}
      />
      <div className={GRID}>
        <TextField
          label={t.article.name}
          placeholder={t.article.namePlaceholder}
          required
          maxLength={120}
          value={name}
          onChange={setName}
        />
        <CategoryPicker label={t.article.category} value={category} onChange={setCategory} />
        <ChoiceChips
          legend={t.article.dateKind}
          className="sm:col-span-2"
          options={t.article.dateKinds}
          segmented
          value={dateKind}
          onChange={setDateKind}
        />
        <NumberField
          label={t.article.shelfLife}
          hint={t.article.shelfLifeHint}
          suffix={t.article.days}
          min={1}
          max={3650}
          value={shelfLife}
          onChange={setShelfLife}
        />
        <PercentField
          label={t.article.yield}
          hint={t.article.yieldHint}
          min={100}
          value={yieldBps}
          onChange={setYieldBps}
        />
        <CountryPicker label={t.article.origin} value={origin} onChange={setOrigin} />
        <RecipePicker
          label={t.article.recipe}
          kind="component"
          optional
          value={recipeId}
          onChange={setRecipeId}
        />
        <SelectField
          label={t.article.course}
          options={COURSES.map((each) => ({ value: each, label: courseLabel(each) }))}
          value={course}
          onChange={setCourse}
        />
        <NumberField label={t.article.portions} min={1} value={portions} onChange={setPortions} />
        <Combobox
          label={t.article.categorySearch}
          hint={t.article.categorySearchHint}
          className="sm:col-span-2"
          options={ARTICLE_CATEGORIES.map((each) => ({ value: each.id, label: each.label }))}
          value={category}
          onChange={setCategory}
        />
      </div>
      <AllergenPicker legend={t.article.contains} value={allergens} onChange={setAllergens} />
      <AllergenPicker
        legend={t.article.traces}
        hint={t.article.tracesHint}
        unavailable={allergens}
        value={traces.filter((id) => !allergens.includes(id))}
        onChange={setTraces}
      />
      <MultiChoiceChips
        legend={t.article.deliveryDays}
        options={t.article.weekdays}
        value={days}
        onChange={setDays}
      />
      <Switch
        label={t.article.active}
        description={t.article.activeText}
        checked={active}
        onChange={setActive}
      />
    </div>
  );
}

function PhotoExample() {
  const [empty, setEmpty] = useState<Photo | null>(null);
  const [stored, setStored] = useState<Photo | null>(SHELF_DRAWING);
  return (
    <div className={GRID}>
      <PhotoField
        label={t.photo.empty}
        hint={t.photo.emptyHint}
        value={empty}
        onChange={setEmpty}
      />
      <PhotoField label={t.photo.stored} value={stored} onChange={setStored} />
      <div className="max-w-sm sm:col-span-2">
        <ZoomablePhoto src={SHELF_DRAWING} title={t.photo.alone} className="aspect-[4/3]" />
      </div>
    </div>
  );
}

function StatesExample() {
  const [name, setName] = useState('Butter');
  const [quantity, setQuantity] = useState<number | null>(5000);
  const [date, setDate] = useState<LocalDate | null>(null);
  const [kind, setKind] = useState<'expired' | 'spoiled' | 'overproduction' | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const nothing = () => undefined;
  return (
    <div className="space-y-5">
      <div className={GRID}>
        <TextField
          label={t.states.name}
          error={t.states.nameError}
          value={name}
          onChange={setName}
        />
        <QuantityField
          label={t.states.quantity}
          unit="g"
          error={t.states.quantityError}
          value={quantity}
          onChange={setQuantity}
        />
        <DateField
          label={t.states.date}
          error={date === null ? t.states.dateError : undefined}
          presets={[{ label: 'heute', days: 0 }]}
          value={date}
          onChange={setDate}
        />
        <MoneyField
          label={t.states.price}
          hint={t.states.priceHint}
          disabled
          value={rappen(4200)}
          onChange={nothing}
        />
        <AreaPicker label={t.states.area} disabled value={null} onChange={nothing} />
        <TextArea label={t.states.note} disabled rows={1} value="" onChange={nothing} />
      </div>
      <ChoiceChips
        legend={t.states.kind}
        options={t.states.kinds}
        error={kind === null ? t.states.kindError : undefined}
        value={kind}
        onChange={setKind}
      />
      <Switch label={t.states.shown} checked disabled onChange={nothing} />
      <Checkbox label={t.states.confirmed} checked={confirmed} onChange={setConfirmed} disabled />
      <FormActions
        placement="inline"
        primaryLabel={t.states.save}
        onPrimary={nothing}
        primaryDisabled
        error={t.states.saveError}
      />
    </div>
  );
}

/** The action row as a page has it: on the phone it sticks above the tab bar. */
function StickyExample() {
  const nothing = () => undefined;
  return (
    <FormActions
      primaryLabel={t.states.save}
      onPrimary={nothing}
      secondaryLabel={t.states.discard}
      onSecondary={nothing}
      summary={t.states.sticky}
    />
  );
}

/** Fields and pickers of the UI kit, shown with real states and examples from a kitchen. */
export function FormsSection() {
  return (
    <section aria-labelledby="styleguide-forms" className="space-y-8">
      <div>
        <h2 id="styleguide-forms" className="text-2xl font-semibold">
          {t.title}
        </h2>
        <p className="text-ink-muted">{t.intro}</p>
      </div>
      <Group title={t.receipt.title} text={t.receipt.text}>
        <ReceiptExample />
      </Group>
      <Group title={t.temperature.title} text={t.temperature.text}>
        <TemperatureExample />
      </Group>
      <Group title={t.article.title} text={t.article.text}>
        <ArticleExample />
      </Group>
      <Group title={t.photo.title} text={t.photo.text}>
        <PhotoExample />
      </Group>
      <Group title={t.states.title} text={t.states.text} after={<StickyExample />}>
        <StatesExample />
      </Group>
    </section>
  );
}
