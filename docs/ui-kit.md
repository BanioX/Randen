# UI-Kit

Die Bausteine von Randen unter `apps/web/src/ui/`. Wer eine Seite baut, nimmt sie von hier und baut sie nicht nach. Alles zusammen läuft unter `/styleguide`. Farben und Haltung: [`design.md`](design.md). Muster für Seiten: [`regeln.md`](regeln.md), Abschnitt H.

Diese Referenz stammt von den Erbauer:innen des Kits; bei Abweichungen gilt der Code.

---

All paths under `apps/web/src/ui/`. Optional props also accept `undefined`, except those of `Card` (`exactOptionalPropertyTypes`). Colours come from tokens only.

## Tones and chips
- `tones.ts`: `type Tone = 'ok'|'soon'|'today'|'danger'|'cold'|'frozen'|'dry'|'bar'|'grape'|'neutral'|'wine'`; `toneClasses: Record<Tone, { chip; dot; solid; text }>` (class strings: tinted chip, dot background, full fill with readable text, tone as text). `today` is the calm wine accent for «due today»; `danger` (vermilion on `danger-bg`, with a fine border) is only for what is wrong.
- `StatusChip.tsx`: `StatusChip({ tone: Tone; children; icon?: LucideIcon; size?: 'md'|'sm'; outline?: boolean })`. Wraps instead of truncating.

## Buttons and cards
- `Button.tsx`: `Button({ variant?: 'primary'|'secondary'|'ghost'|'danger'|'danger-solid'; size?: 'md'|'sm'; icon?: LucideIcon; fullWidth?: boolean; busy?: boolean; className?; ...button attributes })`. `md` is 48 px, `sm` is 44 px; `type` defaults to `'button'`. `danger` is an outline for ordinary pages; `danger-solid` is only for the confirming step (`ConfirmDialog` with `tone="danger"`, `DeleteSection`). `busy` means the action runs: the label stays, the symbol turns, `aria-busy`, a press is ignored, focus stays (it is `aria-disabled`, not `disabled`). Use `disabled` only for «not possible now».
- `ButtonLink({ to; variant?; size?; icon?; fullWidth?; className?; ...react-router LinkProps })`: same look as `Button`.
- Types `ButtonVariant`, `ButtonSize`.
- `Card.tsx`: `Card({ children; variant?: 'default'|'tip'|'premium'; padding?: 'normal'|'compact'; className? })`.

## Page structure
- `BackLink.tsx`: `BackLink({ to: string; label: string })`.
- `PageHeader.tsx`: `PageHeader({ title: string; subtitle?: ReactNode; back?: { to: string; label: string }; actions?: ReactNode; level?: 1|2 })`. Renders the h1 with `large-title`; actions sit beside the title from md, below it on the phone; two or more actions become equal-width rows on the phone.
- `Section.tsx`: `Section({ title: string; titleStyle?: 'title'|'group'; action?: SectionAction; hint?: string; level?: 2|3; children; className? })`. `'title'` (default) is a 20 px heading, `'group'` the small caps iOS header. `type SectionAction = { label: string; to: string } | { label: string; onClick: () => void }`. Renders `<section aria-labelledby>`.
- `EmptyState.tsx`: `EmptyState({ icon: LucideIcon; title: string; text: string; action?: ReactNode; variant?: 'card'|'plain' })`.
- `Notice.tsx`: `Notice({ tone?: 'info'|'ok'|'soon'|'danger'; title?: string; children?: ReactNode; icon?: LucideIcon; action?: ReactNode; variant?: 'card'|'row' })`. `role="alert"` for danger, `role="status"` otherwise. Type `NoticeTone`.

## Lists
- `GroupedList.tsx`: `GroupedList({ children; label?: string })` renders the `<ul>`.
- `GroupedListItem({ children; inset?: 'icon'|'check'|'text'; className? })` for rows of your own.
- `GROUPED_ROW_LINK`: class string for a block link that fills such a row.
- `ListRow({ title: string; subtitle?: ReactNode; meta?: ReactNode; icon?: LucideIcon; iconTone?: Tone; picture?: ReactNode; trailing?: ReactNode; trailingWords?: boolean; to?: string; onClick?: () => void })`. `trailing` stays on one line (money, chips); with `trailingWords` it is free text that wraps. Must be a child of `GroupedList`. With `to` it is a link, with `onClick` a button, both with a chevron; min-h-14. `trailing` wraps under the text when the row is narrow. Pass only phrasing content (spans) into the slots.

## Key figures
- `StatTile.tsx`: `StatTile({ label: string; value: string; unit?: string; hint?: string; tone?: StatTone; to?: string; variant?: 'default'|'premium'; trend?: ReactNode })`.
  - `unit` is shown small before the figure. For money: `unit={money.symbol} value={money.format(amount, { currency: false })}`.
  - `tone` puts a dot before the hint; without a hint a standard word is shown.
  - `premium` is the one dark Traube tile.
  - The label reserves two lines, so the values of a row stay on one line.
  - The tile is a size container: use it inside `KpiGrid` or another grid or block.
- `type StatTone = 'ok'|'soon'|'today'|'danger'|'neutral'`: use `today` for what is due today and `danger` only for what is wrong.
- `KpiGrid({ children })`: 2 columns on the phone; from 42rem (`@2xl`) as many columns as tiles (2, 3 or 4). On the phone the last tile of an odd count spans both columns. Type `StatTone`.

## Choice and tables
- `SegmentedControl.tsx`: `SegmentedControl<T extends string>({ label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void; hideLabel?: boolean; className? })`. `role="radiogroup"` with `role="radio"` buttons; arrow keys, Home and End move and choose. Type `Segment<T>`.
- `DataTable.tsx`: `DataTable<Row>({ columns: readonly DataTableColumn<Row>[]; rows: readonly Row[]; getRowKey: (row) => string; caption: string; hideCaption?: boolean; rowLink?: (row) => string | undefined; footer?: Record<columnKey, ReactNode>; empty?: ReactNode; maxHeight?: string })`.
  - `interface DataTableColumn<Row> { key: string; header: string; align?: 'left'|'right'; render: (row: Row) => ReactNode; hideBelow?: 'md'|'lg'; width?: string }`.
  - The first column is the row header and, with `rowLink`, the link; a click anywhere in the row follows it.
  - `align: 'right'` adds tabular figures and nowrap.
  - `maxHeight` (a CSS length) makes the rows scroll under the sticky header.
  - Needs a router around it (`useNavigate`).

## Dialogs and toasts
- `Sheet.tsx`: `Sheet({ open: boolean; onClose: () => void; title: string; children; footer?: ReactNode; role?: 'dialog'|'alertdialog'; hideClose?: boolean })`.
  - Bottom sheet on the phone, centred dialog from md, built on `<dialog>.showModal()`; works in jsdom without a polyfill.
  - `onClose` fires for Escape, the close button, a tap beside the panel and the back gesture; the page then sets `open`.
  - Content is rendered only while open. Initial focus goes to the element with `data-autofocus`, else the first focusable one.
- `ConfirmDialog({ open: boolean; title: string; text: string; confirmLabel: string; cancelLabel?: string; tone?: 'danger'|'default'; onConfirm: () => void; onCancel: () => void })`. `role="alertdialog"`; with `danger` the focus starts on «Abbrechen».
- `Toast.tsx`: `ToastProvider({ children })`; `useToast(): ShowToast`. Usage: `const toast = useToast(); toast({ text: string; action?: { label: string; onAction: () => void }; tone?: 'neutral'|'ok'|'danger' })`.
  - One toast at a time in a `role="status"` region; it leaves after `TOAST_MS` (5000) and waits while hovered or focused.
  - Without a provider `toast()` does nothing.
  - Types `ToastOptions`, `ShowToast`.

## Printing (`PrintButton.tsx`, `print.ts`, ADR-0019)
- `PrintButton({ label: string; pdf?: PrintPdf; variant?: ButtonVariant (default `secondary`); size?: ButtonSize; icon?: LucideIcon (default `Printer`); disabled?: boolean; className? })`. Every print button of the app is this one. In a browser a tap calls `window.print()`. In the app installed on an iPhone or iPad (`isInstalledIos()`) the tap hands the page's PDF to the share sheet; the button is `busy` until the PDF is built, and `PrintNoticeSheet` explains when it cannot print. A page gets its PDF by passing `pdf`; nothing else changes.
- `PrintNoticeSheet({ action: Pick<PrintAction, 'notice'|'dismiss'|'retry'> })`: the sheet for `pending` (this page has no PDF yet), `buildFailed` (with «Noch einmal») and `failed`.
- `usePrintAction(pdf?: PrintPdf): PrintAction`, for a page with a button of its own (guest view) or one that prints by address (`?drucken=1`, `?print=1`). `interface PrintPdf { buildPdf: (() => Promise<Blob>) | undefined; fileName: string; title?: string }`; `buildPdf` is `undefined` while the data loads. Keep it stable (`useMemo`/`useCallback`): a new function builds again. `interface PrintAction { mode: 'dialog'|'share'; print(): void; printFromAddress(): void; busy: boolean; notice: PrintNotice | null; dismiss(): void; retry(): void }`, `type PrintNotice = 'pending'|'buildFailed'|'failed'`. Call `print` in the tap handler itself, never after an `await`.

## Sharing and saving files (`share-file.ts`, ADR-0019)
- `shareOrDownload(file: File, options?: { title?: string; navigator?: Navigator }): Promise<ShareOutcome>`, `type ShareOutcome = 'shared'|'cancelled'|'downloaded'|'failed'`. It uses the share sheet where `canShareFiles(file)` is true; otherwise, or when the sheet refuses, it downloads. `AbortError` gives `cancelled`; `failed` means the download could not start either. Files go without text. The file must be ready before the tap: call this in the tap handler, not after an `await`.
- `fileHandedOver(outcome: ShareOutcome, installedIos: boolean): boolean`: true when the file is kept somewhere: `shared`, or `downloaded` outside the installed iOS app (there a download only opens a preview). Check it before remembering a backup as saved.
- `isInstalledIos(device?: Device): boolean` (iPhone or iPad, opened from the Home Screen; needs an iOS or iPadOS device), `canShareFiles(file: File, navigator?: Navigator): boolean`, `downloadFile(file: Blob, name: string): boolean`; type `Device { navigator: Navigator; matchMedia?: (query) => MediaQueryList }`.
- Tests: `test-helpers.ts`: `pretendInstalledIphone(fields?: Record<string, unknown>): () => void` makes jsdom an installed iPhone app (user agent `IPHONE_AGENT`, `navigator.standalone`, plus fields such as `share` and `canShare`). Call the returned undo in `finally` or `afterEach`.

## Badges (`badges.tsx`)
All take `size?: 'md'|'sm'`.
- `ExpiryChip({ expiresOn: LocalDate | undefined; dateKind: DateKind; today: LocalDate })`. Texts: «in 12 Tagen», «morgen», «heute», «abgelaufen seit 3 Tagen», «MHD überschritten seit 3 Tagen»; nothing without a date. The first three carry an sr-only prefix «Mindesthaltbarkeit: » or «Verbrauchsdatum: », so query them with a regex.
- `AllergenBadges({ allergens: readonly AllergenId[]; traces?: readonly AllergenId[]; empty?: string })`: phrasing content with `role="list"` named «Allergene»; traces read «Spuren: Nüsse».
- `DietBadge({ diet: Diet })`: omnivore renders nothing.
- `AreaBadge({ kind: AreaKind; name?: string })`.
- `areaLooks: Record<AreaKind, { icon: LucideIcon; tone: Tone }>`: reuse for list tiles.
- `MarginBadge({ status: MarginStatus; foodCostBps?: number; short?: boolean })`: «30 % Wareneinsatz» plus sr-only «, im Ziel» / «, knapp über dem Ziel» / «, über dem Ziel»; `unknown` reads «Preis fehlt»; `short` shows only «30 %».
- `TemperatureBadge({ deciC: number; ok?: boolean })`: sr-only «, im Bereich» / «, ausserhalb des Bereichs».

## Pictures
- `DishPhoto.tsx`: `DishPhoto({ photo?: string; alt: string; ratio?: 'square'|'wide'|'card'; icon?: LucideIcon; radius?: 'md'|'lg'; className? })`. `className` sets the width (default `'w-full'`, e.g. `'size-10'`). `alt=""` makes it decorative; without a photo it shows a placeholder icon.

## Charts (`charts/index.ts`)
- Shared `ChartBaseProps`: `{ summary: string; categoryLabel: string; valueLabel: string; formatValue?: (n: number) => string; showTable?: boolean; className? }`.
  - `summary` is required and becomes the aria-label of the `role="img"` picture.
  - `categoryLabel` and `valueLabel` head the data table, whose caption is «Daten: {valueLabel} nach {categoryLabel}».
  - `formatValue` defaults to `formatDecimal`.
  - The table is sr-only unless `showTable`.
- `BarChart(base + { data: readonly { label; value; second?; tone?: ChartTone }[]; secondLabel?: string; mode?: 'stacked'|'grouped'; target?: { value: number; label: string }; formatTick?; valueLabels?: 'auto'|'all'|'max'|'none'; toneLabels?: Partial<Record<ChartTone, string>>; height?: number })`. Height defaults to 220.
- `HBarChart(base + { data: readonly { label; value; tone? }[] })`: ranked bars, drawn in the order given.
- `LineChart(base + { data: readonly { label; value; second? }[]; secondLabel?: string; formatTick?; height? })`.
- `Donut(base + { parts: readonly { label; value; tone? }[]; centerValue?: string; centerLabel?: string; showShare?: boolean })`: more than 6 parts fold into «Übrige».
- `ProgressBar({ label: string; value: number; max: number; valueText: string; summary: string; tone?: 'wine'|'ok'|'soon'|'danger'|'neutral'; marker?: { value: number; label: string }; hint?: string; className? })`. No data table.
- `Sparkline({ values: readonly number[]; summary: string; onDark?: boolean; className? })`. Default size `'h-7 w-24'`. No data table.
- Also exported: `SERIES_COLORS`, `seriesColor(index)`, `toneColor(tone)`, `ChartLegend({ items: LegendItem[]; layout?: 'row'|'column' })`; types `BarDatum`, `HBarDatum`, `LineDatum`, `DonutPart`, `ProgressTone`, `ChartTone = 'ok'|'soon'|'danger'|'neutral'`, `LegendItem`.
- Values are plain numbers; negative or non-finite ones are drawn as 0. For money pass Rappen and format them: `formatValue={(v) => money.format(rappen(Math.round(v)))}`, with `formatTick` for shorter axis labels.

## PDF (`pdf/`, ADR-0019)
- `pdf/create.ts`: `createPdf({ title: string }): Promise<jsPDF>` starts an A4 portrait document in mm; jsPDF is loaded on first use only.
- `pdf/kit.ts` draws on a `Flow` (`startFlow(doc, y?)`, `newPage(flow)`, `room(flow, height)` starts a page when the height does not fit). Blocks: `titleBlock(flow, { kicker, title, subtitle? })`, `heading(flow, text, keep?)`, `paragraph(flow, text, style: TextStyle, { x?, width?, after? })`, `table(flow, columns: TableColumn<Row>[], rows, { size? })` (the head row repeats on every page), `pills(doc, items: Pill[], box, draw?)`, `columns(doc, box, groups: ColumnGroup[], format, formatTick?)`, `bars(doc, box, rows: BarRow[], { labelWidth, valueWidth })`, `card(doc, box, fill?, radius?)`, `rule(doc, y, options?)`. Last come `footers(doc, { label, printedOn })` and `pdfFile(doc, fileName): File`. Text helpers: `write`, `wrap`, `fit`, `measure`, `lineHeight`, `textHeight`, `niceTicks`; `pdfText(value)` turns any text into what Helvetica can draw (letters outside WinAnsi fall back to their base letter). Colours: `PDF_COLOR`, `PDF_SERIES` (light only, also in dark mode). Measures: `PAGE`, `CONTENT_WIDTH`, `TOP`, `BOTTOM`, `FOOTER`. Money comes formatted from `useMoney().format`, and the PDF reads the same query as the page (example: `features/menu/guest-pdf.ts`).
- `pdf/unused-part.ts`: the empty module that `vite.config.ts` puts in place of html2canvas, canvg and DOMPurify. Never import it.
- Tests: `pdf/test-helpers.ts`: `readPdf(file: Blob): Promise<{ lines: string[]; text: string; pages: number }>` reads the text of a finished PDF.

## Texts and style guide
- `messages.display.ts`: `displayMessages`, the texts of the components above; `messages.files.ts`: `fileMessages`, the texts of printing and PDFs (`print.*`, `pdf.printedOn`, `pdf.page`).
- `features/styleguide/DisplaySection.tsx`: `DisplaySection()`, wrapped in its own `ToastProvider`.

---

# Form side of the UI kit (`apps/web/src/ui/`)

All fields are controlled (`value` / `onChange`). Parsed fields keep the raw text themselves; `onChange` gets the parsed value, or `null` while the text is empty **or unreadable**. Imports are per file, e.g. `import { QuantityField } from '../../ui/QuantityField'`.

## Shared props: `FieldBaseProps` (from `Field.tsx`)
`label: string` (always required, except pickers which have a default) · `hint?: string` · `error?: string | null` (error of the form; a field's own "cannot read this" message wins) · `hideLabel?: boolean` (label sr-only) · `optional?: boolean` (shows «optional» right of the label; not part of the label text) · `required?: boolean` · `disabled?: boolean` · `id?: string` · `name?: string` · `className?: string` (outer element, e.g. `sm:col-span-2`).

## Behaviour every builder must know
- **Errors for unreadable text appear after the field is left (blur), on a submit attempt, or at once if `error` is passed.** In tests: type, then `await user.tab()`, then look for the message.
- **Forms are guarded natively.** A field with unreadable text, or `required` and empty, sets a custom validity. A `<form onSubmit>` with a submit button (`<FormActions primaryLabel="Sichern" />`) is then NOT submitted; the field shows its message (`formMessages.required` = «Hier fehlt eine Angabe.») and the first such field gets focus. Do not put `noValidate` on forms. Without a `<form>`, pass `error` yourself.
- A value set from outside (loaded row, reset to `null`) rewrites the text. A parent that ignores a change leaves the typed text alone. A field holding unreadable text is not cleared by setting `null` again (it already is `null`): remount with a `key` for «Verwerfen».
- Need AppData (render with `renderApp`): `MoneyField`, `UnitPriceField`, `DateField`, `ArticlePicker`, `RecipePicker`, `AreaPicker`, `SpotPicker`, `SupplierPicker`, `StaffPicker`. Everything else renders with plain `render`.
- Label queries: `getByLabelText('<label>')` finds exactly the main input. Exception `UnitPriceField`: the name is `'<label> pro kg' | 'pro l' | 'pro Stk.'`.

## Fields
- `TextField` (`TextField.tsx`): `value: string`, `onChange(value: string)`, `type?: 'text'|'email'|'tel'|'url'`, `inputMode?`, `placeholder?`, `autoComplete?` (default `'off'`), `maxLength?` + base. Required also rejects blanks only.
- `TextArea` (`TextField.tsx`): `value: string`, `onChange`, `rows?` (default 3, grows with text), `placeholder?`, `maxLength?` + base.
- `NumberField`: whole numbers. `value: number | null`, `onChange(value: number | null)`, `min?` (default 0), `max?`, `suffix?` («Tage»), `placeholder?` + base. Accepts `12`, `1’250`, `12,0`; `2.5` or out of range gives `null` + message.
- `QuantityField`: `unit: Unit` (`'g'|'ml'|'pcs'`), `value: number | null` **in base units**, `onChange(value: number | null)`, `entryUnit?: 'kg'|'g'|'l'|'dl'|'ml'|'stk'` (what a bare number means at first; default kg / l), `positive?: boolean` (0 is rejected with a message; default 0 allowed), `placeholder?` + base. Unit switch = radios named `kg`, `g` / `l`, `dl`, `ml` in a group «Einheit für <label>»; pcs has no switch (suffix «Stk.»). Typed units win (`750 g`, `2,5 kg`, `7.5 dl`). Shows «= 2.5 kg» underneath when that differs from what was typed. Switching the unit reinterprets the number. Follows a changed `unit` prop by itself.
- `MoneyField`: `value: Rappen | null`, `onChange(value: Rappen | null)`, `allowNegative?: boolean` (default false), `placeholder?` + base. Uses `useMoney().parse`; currency symbol as prefix; stored value shows as `412.60`.
- `UnitPriceField`: `unit: Unit`, `value: Rappen | null` (= `pricePer1000`), `onChange(value: Rappen | null)`, `placeholder?` + base. Uses `parseUnitPrice` / `formatUnitPrice`.
- `PercentField`: `value: number | null` in **basis points**, `onChange`, `min?` (bps, default 0), `max?` (bps, default 10000), `allowNegative?` (a change, not a share: a sign button «Minus, <label>» sets the minus, the number pad of a phone has none; the price what-if uses -9000 to 30000), `placeholder?` + base. `30` → 3000, `8,1` → 810; more than two decimals is unreadable.
- `TemperatureField`: `value: number | null` in **tenths of a degree**, `onChange`, `placeholder?` + base. Suffix «°C». Toggle button named «Minusgrade, <label>» (`aria-pressed`) sets the sign, because phone number pads have no minus key.
- `SelectField<T extends string>`: `options: readonly { value: T; label: string; disabled?: boolean }[]`, `value: T | null`, `onChange(value: T | null)`, `placeholder?: string` (text of the empty option, default «Bitte wählen») + base. The empty option is offered unless `required` and something is chosen. A value not in `options` shows as empty.
- `DateField`: `value: LocalDate | null`, `onChange(value: LocalDate | null)`, `presets?: readonly { label: string; days: number }[]` (days from today), `min?: LocalDate`, `max?: LocalDate` + base. Text field TT.MM.JJJJ with automatic dots, preview line «Fr, 20. Nov. 2026 · in 6 Tagen», presets are buttons with `aria-pressed` in a group named «Schnellwahl», calendar input named «Kalender öffnen» (`type="date"`, use `fireEvent.change`). Reads `useToday()` itself.
- `CalendarButton` (`CalendarButton.tsx`): `{ value: LocalDate | null; onPick(date); today: LocalDate; label?; describedBy?; min?; max?; disabled? }`.
- `date-text.ts`: `nextDateText(previous, raw, autoFormatting)`, `describeDate(date)` → «Fr, 20. Nov. 2026», `describeRelative(date, today)` → «in 6 Tagen».
- `Switch`: `{ label, description?, checked: boolean, onChange(checked: boolean), disabled?, id?, name?, className? }`. `getByRole('switch', { name })`.
- `Checkbox`: same as Switch plus `error?`, `required?`. `getByRole('checkbox', { name })`.
- `SearchField`: `{ label, hideLabel?, value: string, onChange(value: string), placeholder?, hint?, disabled?, id?, name?, className? }`. `type="search"`; clear button named «Suche leeren» appears when not empty.
- `ChoiceChips<T extends string>` (single, radios): `{ legend, options: readonly { value: T; label; description?; danger?; disabled? }[], value: T | null, onChange(value: T), hideLegend?, segmented?, hint?, error?, disabled?, className? }`. `getByRole('group', { name: legend })`, `getByRole('radio', { name: label })`.
- `MultiChoiceChips<T extends string>` (checkboxes, same file): same but `value: readonly T[]`, `onChange(value: T[])` in the order of `options`; no `segmented`.
- `ChoiceTiles<T extends string>` / `MultiChoiceTiles<T>` (`ui/ChoiceTiles.tsx`): large tiles for a question that stands alone on a screen («Randen einrichten»): `{ legend, options: readonly { value: T; label; detail? }[], value, onChange, hideLegend?, hint?, error?, columns?: 1 | 2 }`. Radios or checkboxes underneath; `getByRole('radio' | 'checkbox', { name: label })`.
- `AllergenPicker`: `{ legend? (default «Allergene»), hideLegend?, value: readonly AllergenId[], onChange(value: AllergenId[]) (sorted by the ordinance), unavailable?: readonly AllergenId[] (shown disabled), hint?, error?, disabled?, className? }`. 14 checkboxes named by `allergenLabel`; `allergenOfficial` as tooltip and description.

## Pickers (`pickers.tsx`)
All take base props with `label` optional, plus `placeholder?`.
- `Combobox<T extends string>`: `options: readonly { value: T; label: string; detail?: string; keywords?: string }[]`, `value: T | null`, `onChange(value: T | null)` + base (label required). `role="combobox"`; list `role="listbox"` named «Vorschläge» with `role="option"` rows; opens on click, typing or arrow keys; ArrowDown/Up walk and wrap, Enter takes the marked row (first hit after typing) without submitting, Escape closes the list only. Search ignores case and accents. The value follows the text: a name typed in full is the value, anything else is `null` with «Das steht nicht in der Liste. Wähle einen Eintrag aus.» after blur. Shows 50 rows at most.
- `ArticlePicker`: `value: Id | null`, `onChange(id: Id | null, article: ArticleRef | null)`, `filter?: (article: ArticleRef) => boolean`, `includeInactive?`. Default label «Artikel». Row detail e.g. «kg · 4 kg an Lager» / «l · nichts an Lager».
- `RecipePicker`: `value: Id | null`, `onChange(id: Id | null, recipe: RecipeRef | null)`, `kind?: 'dish' | 'component'`, `includeInactive?`. Default label «Rezept». Detail «Hauptgang · 4 Portionen» or «Komponente».
- Select-based, `value: Id | null`, `onChange(value: Id | null)`: `AreaPicker` (+ `kinds?: readonly AreaKind[]`, label «Lagerbereich»), `SpotPicker` (+ **`areaId: Id | null`** required; label «Platz», empty option «Ohne festen Platz»; disabled with a hint when no area is chosen or the area has no spots), `SupplierPicker` («Lieferant»), `StaffPicker` (+ `includeInactive?`, label «Person»).
- `CategoryPicker`: `value: ArticleCategoryId | null`, label «Warengruppe». `CountryPicker`: `value: string | null` (ISO code), label «Herkunft», Switzerland first. Neither needs AppData.
- In tests wait for the live query first: `await screen.findByRole('option', { name: 'Kühlzelle' })`, then `user.selectOptions(screen.getByLabelText('Lagerbereich'), 'Kühlzelle')`. Combobox: `await user.type(screen.getByLabelText('Artikel'), 'lachs'); await user.click(await screen.findByRole('option', { name: /Lachsfilet/ }))`.

## Photos
- `PhotoField`: `{ label, hideLabel?, value: Photo | null, onChange(value: Photo | null), hint?, error?, disabled?, className? }`. Without a photo two file inputs named «Foto aufnehmen, <label>» (`capture="environment"`) and «Aus Dateien wählen, <label>»; with one a zoomable preview plus «Ersetzen, <label>» (file input) and a button «Entfernen, <label>». Status «Das Foto wird verkleinert …», failure «Dieses Bild lässt sich nicht lesen. Wähle ein anderes Foto.» In tests mock `./photo` (`compressPhoto`) and use `user.upload`.
- `photo.ts`: `compressPhoto(file: Blob, tools?: PhotoTools): Promise<string>` (JPEG data URL, longest side ≤ 1280 px, under 450 000 characters, rejects for a non-picture); `PHOTO_MAX_SIDE`, `PHOTO_MAX_LENGTH`, `browserPhotoTools`, types `PhotoTools`, `PhotoCanvas`, `PhotoSource`.
- `PhotoViewer.tsx`: `ZoomablePhoto({ src, title, className? })` (button «<title> gross anzeigen» opens full screen) and `PhotoViewer({ src, title, onClose })` (`role="dialog"` named by `title`, button «Schliessen», Escape, focus held and returned).

## FormActions
`{ primaryLabel: string, onPrimary?: () => void, primaryIcon?: LucideIcon, primaryDisabled?: boolean, primaryBusy?: boolean, secondaryLabel?: string, onSecondary?: () => void, summary?: string, error?: string | null, placement?: 'page' | 'inline', className? }`. Without `onPrimary` the main button is `type="submit"`. The secondary button shows only with both label and handler. `error` renders in a `role="alert"` region that is always present (empty without error). `placement="page"` (default): sticky above the tab bar below 1024 px, inline at the end from `lg`; it assumes it sits directly in `<main>` (uses `-mx-4`). Use `placement="inline"` inside cards, sheets and dialogs. `primaryBusy` is the running save (spinner, label stays); `primaryDisabled` only means «nothing to save» or a missing field.

## Building blocks for a control the kit lacks (`Field.tsx`)
`Field({ label, labelSuffix?, hint?, error?, info?, hideLabel?, optional?, id?, className?, children: (control) => ReactNode })` where `control = { id, 'aria-describedby', 'aria-invalid' }` is spread onto the input · `FieldGroup({ legend, hideLegend?, hint?, error?, disabled?, className?, children })` (fieldset) · `FieldError({ id, children })` · `InputBox({ controlId, invalid, disabled?, prefix?, suffix?, className?, children })` with `BOXED_INPUT_CLASS` for the input inside · `controlClass(invalid)` · `FIELD_LABEL_CLASS` · `ParsedField` and `useParsedText({ value, onChange, parse, format, problem, resetKey?, error?, required? })` → `{ ref, text, parsed, error, commit(text), set(text, value), onBlur, onInvalid, submitted }` · `useSubmitGuard(problem: string | null)` → `{ ref, submitted, onInvalid }` · helpers `joinIds`, `firstError`, `fieldLabelId`, `affixId`, `withoutTrailingMark`.

## Texts
`formMessages` in `ui/messages.forms.ts` (checked by `ui/messages.forms.test.ts`). Styleguide: `FormsSection` and `formsSectionTexts` in `features/styleguide/FormsSection.tsx`.

