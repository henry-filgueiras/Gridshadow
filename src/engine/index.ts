// Public engine surface. Render and UI layers import from here, not from
// individual engine files, so we have one place to watch for coupling.

export { generateBoard, tileAt } from './board';
export { createRng, hashSeed, rngInt, type Rng } from './rng';
export { createGameState, reduceGame, type GameAction } from './state';
export {
  tallyTiles,
  witnessStatus,
  type TileTally,
  type WitnessStatus,
} from './selectors';
