import type { GameState } from '../types';

// Pure derivations over engine state. The HUD and other observers should
// read through here rather than scanning tiles themselves — that keeps the
// observability surface explicit and cheap to extend.

export interface TileTally {
  readonly unresolved: number;
  readonly resolved: number;
  readonly flagged: number;
  readonly total: number;
}

// Tiered health of the witness charge pool. Consumers use this to decide
// urgency of presentation without rederiving thresholds everywhere. Keeping
// the thresholds here means the HUD, a future overlay, and any audio cue
// all agree on when the budget is "low".
export type WitnessStatus = 'steady' | 'low' | 'exhausted';

export function witnessStatus(state: GameState): WitnessStatus {
  const { charge, max } = state.witness;
  if (charge <= 0) return 'exhausted';
  // Low when down to the last quarter of the starting budget, or three or
  // fewer charges remaining — whichever triggers first. The absolute floor
  // matters more than the ratio as max shrinks.
  if (charge <= 3 || charge * 4 <= max) return 'low';
  return 'steady';
}

export function tallyTiles(state: GameState): TileTally {
  let unresolved = 0;
  let resolved = 0;
  let flagged = 0;
  for (const tile of state.board.tiles) {
    switch (tile.state) {
      case 'unresolved':
        unresolved++;
        break;
      case 'resolved':
        resolved++;
        break;
      case 'flagged':
        flagged++;
        break;
    }
  }
  return {
    unresolved,
    resolved,
    flagged,
    total: state.board.tiles.length,
  };
}
