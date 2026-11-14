/** A finite number of at least zero, whatever comes in: a chart never draws NaN. */
export function safe(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/** A coordinate for an SVG attribute: finite, with at most two decimals. */
export function px(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

export interface NiceScale {
  /** The upper end of the axis: a round number at or above the largest value. */
  max: number;
  /** The tick values from 0 to `max`. */
  ticks: number[];
}

/**
 * A round axis from 0 to at least `top` with about `steps` steps (1, 2, 2.5 or 5 times a power of
 * ten), so the ticks read 0 / 500 / 1’000 and not 0 / 437 / 874.
 */
export function niceScale(top: number, steps = 3): NiceScale {
  const highest = safe(top);
  if (highest === 0) {
    return { max: 1, ticks: [0] };
  }
  const rough = highest / Math.max(1, steps);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const factor =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  const step = factor * magnitude;
  const count = Math.max(1, Math.ceil(highest / step - 1e-9));
  // toPrecision removes float noise such as 0.30000000000000004.
  const ticks = Array.from({ length: count + 1 }, (_, index) =>
    Number((index * step).toPrecision(12)),
  );
  return { max: ticks[count] ?? step, ticks };
}

/** Width of a line of text in the chart font, estimated: good enough to keep labels apart. */
export function textWidth(text: string, fontSize = 12): number {
  return text.length * fontSize * 0.6;
}

/**
 * Which of `count` labels along an axis to show so that neighbours do not touch: the first, each
 * nth and the last.
 */
export function labelIndices(count: number, slot: number, widest: number): number[] {
  if (count <= 0) {
    return [];
  }
  const every = Math.max(1, Math.ceil((widest + 8) / Math.max(1, slot)));
  const indices: number[] = [];
  for (let index = 0; index < count; index += every) {
    indices.push(index);
  }
  const last = count - 1;
  const shown = indices[indices.length - 1] ?? 0;
  if (shown !== last) {
    // Too close to the last label: the last one wins, it is the newest.
    if (last - shown < every && indices.length > 1) {
      indices.pop();
    }
    indices.push(last);
  }
  return indices;
}

/** A bar that stands on its baseline: square at the bottom, rounded at its data end. */
export function columnPath(x: number, y: number, width: number, height: number, radius = 4) {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const r = Math.min(radius, w / 2, h);
  return `M${px(x)},${px(y + h)}V${px(y + r)}Q${px(x)},${px(y)} ${px(x + r)},${px(y)}H${px(x + w - r)}Q${px(x + w)},${px(y)} ${px(x + w)},${px(y + r)}V${px(y + h)}Z`;
}
