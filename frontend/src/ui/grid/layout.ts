/** Pure 24-column grid layout helpers (no DOM). */
export const COLS = 24;

export interface Box { id: string; col: number; row: number; w: number; h: number }

export function overlaps(a: Box, b: Box): boolean {
  return a.id !== b.id &&
    a.col < b.col + b.w && b.col < a.col + a.w &&
    a.row < b.row + b.h && b.row < a.row + a.h;
}

export function clampBox<T extends Box>(b: T, cols = COLS): T {
  const w = Math.max(1, Math.min(b.w, cols));
  const h = Math.max(1, b.h);
  const col = Math.max(0, Math.min(b.col, cols - w));
  return { ...b, w, h, col, row: Math.max(0, b.row) };
}

export function bottom(boxes: Box[]): number {
  return boxes.reduce((m, b) => Math.max(m, b.row + b.h), 0);
}

/** First free top-left position for a w×h box, scanning row by row. */
export function findFreeSpot(boxes: Box[], w: number, h: number, cols = COLS): { col: number; row: number } {
  const width = Math.min(w, cols);
  const maxRow = bottom(boxes) + 1;
  for (let row = 0; row <= maxRow; row += 1) {
    for (let col = 0; col + width <= cols; col += 1) {
      const probe = { id: '__probe__', col, row, w: width, h };
      if (!boxes.some((b) => overlaps(probe, b))) return { col, row };
    }
  }
  return { col: 0, row: maxRow };
}

/** Move every box up as far as it can go (removes vertical gaps). Stable by (row, col). */
export function compact<T extends Box>(boxes: T[], pinnedId?: string): T[] {
  const sorted = [...boxes].sort((a, b) => a.row - b.row || a.col - b.col);
  const placed: T[] = [];
  const pinned = pinnedId ? sorted.find((b) => b.id === pinnedId) : undefined;
  if (pinned) placed.push(pinned);
  for (const box of sorted) {
    if (box === pinned) continue;
    let row = box.row;
    while (row > 0 && !placed.some((p) => overlaps({ ...box, row: row - 1 }, p))) row -= 1;
    // If it still collides (e.g. with a pinned box), push it down until free.
    while (placed.some((p) => overlaps({ ...box, row }, p))) row += 1;
    placed.push({ ...box, row });
  }
  const byId = new Map(placed.map((b) => [b.id, b]));
  return boxes.map((b) => byId.get(b.id)!);
}

/**
 * Put `moving` at its new position and resolve collisions by pushing other boxes
 * down, then compact. The moving box keeps its spot.
 */
export function placeAndResolve<T extends Box>(boxes: T[], moving: T, cols = COLS): T[] {
  const target = clampBox(moving, cols);
  const others = boxes.filter((b) => b.id !== target.id);
  const result: T[] = [target];
  const queue = [...others].sort((a, b) => a.row - b.row || a.col - b.col);
  for (const box of queue) {
    let row = box.row;
    // Dragging down across a box: let that box jump above the moved one (swap feel)
    // instead of being pushed further down.
    if (overlaps({ ...box }, target) && target.row > box.row) {
      const above = target.row - box.h;
      if (above >= 0 && !result.some((p) => overlaps({ ...box, row: above }, p))) row = above;
    }
    while (result.some((p) => overlaps({ ...box, row }, p))) row += 1;
    result.push({ ...box, row });
  }
  return compact(result, target.id);
}

/** Single-column stacking for narrow screens. */
export function stackForMobile<T extends Box>(boxes: T[]): T[] {
  let row = 0;
  return [...boxes]
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map((b) => {
      const out = { ...b, col: 0, w: COLS, row };
      row += b.h;
      return out;
    });
}

/** Push overlapping boxes down (keeps intentional gaps). Used to repair stored layouts. */
export function fixOverlaps<T extends Box>(boxes: T[]): T[] {
  const sorted = [...boxes].sort((a, b) => a.row - b.row || a.col - b.col);
  const placed: T[] = [];
  for (const box of sorted) {
    const b = clampBox(box);
    let row = b.row;
    while (placed.some((p) => overlaps({ ...b, row }, p))) row += 1;
    placed.push({ ...b, row });
  }
  const byId = new Map(placed.map((b) => [b.id, b]));
  return boxes.map((b) => byId.get(b.id)!);
}
