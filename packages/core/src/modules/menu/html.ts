/**
 * The guest card as one self-contained HTML file («Als Datei sichern»). Inline CSS in the look
 * of Randen, photos as data URLs, no script and no address of any server: the file opens
 * anywhere, offline, and says in its head that search engines must not index it.
 */
import type { CurrencyCode } from '../../currency';
import { formatMoney } from '../../currency';
import { dietLabel } from '../../domain/allergens';
import type { GuestDish, GuestSection, MenuCardView } from './contract';

export interface GuestFileInput {
  businessName: string;
  currency: CurrencyCode;
  card: MenuCardView;
  sections: readonly GuestSection[];
}

/** The sentence under every guest card (see the guest view). */
export const GUEST_NOTICE =
  'Über Zutaten, die Allergien oder Unverträglichkeiten auslösen können, gibt das Personal gern Auskunft.';
/** Shown on a dish whose declaration is not complete. */
export const INCOMPLETE_NOTICE = 'Angaben unvollständig, bitte beim Personal nachfragen';

const STYLE = `
:root{color-scheme:light;--wine:#6D1F2F;--grape:#3F0F1C;--cork:#E8D9C0;--ink:#14161A;--muted:#605A50;--line:#E3DACC;--ground:#F9F5F0;--danger:#A32A00}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:17px;line-height:1.45}
.cover{background:var(--grape);color:#fff;padding:40px 24px 32px}
.cover .kicker{margin:0;color:var(--cork);font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase}
.cover h1{margin:6px 0 0;font-size:34px;line-height:1.1;font-weight:700}
.cover .card-name{margin:6px 0 0;color:var(--cork);font-size:18px}
.cover .intro{margin:14px 0 0;color:#EDE3D6;max-width:36rem;white-space:pre-line}
main,footer{max-width:40rem;margin:0 auto;padding-left:24px;padding-right:24px}
main{padding-top:8px;padding-bottom:16px}
.group{padding-top:20px}
h2{margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--wine)}
ul{list-style:none;margin:0;padding:0}
.dish{display:flex;gap:16px;padding:16px 0;border-top:1px solid var(--line)}
.dish:first-child{border-top:0}
.photo img{display:block;width:88px;height:88px;border-radius:14px;object-fit:cover}
.body{flex:1;min-width:0}
.head{display:flex;justify-content:space-between;gap:12px;align-items:baseline}
h3{margin:0;font-size:17px;font-weight:600}
.price{font-weight:600;white-space:nowrap;font-variant-numeric:tabular-nums}
.desc{margin:4px 0 0;color:var(--muted)}
.tags{margin:8px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:6px}
.tag{border:1px solid var(--line);border-radius:999px;padding:2px 10px;font-size:13px;background:#fff}
.tag.trace{border-style:dashed;color:var(--muted)}
.origin{margin:6px 0 0;font-size:14px;color:var(--muted)}
.incomplete{margin:6px 0 0;font-size:14px;color:var(--danger)}
footer{padding-top:12px;padding-bottom:40px;border-top:1px solid var(--line)}
.footer{margin:0;color:var(--muted);white-space:pre-line}
.notice{margin:12px 0 0;font-size:14px;color:var(--muted)}
@media print{body{background:#fff;color:#000;font-size:12pt}.cover{background:#fff;color:#000;border-bottom:1px solid #000;padding-left:0;padding-right:0}.cover .kicker,.cover .card-name,.cover .intro{color:#000}.photo{display:none}.dish{break-inside:avoid;padding:8px 0}.tag{background:#fff;color:#000;border-color:#000}.incomplete{color:#000;font-weight:600}.origin,.desc,.notice,.footer{color:#000}}
`;

/** Escapes text for HTML: every name, description and figure goes through here. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** «Speisekarte Bistro» → «speisekarte-bistro»; umlauts become their two-letter forms. */
export function fileNameOf(cardName: string): string {
  const slug = cardName
    .toLocaleLowerCase('de-CH')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `speisekarte-${slug === '' ? 'karte' : slug}.html`;
}

function dishHtml(dish: GuestDish, input: GuestFileInput): string {
  const parts: string[] = [];
  const price =
    dish.priceRappen === undefined
      ? ''
      : `<span class="price">${escapeHtml(formatMoney(dish.priceRappen, input.currency))}</span>`;
  const photo =
    dish.photo === undefined
      ? ''
      : `<div class="photo"><img src="${escapeHtml(dish.photo)}" alt=""></div>`;
  const tags = [
    ...dish.allergens.map((item) => `<span class="tag">${escapeHtml(item.label)}</span>`),
    ...dish.traces.map(
      (item) => `<span class="tag trace">Spuren: ${escapeHtml(item.label)}</span>`,
    ),
    ...(dish.diet === undefined || dish.diet === 'omnivore'
      ? []
      : [`<span class="tag">${escapeHtml(dietLabel(dish.diet))}</span>`]),
    ...dish.labels.map((label) => `<span class="tag">${escapeHtml(label.text)}</span>`),
  ];
  parts.push(
    `<li class="dish">${photo}<div class="body"><div class="head"><h3>${escapeHtml(dish.name)}</h3>${price}</div>`,
  );
  if (dish.description !== undefined) {
    parts.push(`<p class="desc">${escapeHtml(dish.description)}</p>`);
  }
  if (tags.length > 0) {
    parts.push(`<p class="tags">${tags.join('')}</p>`);
  }
  for (const origin of dish.origins) {
    const country = origin.countryName ?? 'Herkunft fehlt';
    parts.push(`<p class="origin">${escapeHtml(`${origin.name}: ${country}`)}</p>`);
  }
  if (dish.incomplete) {
    parts.push(`<p class="incomplete">${escapeHtml(INCOMPLETE_NOTICE)}</p>`);
  }
  parts.push('</div></li>');
  return parts.join('');
}

/** The whole card as one HTML document, `lang="de-CH"`, not indexed. */
export function renderGuestHtml(input: GuestFileInput): string {
  const { card } = input;
  const title = `${card.name} · ${input.businessName}`;
  const intro = card.intro === undefined ? '' : `<p class="intro">${escapeHtml(card.intro)}</p>`;
  const sections = input.sections
    .map(
      (section) =>
        `<section class="group"><h2>${escapeHtml(section.title)}</h2><ul>${section.dishes
          .map((dish) => dishHtml(dish, input))
          .join('')}</ul></section>`,
    )
    .join('');
  const footer =
    card.footer === undefined ? '' : `<p class="footer">${escapeHtml(card.footer)}</p>`;
  return `<!doctype html>
<html lang="de-CH">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<header class="cover">
<p class="kicker">Speisekarte</p>
<h1>${escapeHtml(input.businessName)}</h1>
<p class="card-name">${escapeHtml(card.name)}</p>
${intro}
</header>
<main>${sections}</main>
<footer>
${footer}
<p class="notice">${escapeHtml(GUEST_NOTICE)}</p>
</footer>
</body>
</html>
`;
}
