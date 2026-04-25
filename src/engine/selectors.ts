import type { GameState, RunLedgerEntry } from '../types';

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

// Protected Constraints v1 tally. `occluded` is the count of tiles the
// operator can currently pay to unveil — resolved, protected, not yet
// unveiled. `unveiled` is how many they've already paid for. `total` is
// the number of protected tiles on the board (board-intrinsic, stable
// under any action log). HUD surfaces `occluded` as the actionable
// number; the others are available for future observers.
export interface ProtectedTally {
  readonly total: number;
  readonly occluded: number;
  readonly unveiled: number;
}

export function protectedTally(state: GameState): ProtectedTally {
  let total = 0;
  let occluded = 0;
  let unveiled = 0;
  for (const tile of state.board.tiles) {
    if (!tile.protected) continue;
    total++;
    if (tile.valueRevealed) {
      unveiled++;
    } else if (tile.state === 'resolved') {
      occluded++;
    }
  }
  return { total, occluded, unveiled };
}

// Post-run summary — a compact aggregation over the ledger, computed on
// demand for the end-screen. Intentionally *not* stored on the engine
// state: the ledger is canon, summaries are derived. Breach-marker
// carries the step at which the run ended; cleared runs leave it null.
// Contradiction peak is the max across the whole run, so a spiral that
// resolved before the end still shows up. Closure restorations are
// counted from the board rather than the ledger because `closedForWitness`
// is strictly monotonic, and counting it is cheaper and equally
// replay-deterministic.
export interface RunSummary {
  readonly steps: number;
  readonly action: {
    readonly reveal: number;
    readonly flag: number;
    readonly confirm: number;
    readonly probe: number;
    readonly unveil: number;
  };
  readonly resolvedCount: number;
  readonly totalResolvable: number;
  readonly resolvedPct: number;
  readonly witnessCharge: number;
  readonly witnessMax: number;
  readonly confirms: number;
  readonly closureRestorations: number;
  readonly contradictionPeak: number;
  readonly contradictionFinal: number;
  readonly breachStep: number | null;
  readonly phase: 'active' | 'breached' | 'cleared';
}

export function runSummary(state: GameState): RunSummary {
  const ledger = state.runHistory;
  const last = ledger.length > 0 ? ledger[ledger.length - 1]! : null;

  const action = { reveal: 0, flag: 0, confirm: 0, probe: 0, unveil: 0 };
  let contradictionPeak = 0;
  let breachStep: number | null = null;
  for (const e of ledger) {
    action[e.action]++;
    if (e.contradictionCount > contradictionPeak) {
      contradictionPeak = e.contradictionCount;
    }
    if (breachStep === null && e.phase === 'breached') breachStep = e.step;
  }

  let closureRestorations = 0;
  for (const t of state.board.tiles) {
    if (t.closedForWitness) closureRestorations++;
  }

  const resolvedCount = last?.resolvedCount ?? 0;
  let totalResolvable = last?.totalResolvable ?? 0;
  if (totalResolvable === 0) {
    // No ledger yet — fall back to counting non-mine tiles so a run that
    // ends on a first-click breach (step 1, recorded) or has not acted
    // yet still reports a sane denominator.
    for (const t of state.board.tiles) if (!t.isMine) totalResolvable++;
  }

  return {
    steps: ledger.length,
    action,
    resolvedCount,
    totalResolvable,
    resolvedPct: totalResolvable > 0 ? resolvedCount / totalResolvable : 0,
    witnessCharge: state.witness.charge,
    witnessMax: state.witness.max,
    confirms: state.witness.confirms,
    closureRestorations,
    contradictionPeak,
    contradictionFinal: last?.contradictionCount ?? 0,
    breachStep,
    phase: state.phase.kind,
  };
}

// Points for the resolved-curve hero graph. X is the ledger step index;
// Y is the fraction `resolvedCount / totalResolvable` in [0, 1]. A
// synthetic step-0 point at Y=0 is prepended so the curve starts at the
// floor rather than mid-air on the first entry — the graph reads as
// "from nothing" without the consumer having to fake one. Returns an
// empty array for an empty ledger so the UI can decide whether to
// render at all.
export interface ResolvedCurvePoint {
  readonly step: number;
  readonly fraction: number;
}

export function resolvedCurvePoints(
  state: GameState,
): ReadonlyArray<ResolvedCurvePoint> {
  const ledger = state.runHistory;
  if (ledger.length === 0) return [];
  const out: ResolvedCurvePoint[] = [{ step: 0, fraction: 0 }];
  for (const e of ledger) {
    const denom = e.totalResolvable > 0 ? e.totalResolvable : 1;
    out.push({ step: e.step, fraction: e.resolvedCount / denom });
  }
  return out;
}

export type { RunLedgerEntry };
