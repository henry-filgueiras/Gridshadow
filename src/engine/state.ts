import type {
  BoardConfig,
  Coord,
  GamePhase,
  GameState,
  ProbeOrientation,
  Tile,
} from '../types';
import { generateBoard, tileAt } from './board';

// Witness Probe v1 tunables. Kept at file scope so future variants (shorter
// probes, elite-cost probes) can reference them without touching the reducer.
const PROBE_LENGTH = 5;
const PROBE_COST = 2;
// Anti-collapse threshold: require at least this many truly-unknown cells in
// the segment. "unresolved" here is strict — flagged and resolved do not
// count. With PROBE_LENGTH = 5 and threshold = 3, edge probes (clipped to 3
// cells) can still pass when every on-board cell is unresolved, and the
// instrument cannot collapse to a 2-cell "which one is the mine?" question.
const PROBE_MIN_UNRESOLVED = 3;

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
  | { readonly type: 'confirm'; readonly x: number; readonly y: number }
  | {
      readonly type: 'probe';
      readonly x: number;
      readonly y: number;
      readonly orientation: ProbeOrientation;
    }
  | { readonly type: 'regen'; readonly seed: number };

export function createGameState(config: BoardConfig): GameState {
  const max = Math.max(0, config.witnessCharges | 0);
  return {
    board: generateBoard(config),
    cursor: null,
    phase: { kind: 'active' },
    witness: { charge: max, max, confirms: 0 },
    lastProbe: null,
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
    case 'confirm':
      return confirmTile(state, action.x, action.y);
    case 'probe':
      return probeTile(state, action.x, action.y, action.orientation);
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

  // Witness charge gate: a direct reveal requires charge. Charge is decremented
  // once per effectful reveal action — the cascade flood that follows a safe
  // reveal is free, because the charge paid for the observation that made the
  // flood inevitable. Denied reveals (wrong tile state, breached, zero charge)
  // do not spend charge.
  if (state.witness.charge <= 0) return state;

  const { width, height } = state.board.config;
  const nextTiles = state.board.tiles.slice();
  const detonated = revealAt(nextTiles, width, height, x, y);
  const nextWitness = {
    ...state.witness,
    charge: state.witness.charge - 1,
  };

  return {
    ...state,
    board: { ...state.board, tiles: nextTiles },
    phase: detonated
      ? { kind: 'breached', at: { x, y } }
      : resolvePhase(nextTiles),
    witness: nextWitness,
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

// Witness Confirmation — the ritual action. The player asserts that a local
// neighborhood is solved by clicking an already-resolved numbered tile; if
// the number of adjacent flags exactly matches the tile's adjacency count,
// the engine reveals every remaining unflagged neighbor as a group.
//
// Costs no charge. A successful safe confirmation restores 1 charge (capped
// at max) and increments `witness.confirms` — the UI uses that counter for
// its restoration feedback, so it stays deterministic.
//
// If the player's flags are wrong, the breach happens through the normal
// reveal path on whichever neighbor turns out to be the hazard. No
// forgiveness, no hidden correction — the confirmation is a truth claim.
function confirmTile(state: GameState, x: number, y: number): GameState {
  if (state.phase.kind !== 'active') return state;

  const tile = tileAt(state.board, x, y);
  if (!tile) return state;
  // Only resolved numbered tiles are confirmable. Zero-adjacency resolved
  // tiles have nothing to confirm (their neighbors already cascaded), and
  // unresolved or flagged tiles are not claims yet.
  if (tile.state !== 'resolved') return state;
  if (tile.isMine) return state;
  if (tile.adjacentMines === 0) return state;

  const { width, height } = state.board.config;
  let flaggedCount = 0;
  const targets: Coord[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const n = state.board.tiles[ny * width + nx]!;
      if (n.state === 'flagged') flaggedCount++;
      else if (n.state === 'unresolved') targets.push({ x: nx, y: ny });
    }
  }

  // The confirmation condition. Over- or under-flagging refuses the claim.
  if (flaggedCount !== tile.adjacentMines) return state;
  // Nothing to reveal — no "meaningful safe resolution", no restoration.
  if (targets.length === 0) return state;

  const nextTiles = state.board.tiles.slice();
  let breachAt: Coord | null = null;
  for (const t of targets) {
    const blew = revealAt(nextTiles, width, height, t.x, t.y);
    if (blew) {
      breachAt = t;
      break;
    }
  }

  if (breachAt) {
    // Flags were wrong. No restoration; the confirmation counter does not
    // increment — this was not a successful claim.
    return {
      ...state,
      board: { ...state.board, tiles: nextTiles },
      phase: { kind: 'breached', at: breachAt },
    };
  }

  // Safe confirmation. Restore 1 charge (capped) and record the success.
  const nextWitness = {
    ...state.witness,
    charge: Math.min(state.witness.max, state.witness.charge + 1),
    confirms: state.witness.confirms + 1,
  };

  return {
    ...state,
    board: { ...state.board, tiles: nextTiles },
    phase: resolvePhase(nextTiles),
    witness: nextWitness,
  };
}

// Clear detection. Called after any safe reveal or safe confirmation to
// promote `active` → `cleared` when every non-hazard tile is resolved. Flags
// are irrelevant: they are player commitments, not the truth source. Callers
// that detect a breach must short-circuit this — breach beats clear if a
// single action could trigger both (this function is only called on the
// non-breach branch). Shared by `reveal` and `confirm` so the two paths cannot
// diverge on what "cleared" means.
function resolvePhase(tiles: ReadonlyArray<Tile>): GamePhase {
  for (const t of tiles) {
    if (t.isMine) continue;
    if (t.state !== 'resolved') return { kind: 'active' };
  }
  return { kind: 'cleared' };
}

// Witness Probe — structural scan. Does not reveal tile state; returns the
// total hazard count inside a 5-cell line centered on the target. The
// instrument buys structure, not certainty: the player learns *how many*
// hazards occupy a region without learning *which cells* are hazards.
//
// Refusal (no-op, no cost) on any of:
//   - run not in active phase
//   - insufficient charge (needs PROBE_COST)
//   - target tile is out of bounds or not `unresolved`
//   - segment contains fewer than PROBE_MIN_UNRESOLVED truly-unresolved
//     cells (flagged and resolved do not count) — the anti-collapse gate
//
// On success: deduct PROBE_COST from charge, store a `ProbeReading` on
// state.lastProbe. No tile state changes — the board's truth is untouched,
// only the player's *knowledge* grows.
function probeTile(
  state: GameState,
  x: number,
  y: number,
  orientation: ProbeOrientation,
): GameState {
  if (state.phase.kind !== 'active') return state;
  if (state.witness.charge < PROBE_COST) return state;

  const target = tileAt(state.board, x, y);
  if (!target) return state;
  if (target.state !== 'unresolved') return state;

  const cells = probeSegment(state.board.config.width, state.board.config.height, x, y, orientation);

  let unresolvedInSegment = 0;
  let hazardCount = 0;
  const { width } = state.board.config;
  for (const c of cells) {
    const t = state.board.tiles[c.y * width + c.x]!;
    if (t.state === 'unresolved') unresolvedInSegment++;
    if (t.isMine) hazardCount++;
  }

  if (unresolvedInSegment < PROBE_MIN_UNRESOLVED) return state;

  return {
    ...state,
    witness: {
      ...state.witness,
      charge: state.witness.charge - PROBE_COST,
    },
    lastProbe: {
      at: { x, y },
      orientation,
      cells,
      hazardCount,
    },
  };
}

// Compute the probe's scanned cells: a PROBE_LENGTH-long line centered on
// (x,y) along the given axis, clipped to board bounds. Pure and shared —
// the renderer calls an equivalent derivation via a selector so the
// preview outline cannot drift from the engine's actual segment.
export function probeSegment(
  width: number,
  height: number,
  x: number,
  y: number,
  orientation: ProbeOrientation,
): Coord[] {
  const half = (PROBE_LENGTH - 1) >> 1;
  const cells: Coord[] = [];
  for (let step = -half; step <= half; step++) {
    const nx = orientation === 'horizontal' ? x + step : x;
    const ny = orientation === 'vertical' ? y + step : y;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    cells.push({ x: nx, y: ny });
  }
  return cells;
}

export const PROBE_TUNABLES = {
  length: PROBE_LENGTH,
  cost: PROBE_COST,
  minUnresolved: PROBE_MIN_UNRESOLVED,
} as const;

// Shared reveal core. Mutates `tiles` in place: reveals the tile at (x,y),
// cascading through any zero-adjacency flood. Returns true iff the targeted
// tile is a mine (detonation). Does not touch charge, phase, or any other
// out-of-tiles state — callers decide how a detonation is interpreted
// (direct reveal: normal breach; chord: breach via wrong flag).
function revealAt(
  tiles: Tile[],
  width: number,
  height: number,
  x: number,
  y: number,
): boolean {
  const idx = y * width + x;
  const tile = tiles[idx]!;
  if (tile.state !== 'unresolved') return false;

  if (tile.isMine) {
    tiles[idx] = { ...tile, state: 'resolved' };
    return true;
  }

  // BFS flood. Array + index pointer (no shift(), which would be O(n²)).
  // Flagged tiles stop propagation; numbered tiles are revealed but don't
  // extend the flood.
  const queue: Coord[] = [{ x, y }];
  const visited = new Set<number>([idx]);

  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    const cidx = current.y * width + current.x;
    const t = tiles[cidx]!;
    if (t.state !== 'unresolved') continue;

    tiles[cidx] = { ...t, state: 'resolved' };

    if (t.adjacentMines > 0) continue;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = current.x + dx;
        const ny = current.y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nidx = ny * width + nx;
        if (visited.has(nidx)) continue;
        const n = tiles[nidx]!;
        if (n.state !== 'unresolved') continue;
        visited.add(nidx);
        queue.push({ x: nx, y: ny });
      }
    }
  }

  return false;
}
