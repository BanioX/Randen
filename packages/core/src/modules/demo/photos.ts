import { PhotoSchema, type Photo } from '../../model/primitives';
import { createRandom, type Random } from './support';

/**
 * The «photos» of the demo: small flat drawings made here as SVG, so the demo shows what a
 * kitchen with pictures looks like without shipping a single real photo (ADR-0006). Every
 * picture is 4:3, keeps its subject in the middle (lists crop it square, page tops 16:9), uses
 * only shapes and colours (no text, no script, no outside address) and stays a few kilobytes.
 */

const W = 320;
const H = 240;

const n = (value: number) => String(Math.round(value * 10) / 10);

/** A data URL that browsers read without base64: only the characters that must be escaped. */
function toDataUrl(svg: string): Photo {
  const body = svg
    .replace(/\s+/g, ' ')
    .replace(/> </g, '><')
    .replace(/"/g, "'")
    .replace(/%/g, '%25')
    .replace(/#/g, '%23')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E');
  return PhotoSchema.parse(`data:image/svg+xml,${body}`);
}

function picture(ground: string, body: string): Photo {
  return toDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(W)} ${String(H)}"><rect width="${String(W)}" height="${String(H)}" fill="${ground}"/>${body}</svg>`,
  );
}

const circle = (cx: number, cy: number, r: number, fill: string, extra = '') =>
  `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}"${extra}/>`;
const ellipse = (cx: number, cy: number, rx: number, ry: number, fill: string, angle = 0) =>
  `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill}"${angle === 0 ? '' : ` transform="rotate(${n(angle)} ${n(cx)} ${n(cy)})"`}/>`;
const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  radius = 0,
  angle = 0,
  extra = '',
) =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${radius > 0 ? ` rx="${n(radius)}"` : ''} fill="${fill}"${angle === 0 ? '' : ` transform="rotate(${n(angle)} ${n(x + w / 2)} ${n(y + h / 2)})"`}${extra}/>`;
const stroke = (d: string, colour: string, width: number, extra = '') =>
  `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${n(width)}" stroke-linecap="round"${extra}/>`;

/** Points on a ring around the middle of the plate. */
function around(count: number, radius: number, start = 0, cx = 160, cy = 120) {
  return Array.from({ length: count }, (_, index) => {
    const angle = start + (index * 2 * Math.PI) / count;
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, angle };
  });
}

/** A white plate with a rim and a soft shadow on the table. */
function plate(deep = false) {
  return (
    circle(164, 126, 93, 'rgba(40,20,10,0.16)') +
    circle(160, 120, 92, '#FBF8F3') +
    circle(
      160,
      120,
      deep ? 64 : 74,
      'none',
      ` stroke="${deep ? '#E6DED0' : '#EEE7DB'}" stroke-width="${deep ? 6 : 2}"`,
    )
  );
}

/** Small scattered dots (crumbs, herbs, sugar), placed by a seeded generator. */
function scatter(random: Random, count: number, radius: number, size: number, colours: string[]) {
  let out = '';
  for (let index = 0; index < count; index += 1) {
    const angle = random.next() * Math.PI * 2;
    const distance = Math.sqrt(random.next()) * radius;
    out += circle(
      160 + Math.cos(angle) * distance,
      120 + Math.sin(angle) * distance,
      size * random.spread(0.35),
      colours[index % colours.length] ?? '#fff',
    );
  }
  return out;
}

export type DishPicture =
  | 'carpaccio'
  | 'soup'
  | 'entrecote'
  | 'salmon'
  | 'risotto'
  | 'alpine'
  | 'geschnetzeltes'
  | 'caesar'
  | 'mousse'
  | 'fritters'
  | 'takeaway';

const dishes: Record<DishPicture, (random: Random) => Photo> = {
  carpaccio: (random) => {
    const slices = around(9, 36, 0.3)
      .map((point, index) =>
        circle(
          point.x,
          point.y,
          27,
          index % 2 === 0 ? '#8C1D40' : '#A42A50',
          ' stroke="#701633" stroke-width="1" opacity="0.95"',
        ),
      )
      .join('');
    const leaves = around(6, 12, 0.5)
      .map((point) => ellipse(point.x, point.y, 9, 4.5, '#5E8C3A', (point.angle * 180) / Math.PI))
      .join('');
    return picture(
      '#E9DCC6',
      plate() +
        slices +
        circle(160, 120, 20, '#9B2448') +
        leaves +
        scatter(random, 9, 46, 5.5, ['#FAF6EC', '#F3EDE0']) +
        scatter(random, 6, 40, 4, ['#8A5A2E', '#A06A38']) +
        stroke('M118 96 C140 110 150 84 172 104 S198 128 206 112', '#D9A93B', 2, ' opacity="0.85"'),
    );
  },
  soup: (random) =>
    picture(
      '#D8C7AE',
      plate(true) +
        circle(160, 120, 58, '#DF7426') +
        circle(152, 112, 40, '#E88A37', ' opacity="0.6"') +
        stroke(
          'M160 120 m-4 0 a4 4 0 1 1 8 0 a9 9 0 1 1 -18 0 a15 15 0 1 1 30 0 a21 21 0 1 1 -42 0',
          '#FFF4E2',
          4,
        ) +
        [
          [136, 92],
          [182, 98],
          [188, 140],
          [132, 146],
          [150, 160],
        ]
          .map(([x = 0, y = 0], index) => rect(x - 5, y - 5, 10, 10, '#D9A55B', 2, index * 17))
          .join('') +
        scatter(random, 7, 44, 2.2, ['#3F5A22']),
    ),
  entrecote: () =>
    picture(
      '#4A3426',
      plate() +
        ellipse(126, 104, 30, 20, '#F2E2B3', -25) +
        stroke('M108 110 C120 96 136 98 146 92', '#E3CD95', 3) +
        ellipse(178, 132, 46, 34, '#4A1020', 10) +
        `<path d="M146 112 C150 92 196 88 210 104 C224 122 214 152 186 156 C160 160 140 140 146 112 Z" fill="#6B301C" stroke="#C9A27A" stroke-width="3"/>` +
        [0, 1, 2, 3]
          .map((index) =>
            stroke(
              `M${n(156 + index * 13)} 100 L${n(146 + index * 13)} 150`,
              '#3D1A0E',
              4,
              ' opacity="0.7"',
            ),
          )
          .join('') +
        [0, 1, 2, 3]
          .map((index) =>
            rect(112 + index * 9, 138 + (index % 2) * 6, 24, 7, '#E57E25', 3.5, 60 + index * 8),
          )
          .join('') +
        [
          [140, 168],
          [150, 172],
          [131, 162],
          [146, 162],
          [158, 166],
          [136, 172],
          [124, 154],
        ]
          .map(([x = 0, y = 0]) => circle(x, y, 4.6, '#7DB040'))
          .join(''),
    ),
  salmon: () =>
    picture(
      '#E4DCCD',
      plate() +
        circle(160, 122, 60, '#F3EAD3') +
        `<path d="M118 96 C150 82 196 86 210 100 L204 136 C176 146 138 144 116 132 Z" fill="#EE8A5F"/>` +
        stroke('M118 96 C150 82 196 86 210 100', '#C9643C', 5) +
        [0, 1, 2, 3]
          .map((index) =>
            stroke(
              `M${n(136 + index * 18)} 92 C${n(130 + index * 18)} 110 ${n(140 + index * 18)} 124 ${n(132 + index * 18)} 140`,
              '#FBD3BF',
              2.5,
            ),
          )
          .join('') +
        ellipse(132, 160, 26, 13, '#2F5A2B', -8) +
        ellipse(140, 156, 12, 7, '#3F7337', 15) +
        circle(186, 160, 13, '#E9C46A') +
        circle(206, 150, 11, '#E3BA58') +
        circle(183, 156, 4, '#F4DA92'),
    ),
  risotto: (random) => {
    let grains = '';
    for (let index = 0; index < 18; index += 1) {
      const angle = random.next() * Math.PI * 2;
      const distance = Math.sqrt(random.next()) * 50;
      grains += ellipse(
        160 + Math.cos(angle) * distance,
        120 + Math.sin(angle) * distance,
        4.5,
        2.2,
        '#F7F0DA',
        random.int(0, 179),
      );
    }
    const mushrooms = around(5, 30, 0.4)
      .map(
        (point) =>
          ellipse(point.x, point.y - 3, 12, 8, '#8B5A3C', (point.angle * 180) / Math.PI) +
          rect(point.x - 3, point.y - 2, 6, 11, '#C99F72', 2, (point.angle * 180) / Math.PI),
      )
      .join('');
    return picture(
      '#CBBFA9',
      plate() +
        circle(160, 120, 60, '#E8DCB5') +
        grains +
        mushrooms +
        scatter(random, 10, 48, 2.2, ['#4E7F32']) +
        scatter(random, 5, 30, 4, ['#FFF3CF']),
    );
  },
  alpine: (random) => {
    let tubes = '';
    for (let index = 0; index < 16; index += 1) {
      const angle = random.next() * Math.PI * 2;
      const distance = Math.sqrt(random.next()) * 44;
      const x = 152 + Math.cos(angle) * distance;
      const y = 124 + Math.sin(angle) * distance;
      const turn = random.int(0, 179);
      tubes +=
        rect(x - 9, y - 4, 18, 8, '#E9BE55', 4, turn) +
        rect(x - 6, y - 1.5, 12, 3, '#F6DE98', 1.5, turn);
    }
    return picture(
      '#E4D3B5',
      plate() +
        circle(152, 124, 56, '#F1D58A') +
        tubes +
        scatter(random, 6, 40, 3.6, ['#B5463C']) +
        stroke(
          'M124 108 c6 -8 14 -2 18 -8 M150 100 c6 -8 14 -2 18 -8 M138 140 c6 -8 14 -2 18 -8',
          '#9C5320',
          3,
        ) +
        circle(204, 84, 21, '#FBF8F3', ' stroke="#E6DED0" stroke-width="3"') +
        circle(204, 84, 15, '#E6CF86'),
    );
  },
  geschnetzeltes: (random) => {
    let hatch = '';
    for (let index = -3; index <= 3; index += 1) {
      hatch += stroke(
        `M${n(108 + index * 9)} 96 L${n(124 + index * 9)} 152`,
        '#B47A24',
        2,
        ' opacity="0.7"',
      );
    }
    let strips = '';
    for (let index = 0; index < 7; index += 1) {
      strips += rect(
        170 + random.int(-14, 24),
        92 + index * 9,
        22,
        8,
        '#B07D55',
        4,
        random.int(-35, 35),
      );
    }
    return picture(
      '#D5C3A5',
      plate() +
        circle(118, 124, 40, '#D69A3A') +
        hatch +
        circle(112, 116, 18, '#E8B75A', ' opacity="0.7"') +
        ellipse(190, 124, 40, 46, '#EEDFC0') +
        strips +
        ellipse(182, 106, 8, 5, '#C9A57A', 20) +
        ellipse(204, 140, 8, 5, '#C9A57A', -30) +
        scatter(random, 8, 26, 2, ['#52833A']),
    );
  },
  caesar: (random) => {
    const leaves = around(7, 30, 0.2)
      .map(
        (point, index) =>
          ellipse(
            point.x,
            point.y,
            34,
            13,
            index % 2 === 0 ? '#6FA34A' : '#93C56A',
            (point.angle * 180) / Math.PI,
          ) +
          stroke(
            `M${n(point.x - Math.cos(point.angle) * 28)} ${n(point.y - Math.sin(point.angle) * 28)} L${n(point.x + Math.cos(point.angle) * 28)} ${n(point.y + Math.sin(point.angle) * 28)}`,
            '#CFE5A9',
            2,
          ),
      )
      .join('');
    const chicken = [0, 1, 2, 3, 4]
      .map(
        (index) =>
          rect(128 + index * 13, 104 + (index % 2) * 6, 12, 30, '#E5C59A', 4, 18) +
          stroke(
            `M${n(131 + index * 13)} ${n(112 + (index % 2) * 6)} l6 4 M${n(131 + index * 13)} ${n(122 + (index % 2) * 6)} l6 4`,
            '#B98A5A',
            2,
          ),
      )
      .join('');
    return picture(
      '#E7E1D3',
      plate() +
        leaves +
        chicken +
        scatter(random, 6, 50, 5, ['#D9A55B']) +
        scatter(random, 6, 40, 3.5, ['#FBF2D2']) +
        stroke('M120 150 C140 140 170 160 200 142', '#F6EFDC', 3),
    );
  },
  mousse: (random) =>
    picture(
      '#2F2321',
      plate() +
        ellipse(140, 116, 34, 20, '#4A2A1C', -20) +
        stroke('M118 112 C130 100 150 100 162 106', '#7A4A33', 3) +
        ellipse(178, 132, 30, 18, '#5E3524', 25) +
        stroke('M160 126 C170 118 186 120 194 128', '#865238', 3) +
        circle(186, 96, 14, '#FBF4E6') +
        circle(182, 92, 6, '#FFFFFF') +
        scatter(random, 14, 64, 1.6, ['#3A2016']),
    ),
  fritters: (random) =>
    picture(
      '#E6D6BA',
      plate() +
        around(3, 34, -0.6)
          .map(
            (point) =>
              circle(point.x, point.y, 25, '#D9A04A') +
              circle(point.x, point.y, 17, '#F0D9A0') +
              circle(point.x, point.y, 8, '#FBF8F3'),
          )
          .join('') +
        circle(162, 124, 19, '#E8DCC0') +
        circle(160, 121, 18, '#F7EED6') +
        scatter(random, 22, 62, 1.4, ['#FFFFFF', '#A8743A']),
    ), // A salad in a kraft box with its lid open: the take-away dish of the Mittagsmenü.
  takeaway: (random) =>
    picture(
      '#F4EFE6',
      [
        ellipse(160, 178, 104, 14, '#E2D6C2'),
        rect(70, 92, 180, 84, '#D2AE76', 8),
        rect(70, 92, 180, 18, '#E2C494', 8),
        ...around(6, 22, 0.5, 160, 92).map((point, index) =>
          ellipse(
            point.x,
            point.y,
            28,
            11,
            index % 2 === 0 ? '#6FA34A' : '#93C56A',
            (point.angle * 180) / Math.PI,
          ),
        ),
        scatter(random, 6, 40, 5, ['#E0B977', '#B7842F']),
      ].join(''),
    ),
};

/** The picture of a demo dish; the seed keeps the scattered details the same everywhere. */
export function dishPhoto(kind: DishPicture): Photo {
  return dishes[kind](createRandom(kind.length * 7919));
}

export type SpotPicture =
  | { kind: 'shelf'; wall: 'steel' | 'wall'; goods: 'meat' | 'dairy' | 'dry' | 'oil' }
  | { kind: 'drawer'; goods: 'fish' | 'dressings' | 'cheese' }
  | { kind: 'crates'; goods: 'vegetables' | 'potatoes' }
  | { kind: 'freezer' }
  | { kind: 'chest' }
  | { kind: 'wine'; colour: 'red' | 'white' }
  | { kind: 'bread' };

/** Three shelf boards with goods standing on them. */
function shelf(random: Random, wall: 'steel' | 'wall', goods: 'meat' | 'dairy' | 'dry' | 'oil') {
  const boards = [78, 150, 222];
  let items = '';
  for (const board of boards) {
    let x = 34;
    while (x < 276) {
      const width = random.int(26, 46);
      if (x + width > 284) {
        break;
      }
      const height = random.int(30, 52);
      const top = board - height;
      if (goods === 'meat') {
        items +=
          rect(x, board - 22, width, 22, random.next() < 0.5 ? '#B8434A' : '#C45A55', 6) +
          rect(x + 3, board - 19, width - 6, 6, '#FFFFFF', 3, 0, ' opacity="0.35"');
      } else if (goods === 'dairy') {
        const brick = random.next() < 0.6;
        items += brick
          ? rect(x, top, width - 8, height, '#F7F5EF', 3) + rect(x, top, width - 8, 8, '#4F7FA8', 2)
          : rect(x, board - 18, width, 18, '#F2D46B', 3);
      } else if (goods === 'dry') {
        items +=
          rect(x, top, width, height, random.next() < 0.5 ? '#E9DFC9' : '#DCCBA8', 8) +
          rect(x + 4, top + height / 2 - 4, width - 8, 8, '#B9A27A', 2);
      } else {
        items +=
          random.next() < 0.5
            ? rect(x, top, width - 6, height, '#E5C34A', 4) +
              rect(x + (width - 6) / 2 - 4, top - 6, 8, 7, '#7A6A2A', 2)
            : rect(x, board - 30, width - 10, 30, '#B33A2E', 3) +
              rect(x, board - 22, width - 10, 12, '#F0E6D2', 0);
      }
      x += width + random.int(4, 10);
    }
  }
  const back = wall === 'steel' ? '#D9DDE0' : '#E8E1D6';
  return (
    rect(0, 0, W, H, back) +
    rect(20, 0, 8, H, '#A8A39A') +
    rect(292, 0, 8, H, '#A8A39A') +
    items +
    boards.map((board) => rect(20, board, 280, 7, '#B9B2A6')).join('')
  );
}

function drawer(random: Random, goods: 'fish' | 'dressings' | 'cheese') {
  let inside = '';
  if (goods === 'fish') {
    inside += rect(54, 70, 212, 110, '#EAF1F4', 6);
    for (let index = 0; index < 4; index += 1) {
      inside +=
        rect(66 + index * 50, 84 + (index % 2) * 10, 42, 78, '#EE8A5F', 14, random.int(-8, 8)) +
        stroke(
          `M${n(74 + index * 50)} ${n(100 + (index % 2) * 10)} l26 12 M${n(74 + index * 50)} ${n(122 + (index % 2) * 10)} l26 12`,
          '#FBD3BF',
          2.5,
        );
    }
  } else if (goods === 'dressings') {
    for (let index = 0; index < 5; index += 1) {
      const colour = ['#E9D9A0', '#C9B36A', '#F2E8C9', '#B9A55A', '#E3CF8E'][index] ?? '#E9D9A0';
      inside +=
        circle(82 + index * 40, 124, 17, colour) +
        circle(82 + index * 40, 124, 17, 'none', ' stroke="#8F8A82" stroke-width="3"');
    }
  } else {
    inside += rect(54, 70, 212, 110, '#F3EEE2', 6);
    for (let index = 0; index < 3; index += 1) {
      inside +=
        rect(70 + index * 64, 86, 52, 76, '#C9CFD4', 6) +
        rect(76 + index * 64, 92, 40, 64, index === 1 ? '#FAF6EC' : '#E9E2CF', 4);
    }
  }
  return (
    rect(0, 0, W, H, '#BFC5CA') +
    rect(38, 56, 244, 138, '#9EA6AD', 10) +
    rect(46, 62, 228, 126, '#DDE2E6', 8) +
    inside +
    rect(38, 186, 244, 38, '#C9CED2', 6) +
    rect(130, 200, 60, 8, '#8A9298', 4)
  );
}

function crates(random: Random, goods: 'vegetables' | 'potatoes') {
  const palette =
    goods === 'potatoes'
      ? [
          ['#C9A26B', '#B88F58'],
          ['#D7A35B', '#C28A3E'],
        ]
      : [
          ['#E57E25', '#F19A4A'],
          ['#8C1D40', '#A42A50'],
          ['#6FA34A', '#93C56A'],
          ['#E6D9B8', '#D8C79E'],
        ];
  let out = rect(0, 0, W, H, '#E8E1D6') + rect(0, 196, W, 44, '#CFC3AE');
  const boxes = [
    [24, 96],
    [168, 96],
    [24, 160],
    [168, 160],
  ];
  boxes.forEach(([x = 0, y = 0], index) => {
    const colours = palette[index % palette.length] ?? ['#ccc', '#ddd'];
    let fill = '';
    for (let item = 0; item < 9; item += 1) {
      fill += circle(
        x + 18 + (item % 5) * 26 + random.int(-3, 3),
        y - 6 + Math.floor(item / 5) * 12,
        12,
        colours[item % 2] ?? '#ccc',
      );
    }
    out +=
      fill +
      rect(x, y, 128, 40, '#B7834F', 3) +
      rect(x, y + 6, 128, 4, '#9C6B3D') +
      rect(x, y + 22, 128, 4, '#9C6B3D') +
      rect(x + 52, y + 12, 24, 8, '#8A5D33', 4);
  });
  return out;
}

function freezer(random: Random) {
  let bags = '';
  for (const board of [96, 176]) {
    let x = 34;
    while (x < 270) {
      const width = random.int(36, 56);
      bags += rect(x, board - 40, width, 40, random.next() < 0.5 ? '#9FBCD0' : '#B9CFDC', 10);
      x += width + 8;
    }
  }
  return (
    rect(0, 0, W, H, '#DCE7EE') +
    bags +
    [96, 176].map((board) => rect(22, board, 276, 7, '#A9BAC6')).join('') +
    scatter(random, 30, 150, 1.6, ['#FFFFFF'])
  );
}

function chest(random: Random) {
  let tubs = '';
  for (let index = 0; index < 6; index += 1) {
    const x = 58 + (index % 3) * 70;
    const y = 74 + Math.floor(index / 3) * 64;
    tubs +=
      rect(x, y, 60, 54, '#F3EEE2', 8) +
      rect(x + 6, y + 6, 48, 10, index % 2 === 0 ? '#E8D9C0' : '#D67784', 3);
  }
  return (
    rect(0, 0, W, H, '#C9D3DA') +
    rect(40, 56, 240, 150, '#EEF3F6', 14) +
    rect(48, 64, 224, 134, '#DCE6EC', 10) +
    tubs +
    scatter(random, 14, 120, 1.4, ['#FFFFFF'])
  );
}

function wine(random: Random, colour: 'red' | 'white') {
  const glass =
    colour === 'red' ? ['#3F0F1C', '#5B2333', '#2E2A2B'] : ['#C9B37A', '#8FA26A', '#B8A866'];
  // The lattice of the rack: two sets of diagonals, one path each.
  let down = '';
  let up = '';
  for (let start = -240; start <= 320; start += 48) {
    down += `M${String(start)} 0 l240 240 `;
    up += `M${String(start + 240)} 0 l-240 240 `;
  }
  let bottles = '';
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 6; column += 1) {
      if (random.next() < 0.8) {
        const x = 40 + column * 48;
        const y = 48 + row * 48;
        bottles +=
          circle(x, y, 14, glass[(row + column) % glass.length] ?? '#333') +
          circle(x, y, 5, '#1B1416');
      }
    }
  }
  return (
    rect(0, 0, W, H, '#6E5642') + stroke(down, '#8B6A4E', 5) + stroke(up, '#8B6A4E', 5) + bottles
  );
}

function bread(random: Random) {
  let loaves = '';
  for (const board of [100, 180]) {
    for (let index = 0; index < 4; index += 1) {
      const x = 62 + index * 64 + random.int(-4, 4);
      loaves +=
        ellipse(x, board - 16, 28, 15, '#D19A50') +
        stroke(
          `M${n(x - 14)} ${n(board - 20)} l8 -6 M${n(x - 2)} ${n(board - 20)} l8 -6 M${n(x + 10)} ${n(board - 20)} l8 -6`,
          '#A8702E',
          2.5,
        );
    }
  }
  return (
    rect(0, 0, W, H, '#EFE7DA') +
    loaves +
    [100, 180].map((board) => rect(24, board, 272, 5, '#8F8A82')).join('') +
    rect(24, 0, 5, H, '#8F8A82') +
    rect(291, 0, 5, H, '#8F8A82')
  );
}

/** The picture of a storage spot; `seed` makes two shelves of the same kind look different. */
export function spotPhoto(spec: SpotPicture, seed: number): Photo {
  const random = createRandom(seed);
  let body: string;
  switch (spec.kind) {
    case 'shelf':
      body = shelf(random, spec.wall, spec.goods);
      break;
    case 'drawer':
      body = drawer(random, spec.goods);
      break;
    case 'crates':
      body = crates(random, spec.goods);
      break;
    case 'freezer':
      body = freezer(random);
      break;
    case 'chest':
      body = chest(random);
      break;
    case 'wine':
      body = wine(random, spec.colour);
      break;
    case 'bread':
      body = bread(random);
      break;
  }
  return toDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(W)} ${String(H)}">${body}</svg>`,
  );
}
