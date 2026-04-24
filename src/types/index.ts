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
  // Protected Constraints v1 (experiment): a board-intrinsic flag marking a
  // safe numbered tile whose adjacency count starts *occluded* after reveal.
  // Mines and zero-adjacency tiles are never protected — a zero has no
  // constraint value worth hiding, and hiding a mine's "isMine" would break
  // the safety invariant this whole mechanic is built on.
  readonly protected: boolean;
  // Play-state, mutated only by the `unveil` reducer action: true once the
  // player has paid to reveal this tile's constraint number. Meaningless
  // when `protected === false` (always read as unveiled by UI).
  readonly valueRevealed: boolean;
}

export interface BoardConfig {
  readonly width: number;
  readonly height: number;
  readonly mineCount: number;
  readonly seed: number;
  // Maximum witness charge at the start of the run. Direct reveals consume
  // charge; cascade expansion and flagging do not. See WitnessState.
  readonly witnessCharges: number;
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
// Active is the ongoing observation loop; breached and cleared are terminal.
// Cleared fires when every non-hazard tile is resolved — flags are irrelevant,
// they are player commitments, not the truth source. Breach beats clear if a
// single action could trigger both.
export type GamePhase =
  | { readonly kind: 'active' }
  | { readonly kind: 'breached'; readonly at: Coord }
  | { readonly kind: 'cleared' };

// Witness charge is the player's finite budget for direct observation.
// `charge` is what remains; `max` is the starting capacity, preserved for HUD
// ratios and future analytics. `confirms` is a monotonic count of successful
// safe Witness Confirmations — each one increments it by 1 regardless of
// whether the restored charge was absorbed or capped, so the UI can show a
// ritual-success pulse independently of the numeric charge value.
export interface WitnessState {
  readonly charge: number;
  readonly max: number;
  readonly confirms: number;
}

// A Witness Probe is a structural instrument: it buys the hazard count of a
// region without revealing which cells are hazards. v1 ships one geometry, a
// 5-cell line, in two orientations. More geometries (row/column signatures,
// rectangular scans) are explicitly deferred.
export type ProbeOrientation = 'horizontal' | 'vertical';

// Result of a successful probe. `cells` is the actual scanned segment
// (clipped to board bounds at edges), so consumers can render the exact
// region the reading describes without re-deriving the geometry.
export interface ProbeReading {
  readonly at: Coord;
  readonly orientation: ProbeOrientation;
  readonly cells: ReadonlyArray<Coord>;
  readonly hazardCount: number;
}

export interface GameState {
  readonly board: Board;
  readonly cursor: Coord | null;
  readonly phase: GamePhase;
  readonly witness: WitnessState;
  // Ledger of recent successful Witness Probes, newest first, bounded.
  // The engine owns this list so that same seed + same action log reproduces
  // the same ledger — the UI reads it, it does not author it. `probeHistory[0]`
  // is the most recent reading; empty array means no probe has landed yet.
  readonly probeHistory: ReadonlyArray<ProbeReading>;
}
