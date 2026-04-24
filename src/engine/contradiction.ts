import type { Coord, GameState } from '../types';

// Contradiction detection — truth serum, not oracle.
//
// A contradiction here is a resolved numbered tile whose surrounding flag and
// unresolved counts make its adjacency constraint *impossible* to satisfy
// from the current state. This is proof, not probability: if the selector
// marks a tile, the player has already created an impossible read.
//
// Two classes shipped in v1, matched against the brief:
//   - Rule A (over-flag):  adjacentFlags > adjacentConstraint
//   - Rule B (under-space): adjacentFlags + adjacentUnresolved < adjacentConstraint
//
// No inference solver, no probability hints, no "recommended move", no auto-
// fix. If a later pass wants a SAT-style multi-tile contradiction class, it
// earns its own entry alongside these two — the point of the explicit union
// is that every future contributor has to read the proof before adding.

export type ContradictionKind = 'over-flag' | 'under-space';

export interface Contradiction {
  readonly at: Coord;
  readonly kind: ContradictionKind;
  readonly adjacentConstraint: number;
  readonly adjacentFlags: number;
  readonly adjacentUnresolved: number;
}

// Pure derivation over engine state. Same tiles + same flags → same list,
// in row-major order. Terminal phases suppress detection: breached fields
// already highlight mis-flags, and cleared fields cannot carry a
// contradiction by construction (every safe tile is resolved, so every
// remaining flag is necessarily a hazard). The selector is the single
// authority on "is this tile contradictory?" — renderer and HUD both
// consume this list, neither reinvents it.
export function detectContradictions(
  state: GameState,
): ReadonlyArray<Contradiction> {
  if (state.phase.kind !== 'active') return [];

  const { tiles } = state.board;
  const { width, height } = state.board.config;
  const out: Contradiction[] = [];

  for (const tile of tiles) {
    if (tile.state !== 'resolved') continue;
    if (tile.isMine) continue;
    // Zero-adjacency resolved tiles can't be contradicted by flags: no
    // mines around them, so any flag in the Moore neighborhood is
    // automatically a misflag contradiction against *this* tile. But the
    // proof anchor would be the numbered tile itself, and a zero-tile has
    // no number to anchor on — a better read of the contradiction is
    // carried by whichever adjacent numbered tile is over-flagged. Skip.
    if (tile.adjacentMines === 0) continue;

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

    const constraint = tile.adjacentMines;
    if (flags > constraint) {
      out.push({
        at: { x: tile.x, y: tile.y },
        kind: 'over-flag',
        adjacentConstraint: constraint,
        adjacentFlags: flags,
        adjacentUnresolved: unresolved,
      });
    } else if (flags + unresolved < constraint) {
      out.push({
        at: { x: tile.x, y: tile.y },
        kind: 'under-space',
        adjacentConstraint: constraint,
        adjacentFlags: flags,
        adjacentUnresolved: unresolved,
      });
    }
  }

  return out;
}
