import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Package, PackageOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { BackLink } from './BackLink';
import { Button, ButtonLink } from './Button';
import { Card } from './Card';
import { DishPhoto } from './DishPhoto';
import { EmptyState } from './EmptyState';
import { GroupedList, GroupedListItem, ListRow } from './GroupedList';
import { Notice } from './Notice';
import { PageHeader } from './PageHeader';
import { Section } from './Section';
import { KpiGrid, StatTile } from './StatTile';
import { StatusChip } from './StatusChip';
import { toneClasses, type Tone } from './tones';

function page(children: ReactNode) {
  return render(<MemoryRouter>{children}</MemoryRouter>);
}

describe('Button and ButtonLink', () => {
  it('is 48 px by default and 44 px in the small size', () => {
    render(
      <>
        <Button>Sichern</Button>
        <Button size="sm">Drucken</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Sichern' }).className).toContain('min-h-12');
    expect(screen.getByRole('button', { name: 'Drucken' }).className).toContain('min-h-11');
    expect(screen.getByRole('button', { name: 'Sichern' }).getAttribute('type')).toBe('button');
  });

  it('gives a link the same look as a button', () => {
    page(
      <>
        <Button variant="secondary" size="sm" icon={Package}>
          Inventur
        </Button>
        <ButtonLink variant="secondary" size="sm" icon={Package} to="/stock/count">
          Inventur öffnen
        </ButtonLink>
      </>,
    );
    const link = screen.getByRole('link', { name: 'Inventur öffnen' });
    expect(link.getAttribute('href')).toBe('/stock/count');
    expect(link.className).toBe(screen.getByRole('button', { name: 'Inventur' }).className);
    expect(link.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('fills the width on request and keeps every variant', () => {
    render(
      <>
        <Button fullWidth>Abschreiben</Button>
        <Button variant="danger">Löschen</Button>
        <Button variant="danger-solid">Endgültig löschen</Button>
        <Button variant="ghost">Journal</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Abschreiben' }).className).toContain('w-full');
    expect(screen.getByRole('button', { name: 'Löschen' }).className).toContain('border-danger/40');
    expect(screen.getByRole('button', { name: 'Löschen' }).className).toContain('text-danger');
    expect(screen.getByRole('button', { name: 'Löschen' }).className).not.toMatch(
      /(^|\s)bg-danger(\s|$)/,
    );
    expect(screen.getByRole('button', { name: 'Endgültig löschen' }).className).toContain(
      'bg-danger',
    );
    expect(screen.getByRole('button', { name: 'Endgültig löschen' }).className).toContain(
      'text-white',
    );
    expect(screen.getByRole('button', { name: 'Journal' }).className).toContain('text-wine-700');
  });
});

describe('Button busy', () => {
  it('turns its symbol, keeps its label, cannot be pressed again and does not fade', () => {
    render(
      <>
        <Button busy icon={Package}>
          Sichern
        </Button>
        <Button>Weiter</Button>
      </>,
    );
    const busy = screen.getByRole<HTMLButtonElement>('button', { name: 'Sichern' });
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(busy.getAttribute('aria-disabled')).toBe('true');
    expect(busy.disabled).toBe(false);
    expect(busy.querySelector('svg')?.getAttribute('class')).toContain('animate-spin');
    expect(busy.className).not.toContain('disabled:opacity-50');
    const idle = screen.getByRole<HTMLButtonElement>('button', { name: 'Weiter' });
    expect(idle.hasAttribute('aria-busy')).toBe(false);
    expect(idle.disabled).toBe(false);
  });
});

describe('Card', () => {
  it('is white with the soft shadow, and Traube as the one dark card', () => {
    const { container } = render(
      <>
        <Card>Normal</Card>
        <Card variant="premium" padding="compact">
          Leitzahl
        </Card>
        <Card variant="tip">Hinweis</Card>
      </>,
    );
    const [normal, premium, tip] = [...container.children];
    expect(normal?.className).toContain('bg-surface');
    expect(normal?.className).toContain('shadow-card');
    expect(premium?.className).toContain('bg-grape');
    expect(premium?.className).toContain('px-4 py-3');
    expect(tip?.className).toContain('bg-wine-50');
  });
});

describe('PageHeader', () => {
  it('leads with the large title as the h1, the back link above and the actions beside it', () => {
    page(
      <PageHeader
        title="Kühlzelle 1"
        subtitle="42 Chargen"
        back={{ to: '/stock', label: 'Lager' }}
        actions={<Button>Wareneingang</Button>}
      />,
    );
    const title = screen.getByRole('heading', { level: 1, name: 'Kühlzelle 1' });
    expect(title.className).toContain('large-title');
    const back = screen.getByRole('link', { name: 'Lager' });
    expect(back.getAttribute('href')).toBe('/stock');
    expect(back.className).toContain('min-h-11');
    // The back link stands before the title in the page.
    expect(back.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('42 Chargen')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Wareneingang' })).toBeTruthy();
  });

  it('works with a title alone', () => {
    page(<PageHeader title="Zahlen" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Zahlen' })).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('PageHeader actions below tablet width', () => {
  it('sets two or more actions in equal-width cells, also when they come as one fragment', () => {
    page(
      <PageHeader
        title="Kühlzelle 1"
        actions={
          <>
            <Button>Wareneingang</Button>
            <Button variant="secondary">Inventur</Button>
          </>
        }
      />,
    );
    const row = screen.getByRole('button', { name: 'Wareneingang' }).parentElement;
    expect(row?.classList.contains('grid')).toBe(true);
    expect(row?.classList.contains('grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))]')).toBe(true);
    expect(row?.className).toContain('[&>*]:w-full');
    expect(row?.className).toContain('md:flex');
    expect(row?.className).toContain('md:[&>*]:w-auto');
  });

  it('keeps a single action in its natural width', () => {
    page(<PageHeader title="Zahlen" actions={<Button>Drucken</Button>} />);
    const row = screen.getByRole('button', { name: 'Drucken' }).parentElement;
    expect(row?.classList.contains('grid')).toBe(false);
    expect(row?.classList.contains('flex')).toBe(true);
    expect(row?.className).not.toContain('[&>*]:w-full');
  });
});

describe('BackLink', () => {
  it('names the page it leads back to', () => {
    page(<BackLink to="/recipes" label="Rezepte" />);
    expect(screen.getByRole('link', { name: 'Rezepte' }).getAttribute('href')).toBe('/recipes');
  });
});

describe('Section', () => {
  it('is a region named by its heading', () => {
    page(
      <Section title="Läuft bald ab" hint="Die nächsten drei Tage">
        <p>Inhalt</p>
      </Section>,
    );
    const region = screen.getByRole('region', { name: 'Läuft bald ab' });
    expect(within(region).getByRole('heading', { level: 2, name: 'Läuft bald ab' })).toBeTruthy();
    expect(within(region).getByText('Die nächsten drei Tage')).toBeTruthy();
    expect(within(region).getByText('Inhalt')).toBeTruthy();
  });

  it('has a small caps style for grouped lists and a deeper level for nested blocks', () => {
    page(
      <Section title="Kühlzelle 1" titleStyle="group" level={3}>
        <p>Inhalt</p>
      </Section>,
    );
    const heading = screen.getByRole('heading', { level: 3, name: 'Kühlzelle 1' });
    expect(heading.className).toContain('uppercase');
  });

  it('offers a link or a button on the right, each a 44 px target', async () => {
    const onClick = vi.fn();
    page(
      <>
        <Section title="Chargen" action={{ label: 'Alle anzeigen', to: '/stock' }}>
          <p>a</p>
        </Section>
        <Section title="Verkäufe" action={{ label: 'Erfassen', onClick }}>
          <p>b</p>
        </Section>
      </>,
    );
    const link = screen.getByRole('link', { name: 'Alle anzeigen' });
    expect(link.getAttribute('href')).toBe('/stock');
    expect(link.className).toContain('min-h-11');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Erfassen' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('GroupedList and ListRow', () => {
  it('is a list of rows; a row with a target is one link with everything in it', () => {
    page(
      <GroupedList label="Chargen">
        <ListRow
          icon={Package}
          title="Rindsfilet"
          subtitle="2.4 kg · Regal 2"
          meta="Lieferung vom 12.11."
          trailing={<StatusChip tone="today">heute</StatusChip>}
          to="/stock/lots/1"
        />
        <ListRow title="Zwiebeln" subtitle="12 kg" />
      </GroupedList>,
    );
    const list = screen.getByRole('list', { name: 'Chargen' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    const link = within(list).getByRole('link');
    expect(link.getAttribute('href')).toBe('/stock/lots/1');
    expect(link.textContent).toBe('Rindsfilet2.4 kg · Regal 2Lieferung vom 12.11.heute');
    expect(link.className).toContain('min-h-14');
    // Icon tile and chevron are decoration.
    expect(link.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(2);
  });

  it('is a button when it has an action, and plain text otherwise', async () => {
    const onClick = vi.fn();
    page(
      <GroupedList>
        <ListRow title="Regal 2, oben" onClick={onClick} />
        <ListRow title="Trockenlager" />
      </GroupedList>,
    );
    const button = screen.getByRole('button', { name: 'Regal 2, oben' });
    expect(button.className).toContain('min-h-14');
    expect(button.querySelector('svg')).not.toBeNull();
    await userEvent.setup().click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    const plain = screen.getByText('Trockenlager').closest('li');
    expect(plain?.querySelector('a, button, svg')).toBeNull();
  });

  it('starts the hairline where the text starts', () => {
    page(
      <GroupedList>
        <ListRow icon={Package} title="Mit Symbol" />
        <ListRow title="Ohne Symbol" />
        <GroupedListItem inset="check">Eigene Zeile</GroupedListItem>
      </GroupedList>,
    );
    const [withIcon, withoutIcon, own] = screen.getAllByRole('listitem');
    expect(withIcon?.className).toContain('before:left-[4.25rem]');
    expect(withoutIcon?.className).toContain('before:left-4');
    expect(own?.className).toContain('before:left-13');
  });

  it('shows a picture instead of the icon tile and never cuts the title off', () => {
    page(
      <GroupedList>
        <ListRow
          picture={<DishPhoto alt="" className="size-10" radius="md" />}
          title="Zürcher Geschnetzeltes mit Rösti"
        />
      </GroupedList>,
    );
    const title = screen.getByText('Zürcher Geschnetzeltes mit Rösti');
    expect(title.className).not.toContain('truncate');
    expect(title.className).toContain('hyphens-calm');
    expect(title.closest('li')?.querySelector('.size-10')).not.toBeNull();
  });
});

describe('ListRow title and amount', () => {
  it('gives the title 14 rem before the amount takes the width, and keeps the trailing words on one line', () => {
    page(
      <GroupedList>
        <ListRow
          title="Rindsfilet"
          subtitle="2.4 kg"
          trailing={<StatusChip tone="danger">Nicht mehr verwenden</StatusChip>}
        />
      </GroupedList>,
    );
    const titleColumn = screen.getByText('Rindsfilet').parentElement;
    expect(titleColumn?.className).toContain('min-w-[min(14rem,100%)]');
    expect(screen.getByText('Nicht mehr verwenden').closest('.whitespace-nowrap')).not.toBeNull();
  });

  it('lets free words in the trailing slot wrap inside the row, and keeps an amount on one line', () => {
    const words =
      'Kerntemperatur nachmessen, Charge sperren und die Küchenleitung vor dem Ausgeben informieren';
    page(
      <GroupedList>
        <ListRow title="Massnahme" trailing={words} trailingWords />
        <ListRow title="Wert" trailing="CHF 412.60" />
      </GroupedList>,
    );
    const text = screen.getByText(words);
    expect(text.className).toContain('break-words');
    expect(text.className).toContain('whitespace-normal');
    expect(text.className).not.toContain('whitespace-nowrap');
    expect(text.parentElement?.className).not.toContain('whitespace-nowrap');
    const amount = screen.getByText('CHF 412.60');
    expect(amount.className).toContain('whitespace-nowrap');
    expect(amount.className).not.toContain('break-words');
  });
});

describe('StatTile and KpiGrid', () => {
  it('shows label, figure in tabular numbers, unit and hint', () => {
    page(<StatTile label="Lagerwert" unit="CHF" value="18’420.50" hint="62 Artikel an Lager" />);
    expect(screen.getByText('Lagerwert').className).toContain('min-h-[2lh]');
    expect(screen.getByText('CHF')).toBeTruthy();
    expect(screen.getByText('18’420.50').className).toContain('tabular-nums');
    expect(screen.getByText('62 Artikel an Lager')).toBeTruthy();
  });

  it('lets a seven-digit figure shrink inside its tile: a flex item may break, not run out', () => {
    page(<StatTile variant="premium" label="Lagerwert" unit="CHF" value="1’234’567.89" />);
    const figure = screen.getByText('1’234’567.89');
    expect(figure.className).toContain('min-w-0');
    expect(figure.className).toContain('break-words');
    expect(figure.className).toContain('max-w-full');
  });

  it('says its tone in words: the hint of the page, or a standard word', () => {
    const { container } = page(
      <>
        <StatTile label="Wareneinsatz" value="31.2 %" tone="ok" hint="Ziel 32 %" />
        <StatTile label="Abschreiber" value="CHF 212.40" tone="danger" />
        <StatTile label="Verkäufe" value="148" />
      </>,
    );
    const [withHint, withoutHint, plain] = [...container.children];
    expect(withHint?.textContent).toBe('Wareneinsatz31.2 %Ziel 32 %');
    expect(withHint?.querySelector('.bg-ok')).not.toBeNull();
    expect(withHint?.querySelector('.text-ok')).not.toBeNull();
    expect(withoutHint?.textContent).toBe('AbschreiberCHF 212.40Prüfen');
    expect(withoutHint?.querySelector('.bg-danger')).not.toBeNull();
    expect(plain?.querySelector('.rounded-full')).toBeNull();
  });

  it('is a link to the page behind the figure when it has a target', () => {
    page(
      <StatTile
        label="Läuft heute ab"
        value="6"
        tone="danger"
        hint="Zuerst verarbeiten"
        to="/stock"
      />,
    );
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/stock');
    expect(link.textContent).toBe('Läuft heute ab6Zuerst verarbeiten');
  });

  it('is the one dark tile as «premium»: Traube with its label in Kork', () => {
    const { container } = page(
      <StatTile variant="premium" label="Lagerwert" value="CHF 18’420.50" tone="ok" />,
    );
    expect(container.firstElementChild?.className).toContain('bg-grape');
    expect(screen.getByText('Lagerwert').className).toContain('text-cork');
    expect(screen.getByText('CHF 18’420.50').className).toContain('text-white');
    // On Traube the dot is Kork and the words are quiet: the green would not be readable there.
    expect(container.querySelector('.bg-cork')).not.toBeNull();
    expect(container.querySelector('.text-ok')).toBeNull();
  });

  it.each([
    [2, '@2xl:grid-cols-2'],
    [3, '@2xl:grid-cols-3'],
    [4, '@2xl:grid-cols-4'],
  ])('shows %i figures in %s from tablet width', (count, columns) => {
    const { container } = page(
      <KpiGrid>
        {Array.from({ length: count }, (_, index) => (
          <StatTile key={index} label={`Kennzahl ${index + 1}`} value={String(index + 1)} />
        ))}
      </KpiGrid>,
    );
    const grid = container.querySelector('.grid');
    expect(grid?.classList.contains('grid-cols-2')).toBe(true);
    expect(grid?.classList.contains(columns)).toBe(true);
    expect(grid?.children).toHaveLength(count);
  });

  it('lets the last of an odd count span both phone columns, and only from tablet width one', () => {
    const { container } = page(
      <KpiGrid>
        <StatTile label="A" value="1" />
        <StatTile label="B" value="2" />
        <StatTile label="C" value="3" />
      </KpiGrid>,
    );
    const grid = container.querySelector('.grid');
    expect(grid?.classList.contains('[&>*:last-child:nth-child(odd)]:col-span-2')).toBe(true);
    expect(grid?.classList.contains('@2xl:[&>*:last-child:nth-child(odd)]:col-span-1')).toBe(true);
  });

  it('gives the lead figure of the premium tile the largest step its width allows', () => {
    page(
      <>
        <StatTile label="Lagerwert" value="18’420.50" />
        <StatTile variant="premium" label="Lagerwert Leitzahl" value="18’420.50" />
      </>,
    );
    const [plain, lead] = screen.getAllByText('18’420.50');
    // Both start at the phone size, so a seven-digit lead figure fits a 390 px tile.
    expect(plain?.className).toContain('text-xl');
    expect(plain?.className).toContain('@[12.5rem]:text-2xl');
    expect(plain?.className).toContain('@[14.5rem]:text-[1.75rem]');
    expect(lead?.className).toContain('text-xl');
    expect(lead?.className).toContain('@[12.5rem]:text-2xl');
    expect(lead?.className).toContain('@[15.25rem]:text-3xl');
    expect(lead?.className).toContain('@[17rem]:text-[2.125rem]');
    expect(lead?.className).toContain('break-words');
  });
});

describe('EmptyState', () => {
  it('says what will stand here and offers the way forward', () => {
    page(
      <EmptyState
        icon={PackageOpen}
        title="Noch keine Chargen"
        text="Sobald du einen Wareneingang erfasst, steht hier dein Lager."
        action={<ButtonLink to="/stock/receive">Wareneingang erfassen</ButtonLink>}
      />,
    );
    expect(screen.getByText('Noch keine Chargen')).toBeTruthy();
    expect(
      screen.getByText('Sobald du einen Wareneingang erfasst, steht hier dein Lager.'),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Wareneingang erfassen' }).getAttribute('href')).toBe(
      '/stock/receive',
    );
  });
});

describe('Notice', () => {
  it('is a status for calm tones and an alert for danger, each with an icon', () => {
    render(
      <>
        <Notice title="Inventur am Monatsende">Zähle das Lager am 30.11.</Notice>
        <Notice tone="ok" title="Alle Temperaturen im Bereich" />
        <Notice tone="soon" title="6 Chargen laufen bald ab" />
        <Notice tone="danger" title="Tiefkühlzelle zu warm">
          Gemessen -12.4 °C.
        </Notice>
      </>,
    );
    const statuses = screen.getAllByRole('status');
    expect(statuses.map((status) => status.textContent)).toEqual([
      'Inventur am MonatsendeZähle das Lager am 30.11.',
      'Alle Temperaturen im Bereich',
      '6 Chargen laufen bald ab',
    ]);
    expect(statuses.map((status) => /bg-[a-z0-9-]+/.exec(status.className)?.[0])).toEqual([
      'bg-wine-50',
      'bg-ok-bg',
      'bg-soon-bg',
    ]);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Tiefkühlzelle zu warmGemessen -12.4 °C.');
    expect(alert.className).toContain('bg-danger-bg');
    for (const notice of [...statuses, alert]) {
      expect(notice.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('carries one action and has a compact row form', () => {
    render(
      <Notice tone="soon" variant="row" action={<Button size="sm">Preis erfassen</Button>}>
        Bei 2 Zutaten fehlt der Preis.
      </Notice>,
    );
    const notice = screen.getByRole('status');
    expect(within(notice).getByRole('button', { name: 'Preis erfassen' })).toBeTruthy();
    expect(notice.className).toContain('rounded-xl');
  });
});

describe('StatusChip and tones', () => {
  const TONES: Tone[] = [
    'ok',
    'soon',
    'today',
    'danger',
    'cold',
    'frozen',
    'dry',
    'bar',
    'grape',
    'neutral',
    'wine',
  ];

  it('has chip, dot, solid and text classes for every tone, from tokens only', () => {
    expect(Object.keys(toneClasses).sort()).toEqual([...TONES].sort());
    for (const tone of TONES) {
      const classes = toneClasses[tone];
      for (const value of [classes.chip, classes.dot, classes.solid, classes.text]) {
        expect(value, tone).not.toBe('');
        expect(value, tone).not.toMatch(/#|rgb|\[/);
      }
      expect(classes.chip, tone).toMatch(/\bbg-\S+ text-\S+/);
    }
  });

  it('shows «wrong» as a vermilion tint with a fine edge, not as a filled chip', () => {
    expect(toneClasses.danger.chip).toContain('bg-danger-bg');
    expect(toneClasses.danger.chip).toContain('text-danger');
    expect(toneClasses.danger.chip).toContain('border-danger/40');
    expect(toneClasses.danger.chip).not.toMatch(/(^|\s)bg-danger(\s|$)/);
  });

  it('gives «due today» the wine accent: no vermilion, no red edge', () => {
    expect(toneClasses.today.chip).toBe('bg-today-bg text-today');
    expect(toneClasses.today.text).toBe('text-today');
    expect(toneClasses.today.chip).not.toContain('danger');
    expect(toneClasses.today.chip).not.toContain('border');
  });

  it('marks «Beste Marge» in Kork on Traube', () => {
    render(<StatusChip tone="grape">Beste Marge</StatusChip>);
    const chip = screen.getByText('Beste Marge').parentElement;
    expect(chip?.className).toContain('bg-grape');
    expect(chip?.className).toContain('text-cork');
  });

  it('grows with its text instead of cutting it off, and has an outline form', () => {
    render(
      <StatusChip tone="neutral" outline size="sm">
        Spuren: Nüsse
      </StatusChip>,
    );
    const chip = screen.getByText('Spuren: Nüsse').parentElement;
    expect(chip?.className).toContain('border');
    expect(chip?.className).not.toContain('truncate');
    expect(chip?.className).not.toContain('whitespace-nowrap');
  });
});

describe('DishPhoto', () => {
  const PHOTO = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E';

  it('shows the picture in a frame of fixed proportions and never takes the click', () => {
    const { container } = render(<DishPhoto photo={PHOTO} alt="Randenrisotto" ratio="card" />);
    const image = screen.getByRole('img', { name: 'Randenrisotto' });
    expect(image.getAttribute('src')).toBe(PHOTO);
    expect(image.className).toContain('pointer-events-none');
    expect(image.className).toContain('object-cover');
    expect(container.firstElementChild?.className).toContain('aspect-4/3');
    expect(container.firstElementChild?.className).toContain('w-full');
  });

  it('is decoration with an empty alt', () => {
    const { container } = render(<DishPhoto photo={PHOTO} alt="" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(container.firstElementChild?.className).toContain('aspect-square');
  });

  it('shows a quiet placeholder without a photo', () => {
    const { container, rerender } = render(<DishPhoto alt="" ratio="wide" className="w-24" />);
    const frame = container.firstElementChild;
    expect(frame?.className).toContain('bg-surface-muted');
    expect(frame?.className).toContain('aspect-video');
    expect(frame?.className).toContain('w-24');
    expect(frame?.className).not.toContain('w-full');
    expect(frame?.getAttribute('aria-hidden')).toBe('true');
    expect(frame?.querySelector('svg')).not.toBeNull();

    rerender(<DishPhoto alt="Rindstatar" icon={Package} />);
    expect(screen.getByRole('img', { name: 'Rindstatar: Kein Foto' })).toBeTruthy();
  });
});
