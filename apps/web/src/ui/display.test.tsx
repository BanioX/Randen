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
        <Button variant="ghost">Journal</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Abschreiben' }).className).toContain('w-full');
    expect(screen.getByRole('button', { name: 'Löschen' }).className).toContain('bg-danger');
    expect(screen.getByRole('button', { name: 'Journal' }).className).toContain('text-wine-700');
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

describe('StatTile and KpiGrid', () => {
  it('shows label, figure in tabular numbers, unit and hint', () => {
    page(<StatTile label="Lagerwert" unit="CHF" value="18’420.50" hint="62 Artikel an Lager" />);
    expect(screen.getByText('Lagerwert')).toBeTruthy();
    expect(screen.getByText('CHF')).toBeTruthy();
    expect(screen.getByText('18’420.50').className).toContain('tabular-nums');
    expect(screen.getByText('62 Artikel an Lager')).toBeTruthy();
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

  it('lays the tiles out two by two on the phone and four across with room', () => {
    const { container } = page(
      <KpiGrid>
        <StatTile label="A" value="1" />
        <StatTile label="B" value="2" />
      </KpiGrid>,
    );
    const grid = container.querySelector('.grid');
    expect(grid?.className).toContain('grid-cols-2');
    expect(grid?.className).toContain('@2xl:grid-cols-4');
    expect(grid?.children).toHaveLength(2);
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
    expect(alert.className).toContain('bg-today-bg');
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
