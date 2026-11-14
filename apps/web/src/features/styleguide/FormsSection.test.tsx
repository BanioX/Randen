import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../app/test-helpers';
import { formMessages } from '../../ui/messages.forms';
import { FormsSection, formsSectionTexts } from './FormsSection';

const t = formsSectionTexts;

/** Every text of the section, including the literal parts of message functions. */
function texts(value: unknown): string[] {
  if (typeof value === 'string' || typeof value === 'function') {
    return [String(value)];
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).flatMap(texts);
  }
  return [];
}

describe('FormsSection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders every field of the kit without an error', async () => {
    const errors = vi.spyOn(console, 'error');
    const warnings = vi.spyOn(console, 'warn');
    await renderApp(<FormsSection />);
    expect(await screen.findByRole('heading', { level: 2, name: t.title })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      t.receipt.title,
      t.temperature.title,
      t.article.title,
      t.photo.title,
      t.states.title,
    ]);
    // The pickers have their lists from the kitchen.
    expect(await screen.findAllByRole('option', { name: 'Kühlzelle' })).not.toHaveLength(0);
    expect(await screen.findByRole('option', { name: 'Metzgerei Muster' })).toBeTruthy();
    expect(await screen.findByRole('option', { name: 'Testperson' })).toBeTruthy();

    // One of each kind is there under its label.
    expect(screen.getByRole('combobox', { name: t.receipt.article })).toBeTruthy();
    expect(screen.getAllByLabelText(t.receipt.quantity)).toHaveLength(2);
    expect(screen.getByLabelText(`${t.receipt.price} pro kg`)).toBeTruthy();
    expect(screen.getByRole('textbox', { name: t.receipt.bestBefore })).toBeTruthy();
    expect(screen.getByLabelText(t.receipt.total)).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>(t.temperature.frozen).value).toBe('-18');
    expect(screen.getByLabelText<HTMLInputElement>(t.article.yield).value).toBe('90');
    expect(screen.getByLabelText<HTMLSelectElement>(t.article.origin).value).toBe('NO');
    expect(screen.getByRole('searchbox', { name: t.article.search })).toBeTruthy();
    expect(screen.getByRole('switch', { name: t.article.active })).toBeTruthy();
    expect(
      within(screen.getByRole('group', { name: t.article.contains })).getAllByRole('checkbox'),
    ).toHaveLength(14);
    expect(screen.getByLabelText(`${formMessages.photo.take}, ${t.photo.empty}`)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: formMessages.photo.open(t.photo.stored) }),
    ).toBeTruthy();

    // Error and resting states.
    expect(screen.getByText(t.states.nameError)).toBeTruthy();
    expect(screen.getByText(t.states.quantityError)).toBeTruthy();
    expect(screen.getByText(t.states.dateError)).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>(t.states.price).disabled).toBe(true);
    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toEqual([
      '',
      t.states.saveError,
      '',
    ]);
    expect(screen.getByRole('combobox', { name: t.article.categorySearch })).toHaveProperty(
      'value',
      'Fisch und Meeresfrüchte',
    );

    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
  });

  it('fills a goods receipt line from the article and says what will be booked', async () => {
    const { user } = await renderApp(<FormsSection />);
    const article = await screen.findByRole('combobox', { name: t.receipt.article });
    await user.type(article, 'lachs');
    await user.click(await screen.findByRole('option', { name: /Lachsfilet/ }));
    // Price, date kind, supplier and area come from the article.
    expect(screen.getByLabelText<HTMLInputElement>(`${t.receipt.price} pro kg`).value).toBe(
      '38.00',
    );
    expect(screen.getByRole('textbox', { name: t.receipt.useBy })).toBeTruthy();
    const quantity = screen.getAllByLabelText(t.receipt.quantity)[0] ?? document.body;
    await user.type(quantity, '1,5');
    expect(screen.getByText('1.5 kg Lachsfilet, CHF 57.00')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '3 Tage' }));
    expect(screen.getByText('Di, 17. Nov. 2026 · in 3 Tagen')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: t.receipt.book }));
    expect(screen.getByText(t.receipt.done)).toBeTruthy();
  });

  it('holds the goods receipt back while the article is missing', async () => {
    const { user } = await renderApp(<FormsSection />);
    await user.click(await screen.findByRole('button', { name: t.receipt.book }));
    expect(screen.queryByText(t.receipt.done)).toBeNull();
    expect(screen.getAllByText(formMessages.required).length).toBeGreaterThanOrEqual(2);
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: t.receipt.article }));
  });

  it('writes its examples in the language of the app', () => {
    const all = texts(t);
    expect(all.length).toBeGreaterThan(60);
    for (const text of all) {
      expect(text).not.toContain('ß');
      expect(text).not.toMatch(/\b(ihr|euch|euer|eure[mnrs]?)\b/i);
      expect(text).not.toMatch(/\b(Ihnen|Ihre[mnrs]?)\b/);
      expect(text).not.toMatch(/\b(smart|insights?|hub|magic|journey|gamechanger)\b/i);
      expect(text).not.toMatch(/![^=]/);
    }
  });
});
