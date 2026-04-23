import type { BoardConfig, GameState } from '../types';
import { generateBoard } from './board';

// Pure reducer surface for the engine. UI dispatches actions, renderer reads
// snapshots. No I/O, no React, no timers — all side effects live in clients.

export type GameAction =
  | { readonly type: 'hover'; readonly x: number; readonly y: number }
  | { readonly type: 'hoverClear' }
  | { readonly type: 'select'; readonly x: number; readonly y: number }
  | { readonly type: 'regen'; readonly seed: number };

export function createGameState(config: BoardConfig): GameState {
  return {
    board: generateBoard(config),
    cursor: null,
    selection: null,
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
    case 'select': {
      const same =
        state.selection?.x === action.x && state.selection?.y === action.y;
      return {
        ...state,
        selection: same ? null : { x: action.x, y: action.y },
      };
    }
    case 'regen': {
      return createGameState({
        ...state.board.config,
        seed: action.seed,
      });
    }
  }
}
