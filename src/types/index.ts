// Shared contract types. These are deliberately minimal — the engine owns
// the shapes, render and UI only consume them.

export type TileState = 'hidden' | 'revealed' | 'flagged';

export interface Tile {
  readonly x: number;
  readonly y: number;
  readonly isMine: boolean;
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

export interface GameState {
  readonly board: Board;
  readonly cursor: Coord | null;
  readonly selection: Coord | null;
}
