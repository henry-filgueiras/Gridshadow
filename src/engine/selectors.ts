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
