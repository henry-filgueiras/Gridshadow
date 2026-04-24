import type { Board, BoardConfig, Tile } from '../types';
import { createRng, rngInt } from './rng';

// Protected Constraints v1 tunables. `fraction` is the share of *safe
// numbered* tiles that start value-occluded; `unveilCost` is the witness
// charge spent to reveal a single protected tile's constraint number.
// Kept at file scope next to the generator so the selection rule and its
// tunable never drift: the fraction that matters for the board is the
// fraction used when building the board.
const PROTECTED_FRACTION = 0.12;
const PROTECTED_UNVEIL_COST = 1;

export const PROTECTED_TUNABLES = {
  fraction: PROTECTED_FRACTION,
  unveilCost: PROTECTED_UNVEIL_COST,
} as const;

// Generate a board from a config. Pure: same seed + dimensions → same board.
// This is the generation stub — no reveal/flood/scoring logic lives here.
export function generateBoard(config: BoardConfig): Board {
  const { width, height, mineCount, seed } = config;
  const total = width * height;
  if (mineCount >= total) {
    throw new Error(`mineCount ${mineCount} must be < total tiles ${total}`);
  }

  const rng = createRng(seed);
  const mines = new Set<number>();
  while (mines.size < mineCount) {
    mines.add(rngInt(rng, total));
  }

  const tiles: Tile[] = new Array(total);
  for (let i = 0; i < total; i++) {
    tiles[i] = {
      x: i % width,
      y: (i / width) | 0,
      isMine: mines.has(i),
      adjacentMines: 0,
      state: 'unresolved',
      protected: false,
      valueRevealed: false,
      closedForWitness: false,
    };
  }

  // Compute adjacency counts. This is board-intrinsic, not gameplay state.
  for (let i = 0; i < total; i++) {
    const tile = tiles[i];
    if (tile.isMine) continue;
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = tile.x + dx;
        const ny = tile.y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (tiles[ny * width + nx].isMine) count++;
      }
    }
    tiles[i] = { ...tile, adjacentMines: count };
  }

  // Deterministic protected-tile selection from the same rng stream that
  // placed mines. Eligibility: non-mine AND adjacentMines > 0. Zeros are
  // excluded on purpose — they have nothing to occlude, and leaving them
  // alone keeps cascade semantics trivially clean (zero floods propagate
  // as always). Fisher-Yates shuffle of the eligible-index list, then
  // take the first K: exact-count selection, fully deterministic for a
  // given seed, and stable under future additions (a new tunable or a
  // new Tile field won't perturb which indices get selected).
  const eligible: number[] = [];
  for (let i = 0; i < total; i++) {
    const t = tiles[i];
    if (!t.isMine && t.adjacentMines > 0) eligible.push(i);
  }
  const protectedCount = Math.floor(eligible.length * PROTECTED_FRACTION);
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = rngInt(rng, i + 1);
    const tmp = eligible[i]!;
    eligible[i] = eligible[j]!;
    eligible[j] = tmp;
  }
  for (let k = 0; k < protectedCount; k++) {
    const idx = eligible[k]!;
    tiles[idx] = { ...tiles[idx]!, protected: true };
  }

  return { config, tiles };
}

export function tileAt(board: Board, x: number, y: number): Tile | null {
  const { width, height } = board.config;
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  return board.tiles[y * width + x] ?? null;
}
