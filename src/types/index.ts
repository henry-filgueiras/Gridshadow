// Shared contract types. The engine owns the shapes; render and UI only
// consume them.
//
// Vocabulary note: we bias toward Witness Protocol language where it costs
// nothing. A tile is `unresolved` until you've witnessed its constraint
// count; once witnessed it is `resolved`. `flagged` names a deliberate
// operator annotation. Naming costs compound — set the identity now.

export type TileState = 'unresolved' | 'resolved' | 'flagged';

export interface Tile {
  readonly x: number;
  readonly y: number;
  readonly isMine: boolean;
  // Number of adjacent hazards. Intrinsic to the board, not to play state.
  readonly adjacentMines: number;
  readonly state: TileState;
}

export interface BoardConfig {
  readonly width: number;
  readonly height: number;
  readonly mineCount: number;
  readonly seed: number;
}

export interface Board {
  readonly config: BoardConfig;
  readonly tiles: ReadonlyArray<Tile>; // row-major: index = y * width + x
}

export interface Coord {
  readonly x: number;
  readonly y: number;
}

// Phase is a tagged union so each kind can carry only the data it needs.
// Active is the ongoing observation loop; breached is terminal for the run.
export type GamePhase =
  | { readonly kind: 'active' }
  | { readonly kind: 'breached'; readonly at: Coord };

export interface GameState {
  readonly board: Board;
  readonly cursor: Coord | null;
  readonly phase: GamePhase;
}
