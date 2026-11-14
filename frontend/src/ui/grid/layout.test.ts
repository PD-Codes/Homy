import { describe, expect, it } from 'vitest';
import { compact, findFreeSpot, overlaps, placeAndResolve, stackForMobile } from './layout';

const b = (id: string, col: number, row: number, w: number, h: number) => ({ id, col, row, w, h });

describe('grid layout', () => {
  it('detects overlap', () => {
    expect(overlaps(b('a', 0, 0, 4, 2), b('b', 3, 1, 4, 2))).toBe(true);
    expect(overlaps(b('a', 0, 0, 4, 2), b('b', 4, 0, 4, 2))).toBe(false);
  });

  it('finds the first free spot', () => {
    const boxes = [b('a', 0, 0, 12, 2), b('b', 12, 0, 6, 2)];
    expect(findFreeSpot(boxes, 6, 2)).toEqual({ col: 18, row: 0 });
    expect(findFreeSpot(boxes, 8, 2)).toEqual({ col: 0, row: 2 });
  });

  it('compacts vertical gaps', () => {
    const out = compact([b('a', 0, 5, 4, 2), b('b', 0, 10, 4, 2)]);
    expect(out.map((x) => x.row)).toEqual([0, 2]);
  });

  it('pushes colliding boxes away from the moved one', () => {
    const boxes = [b('a', 0, 0, 6, 2), b('b', 0, 2, 6, 2)];
    const out = placeAndResolve(boxes, { ...boxes[1], row: 0 });
    const a = out.find((x) => x.id === 'a')!;
    const bb = out.find((x) => x.id === 'b')!;
    expect(bb.row).toBe(0);
    expect(a.row).toBe(2);
    expect(out.some((x) => out.some((y) => overlaps(x, y)))).toBe(false);
  });

  it('stacks for mobile in reading order', () => {
    const out = stackForMobile([b('r', 12, 0, 12, 3), b('l', 0, 0, 12, 2)]);
    expect(out.map((x) => [x.id, x.row])).toEqual([['l', 0], ['r', 2]]);
  });
});

describe('fixOverlaps', () => {
  it('repairs overlapping stored layouts without compacting gaps', async () => {
    const { fixOverlaps } = await import('./layout');
    const out = fixOverlaps([b('s', 0, 1, 20, 2), b('w', 6, 2, 6, 4), b('far', 0, 20, 4, 2)]);
    expect(out.find((x) => x.id === 'w')!.row).toBe(3);
    expect(out.find((x) => x.id === 'far')!.row).toBe(20);
  });
});

describe('drag down across a box', () => {
  it('swaps instead of leaving a hole', async () => {
    const { compact, placeAndResolve } = await import('./layout');
    const boxes = [b('top', 0, 0, 6, 4), b('below', 0, 4, 6, 6)];
    const out = compact(placeAndResolve(boxes, { ...boxes[0], row: 7 }));
    expect(out.find((x) => x.id === 'below')!.row).toBe(0);
    expect(out.find((x) => x.id === 'top')!.row).toBe(6);
  });
});
