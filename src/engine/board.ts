import type { Board, BoardConfig, Tile } from '../types';
import { createRng, rngInt } from './rng';

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

  return { config, tiles };
}

export function tileAt(board: Board, x: number, y: number): Tile | null {
  const { width, height } = board.config;
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  return board.tiles[y * width + x] ?? null;
}
