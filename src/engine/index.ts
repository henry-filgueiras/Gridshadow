// Public engine surface. Render and UI layers import from here, not from
// individual engine files, so we have one place to watch for coupling.

export { generateBoard, PROTECTED_TUNABLES, tileAt } from './board';
export { createRng, hashSeed, rngInt, type Rng } from './rng';
export {
  createGameState,
  reduceGame,
  probeSegment,
  PROBE_TUNABLES,
  type GameAction,
} from './state';
export {
  protectedTally,
  tallyTiles,
  witnessStatus,
  type ProtectedTally,
  type TileTally,
  type WitnessStatus,
} from './selectors';
export {
  detectContradictions,
  type Contradiction,
  type ContradictionKind,
} from './contradiction';
