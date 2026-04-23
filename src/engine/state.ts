import type { BoardConfig, Coord, GameState, Tile } from '../types';
import { generateBoard, tileAt } from './board';

// Pure reducer surface for the engine. UI dispatches actions, renderer reads
// snapshots. No I/O, no React, no timers — all side effects live in clients.
//
// All gameplay truth flows through here. React/Pixi are not allowed to
// author state shape or transitions; they only pass actions in and read
// snapshots out.

export type GameAction =
  | { readonly type: 'hover'; readonly x: number; readonly y: number }
  | { readonly type: 'hoverClear' }
  | { readonly type: 'reveal'; readonly x: number; readonly y: number }
  | { readonly type: 'flag'; readonly x: number; readonly y: number }
  | { readonly type: 'regen'; readonly seed: number };

export function createGameState(config: BoardConfig): GameState {
  return {
    board: generateBoard(config),
    cursor: null,
    phase: { kind: 'active' },
  };
}

export function reduceGame(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'hover': {
      if (state.cursor?.x === action.x && state.cursor?.y === action.y) {
        return state;
      }
      return { ...state, cursor: { x: action.x, y: action.y } };
    }
    case 'hoverClear': {
      if (state.cursor === null) return state;
      return { ...state, cursor: null };
    }
    case 'reveal':
      return revealTile(state, action.x, action.y);
    case 'flag':
      return toggleFlag(state, action.x, action.y);
    case 'regen':
      return createGameState({ ...state.board.config, seed: action.seed });
  }
}

// --- Transitions ---------------------------------------------------------

function revealTile(state: GameState, x: number, y: number): GameState {
  if (state.phase.kind !== 'active') return state;

  const tile = tileAt(state.board, x, y);
  if (!tile) return state;
  if (tile.state !== 'unresolved') return state;

  const { width, height } = state.board.config;
  const nextTiles = state.board.tiles.slice();

  if (tile.isMine) {
    // Detonation. Resolve the breach tile itself and lock the phase.
    // Visual "reveal all mines" is a render-time concern; engine truth is
    // just the detonated tile + phase transition.
    nextTiles[y * width + x] = { ...tile, state: 'resolved' };
    return {
      ...state,
      board: { ...state.board, tiles: nextTiles },
      phase: { kind: 'breached', at: { x, y } },
    };
  }

  // Safe reveal with BFS flood through any zero-adjacency region. Numbered
  // tiles at the border of a zero-region are revealed but don't extend the
  // flood. Flagged tiles are never walked through.
  const queue: Coord[] = [{ x, y }];
  const visited = new Set<number>([y * width + x]);

  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    const idx = current.y * width + current.x;
    const t = nextTiles[idx]!;
    if (t.state !== 'unresolved') continue;

    nextTiles[idx] = { ...t, state: 'resolved' };

    if (t.adjacentMines > 0) continue; // border of the flood; don't recurse

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = current.x + dx;
        const ny = current.y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nidx = ny * width + nx;
        if (visited.has(nidx)) continue;
        const n = nextTiles[nidx]!;
        if (n.state !== 'unresolved') continue;
        visited.add(nidx);
        queue.push({ x: nx, y: ny });
      }
    }
  }

  return {
    ...state,
    board: { ...state.board, tiles: nextTiles },
  };
}

function toggleFlag(state: GameState, x: number, y: number): GameState {
  if (state.phase.kind !== 'active') return state;

  const tile = tileAt(state.board, x, y);
  if (!tile) return state;
  if (tile.state === 'resolved') return state; // can't flag a resolved tile

  const { width } = state.board.config;
  const nextTiles: Tile[] = state.board.tiles.slice();
  nextTiles[y * width + x] = {
    ...tile,
    state: tile.state === 'flagged' ? 'unresolved' : 'flagged',
  };
  return {
    ...state,
    board: { ...state.board, tiles: nextTiles },
  };
}
