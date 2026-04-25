import type {
  BoardConfig,
  Coord,
  GamePhase,
  GameState,
  ProbeOrientation,
  RunAction,
  RunLedgerEntry,
  Tile,
} from '../types';
import { generateBoard, PROTECTED_TUNABLES, tileAt } from './board';
import { detectContradictions } from './contradiction';

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
// Probe ledger size. Memory prosthetic, not analytics surface: the player
// should be able to see the whole ledger at a glance without scrolling. 8 is
// the top of the "working memory" band (5–9 items) — enough to survive a
// multi-probe reasoning pass without becoming a spreadsheet.
const PROBE_HISTORY_LIMIT = 8;

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
  | { readonly type: 'unveil'; readonly x: number; readonly y: number }
  | { readonly type: 'regen'; readonly seed: number };

export function createGameState(config: BoardConfig): GameState {
  const max = Math.max(0, config.witnessCharges | 0);
  return {
    board: generateBoard(config),
    cursor: null,
    phase: { kind: 'active' },
    witness: { charge: max, max, confirms: 0 },
    probeHistory: [],
    runHistory: [],
  };
}

export function reduceGame(state: GameState, action: GameAction): GameState {
  const next = reduceInner(state, action);
  if (next === state) return state;
  // Ledger append rule — only *effectful* board/witness actions produce
  // entries. Hover and hoverClear are UI-state and change `cursor` only;
  // regen replaces the whole run state (including a fresh empty ledger)
  // and must not leave a trailing entry from the old run. Reference
  // inequality (`next !== state`) above already filtered out refused
  // no-ops; this switch filters out the two non-gameplay surfaces that
  // still return a fresh object.
  switch (action.type) {
    case 'reveal':
    case 'flag':
    case 'confirm':
    case 'probe':
    case 'unveil':
      return appendLedgerEntry(next, action.type);
    default:
      return next;
  }
}

function reduceInner(state: GameState, action: GameAction): GameState {
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
    case 'unveil':
      return unveilTile(state, action.x, action.y);
    case 'regen':
      return createGameState({ ...state.board.config, seed: action.seed });
  }
}

// Run Timeline Ledger — forensic append. Called *after* the inner
// reducer has produced the next state for an effectful action, so every
// field in the entry describes the post-action world. Step is monotonic
// action index (1-based, so a reader can count entries without +1
// bookkeeping). `resolvedCount` counts non-mine tiles in state
// `resolved` — the detonating mine at breach becomes `resolved` by the
// reveal core but is excluded here because it's not progress. Mines
// never count toward progress. `totalResolvable` is the board-intrinsic
// non-mine count; passed through every entry (rather than derived later)
// so the ledger is self-describing and replay diffs are trivial.
function appendLedgerEntry(state: GameState, action: RunAction): GameState {
  let resolvedCount = 0;
  let flaggedCount = 0;
  let totalResolvable = 0;
  for (const t of state.board.tiles) {
    if (!t.isMine) {
      totalResolvable++;
      if (t.state === 'resolved') resolvedCount++;
    }
    if (t.state === 'flagged') flaggedCount++;
  }
  const contradictionCount = detectContradictions(state).length;
  const entry: RunLedgerEntry = {
    step: state.runHistory.length + 1,
    action,
    resolvedCount,
    totalResolvable,
    flaggedCount,
    witnessCharge: state.witness.charge,
    contradictionCount,
    phase: state.phase.kind,
  };
  return { ...state, runHistory: [...state.runHistory, entry] };
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

  return applyClosureRestoration({
    ...state,
    board: { ...state.board, tiles: nextTiles },
    phase: detonated
      ? { kind: 'breached', at: { x, y } }
      : resolvePhase(nextTiles),
    witness: nextWitness,
  });
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
  return applyClosureRestoration({
    ...state,
    board: { ...state.board, tiles: nextTiles },
  });
}

// Witness Confirmation — the ritual action. The player asserts that a local
// neighborhood is solved by clicking an already-resolved numbered tile; if
// the number of adjacent flags exactly matches the tile's adjacency count,
// the engine reveals every remaining unflagged neighbor as a group.
//
// Costs no charge. Confirmation no longer refunds charge by itself: the
// button being correct is not what earns authority back. A correct confirm
// does, however, typically produce local stabilization (the target tile's
// last unresolved neighbors become resolved, flag count already matches),
// which triggers Constraint Closure Restoration on the target and any
// neighbors that were waiting on this tile's removal. The +N charge that
// used to look like a confirm refund now arrives because the field
// stabilized, not because the operator clicked.
//
// `witness.confirms` still increments on every successful safe confirm, so
// the HUD can tally ratified reads without conflating them with charge.
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
  // Protected Constraints v1: confirm requires the constraint to be
  // visible to the operator. If we let a chord run against a hidden
  // number, the outcome (revealed neighbors vs. breach) would leak the
  // occluded count by reverse-inference — defeating the whole point of
  // charging for the unveil. Refuse silently.
  if (tile.protected && !tile.valueRevealed) return state;

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

  // Safe confirmation. No direct charge refund — restoration, if any,
  // arrives through Constraint Closure on the target tile (whose local
  // truth is now fully stabilized by construction) and any resolved
  // numbered neighbors that were waiting on this confirm to close.
  const nextWitness = {
    ...state.witness,
    confirms: state.witness.confirms + 1,
  };

  return applyClosureRestoration({
    ...state,
    board: { ...state.board, tiles: nextTiles },
    phase: resolvePhase(nextTiles),
    witness: nextWitness,
  });
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

// Constraint Closure Restoration — authority returns because the field
// actually stabilized, not because a button was clicked. For every
// resolved numbered tile whose local truth is fully accounted for — flag
// count equals the constraint AND no adjacent tile is still unresolved —
// we flip `closedForWitness` once and bank +1 witness charge (capped at
// max). The flip is strictly monotonic, so unflag/reflag churn cannot
// farm the refund.
//
// Why the two-count rule is equivalent to "every flag covers a real
// mine": in active phase, resolved mines would have breached, so the
// resolved-non-mine set is clean. If flags === constraint and
// unresolved === 0, the constraint's mines must all live inside the flag
// set (there's nowhere else for them to be). We never need to consult
// `isMine` to verify — "genuine local stabilization" falls out of the
// two visible counts.
//
// Why contradictions block closure for free: an over-flagged tile has
// flags > constraint, and an under-spaced tile has flags + unresolved <
// constraint; neither matches the closure gate. Sloppy flagging costs
// the operator the restoration until they resolve the contradiction.
// No explicit "punish contradictions" branch is needed.
//
// Why occluded protected tiles are skipped: their constraint number is
// deliberately hidden. If closure could fire against them, the +1
// charge tick would leak the number by reverse-inference (the operator
// would know "my flags must now equal the hidden value"). Deferring
// closure until after `unveil` pays for the read preserves the
// purchase's meaning.
//
// Scan is row-major over the whole tile array — trivial at 24×24, and
// deterministic enough to keep action-log replays bit-identical.
// Suppressed in terminal phases because a breached field is already
// telling a different story, and a cleared field's restoration would
// be post-hoc noise.
function applyClosureRestoration(state: GameState): GameState {
  if (state.phase.kind !== 'active') return state;

  const { tiles } = state.board;
  const { width, height } = state.board.config;

  let nextTiles: Tile[] | null = null;
  let restored = 0;

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i]!;
    if (tile.state !== 'resolved') continue;
    if (tile.isMine) continue;
    if (tile.adjacentMines === 0) continue;
    if (tile.protected && !tile.valueRevealed) continue;
    if (tile.closedForWitness) continue;

    let flags = 0;
    let unresolved = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = tile.x + dx;
        const ny = tile.y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = tiles[ny * width + nx]!;
        if (n.state === 'flagged') flags++;
        else if (n.state === 'unresolved') unresolved++;
      }
    }
    if (unresolved !== 0) continue;
    if (flags !== tile.adjacentMines) continue;

    if (!nextTiles) nextTiles = tiles.slice();
    nextTiles[i] = { ...tile, closedForWitness: true };
    restored++;
  }

  if (!nextTiles) return state;

  const { max, charge } = state.witness;
  return {
    ...state,
    board: { ...state.board, tiles: nextTiles },
    witness: {
      ...state.witness,
      charge: Math.min(max, charge + restored),
    },
  };
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
// On success: deduct PROBE_COST from charge, prepend the new `ProbeReading`
// to `state.probeHistory` (newest first), and cap the ledger at
// PROBE_HISTORY_LIMIT — oldest entries fall off deterministically. No tile
// state changes: the board's truth is untouched, only the player's
// *knowledge* grows. Because history lives on engine state and only mutates
// through this pure reducer, same seed + same action log reproduces the
// same ledger on replay.
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

  const reading: GameState['probeHistory'][number] = {
    at: { x, y },
    orientation,
    cells,
    hazardCount,
  };
  // Prepend (newest first), then truncate to the bounded window. Dropping
  // from the tail is deterministic — a ninth probe always evicts entry #8,
  // never some other index — so replay stays stable.
  const nextHistory =
    state.probeHistory.length < PROBE_HISTORY_LIMIT
      ? [reading, ...state.probeHistory]
      : [reading, ...state.probeHistory.slice(0, PROBE_HISTORY_LIMIT - 1)];

  return {
    ...state,
    witness: {
      ...state.witness,
      charge: state.witness.charge - PROBE_COST,
    },
    probeHistory: nextHistory,
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
  historyLimit: PROBE_HISTORY_LIMIT,
} as const;

// Protected Constraints v1 — unveil action. The tile has already been
// proved safe (resolved, non-mine); the *number* that quantifies its
// adjacency is what we're buying. Cost: 1 witness charge, on acceptance
// only, matching the reveal cost — this is intentional. The experiment
// is whether charge still feels meaningful when the purchase is
// interpretation rather than safety; if unveil cost diverged from reveal
// cost, we'd be answering a different question.
//
// Refusal (no-op, no cost) on any of:
//   - run not in active phase
//   - target out of bounds
//   - target not `resolved` (unresolved tiles need `reveal` first)
//   - target not `protected` (nothing to unveil)
//   - target already `valueRevealed` (the number is already visible)
//   - insufficient charge
//
// On success: flip `valueRevealed` to true and decrement charge by 1.
// No cascade, no phase transition, no confirms increment. The board's
// truth has not changed — only the operator's legibility of that truth.
function unveilTile(state: GameState, x: number, y: number): GameState {
  if (state.phase.kind !== 'active') return state;

  const tile = tileAt(state.board, x, y);
  if (!tile) return state;
  if (tile.state !== 'resolved') return state;
  if (!tile.protected) return state;
  if (tile.valueRevealed) return state;
  if (state.witness.charge < PROTECTED_TUNABLES.unveilCost) return state;

  const { width } = state.board.config;
  const nextTiles = state.board.tiles.slice();
  nextTiles[y * width + x] = { ...tile, valueRevealed: true };

  // Unveil can unblock Constraint Closure on this tile: occluded tiles are
  // deliberately excluded from closure (to avoid leaking the constraint
  // number via charge restoration), so the moment the operator pays to
  // read the number, any already-satisfied local frame is allowed to
  // bank its restoration. A freshly-unveiled 3 surrounded by 3 correct
  // flags and 0 unresolved neighbors recovers +1 immediately.
  return applyClosureRestoration({
    ...state,
    board: { ...state.board, tiles: nextTiles },
    witness: {
      ...state.witness,
      charge: state.witness.charge - PROTECTED_TUNABLES.unveilCost,
    },
  });
}

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
