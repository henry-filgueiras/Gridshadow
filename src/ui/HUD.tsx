import { useEffect, useRef, useState } from 'react';
import {
  PROBE_TUNABLES,
  PROTECTED_TUNABLES,
  tallyTiles,
  witnessStatus,
} from '../engine';
import type { GameState, ProbeOrientation } from '../types';

interface HUDProps {
  state: GameState;
  probeMode: ProbeOrientation | null;
  hoveredHistoryIndex: number | null;
  onHistoryHover: (index: number | null) => void;
  // Current-state contradiction count, derived once in GameView from the
  // engine's `detectContradictions` selector and passed here so the HUD
  // does not duplicate the scan. Zero means no provable impossibility in
  // the revealed field; a positive count means that many resolved numbered
  // tiles carry a halo on the board.
  contradictionCount: number;
  // Protected Constraints v1: count of resolved, protected, not-yet-
  // unveiled tiles — the actionable number for the operator (each one
  // costs `PROTECTED_TUNABLES.unveilCost` charge to read). Surfaced in
  // the HUD so the player can plan their charge spend against both
  // unexplored field and occluded constraints without scanning the
  // board.
  occludedCount: number;
  onReseed: (seed: number) => void;
}

const ORIENTATION_GLYPH: Record<ProbeOrientation, string> = {
  horizontal: '↔',
  vertical: '↕',
};

const RESTORE_FLASH_MS = 1800;

export function HUD({
  state,
  probeMode,
  hoveredHistoryIndex,
  onHistoryHover,
  contradictionCount,
  occludedCount,
  onReseed,
}: HUDProps) {
  const { config } = state.board;
  const tally = tallyTiles(state);
  const breach = state.phase.kind === 'breached' ? state.phase.at : null;
  const cleared = state.phase.kind === 'cleared';
  const wStatus = witnessStatus(state);
  const { charge, max, confirms } = state.witness;
  const { probeHistory } = state;

  // Confidence-restoration flash. The engine's `witness.confirms` counter
  // increments monotonically on every successful safe Witness Confirmation.
  // We detect increments and surface a brief pill. The timer itself is
  // UI-ephemeral — engine state stays deterministic — and the ref-before-
  // effect-body update avoids double-firing under StrictMode.
  const prevConfirmsRef = useRef(confirms);
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    const prev = prevConfirmsRef.current;
    prevConfirmsRef.current = confirms;
    if (confirms > prev) {
      setFlashing(true);
      const id = window.setTimeout(() => setFlashing(false), RESTORE_FLASH_MS);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [confirms]);

  return (
    <div className="hud">
      <div className="hud-title">witness protocol</div>

      {breach && (
        <div className="hud-breach" role="status">
          <div className="hud-breach-label">breach</div>
          <div className="hud-breach-detail">
            detonation at {breach.x},{breach.y}
          </div>
        </div>
      )}

      {cleared && (
        <div className="hud-cleared" role="status">
          <div className="hud-cleared-label">field stabilized</div>
          <div className="hud-cleared-detail">witness protocol complete</div>
        </div>
      )}

      <div className={`hud-witness hud-witness-${wStatus}`}>
        <div className="hud-witness-head">
          <span className="hud-witness-label">witness charge</span>
          <span className="hud-witness-count">
            <span className="hud-witness-charge">{charge}</span>
            <span className="hud-witness-sep">/</span>
            <span className="hud-witness-max">{max}</span>
          </span>
        </div>
        <div className="hud-witness-meter" aria-hidden>
          <div
            className="hud-witness-meter-fill"
            style={{ width: max > 0 ? `${(charge / max) * 100}%` : '0%' }}
          />
        </div>
        <div className="hud-witness-note">
          {wStatus === 'exhausted'
            ? 'charge exhausted — inference only'
            : 'direct reveal cost: 1 charge'}
        </div>
        <div
          className={`hud-witness-restore ${
            flashing ? 'hud-witness-restore-on' : ''
          }`}
          role="status"
          aria-live="polite"
        >
          {flashing ? 'witness confirmed · integrity restored' : ''}
        </div>
      </div>

      <div className="hud-probe">
        <div className="hud-probe-head">
          <span className="hud-probe-label">witness probe</span>
          <span
            className={`hud-probe-mode ${
              probeMode ? 'hud-probe-mode-on' : ''
            }`}
            aria-live="polite"
          >
            {probeMode
              ? `${ORIENTATION_GLYPH[probeMode]} ${probeMode} armed`
              : 'idle'}
          </span>
        </div>
        <div className="hud-probe-note">
          structural scan · {PROBE_TUNABLES.length}-cell line · costs{' '}
          {PROBE_TUNABLES.cost} charge
        </div>
      </div>

      <div
        className="hud-history"
        onMouseLeave={() => onHistoryHover(null)}
      >
        <div className="hud-history-head">
          <span className="hud-history-label">witness probe history</span>
          <span className="hud-history-count">
            {probeHistory.length
              ? `${probeHistory.length}/${PROBE_TUNABLES.historyLimit}`
              : ''}
          </span>
        </div>
        {probeHistory.length === 0 ? (
          <div className="hud-history-empty">no probes logged</div>
        ) : (
          <ul className="hud-history-list" role="list">
            {probeHistory.map((reading, i) => {
              const isLatest = i === 0;
              const isHovered = hoveredHistoryIndex === i;
              return (
                <li
                  // eslint-disable-next-line react/no-array-index-key
                  key={i}
                  className={`hud-history-entry ${
                    isLatest ? 'hud-history-entry-latest' : ''
                  } ${isHovered ? 'hud-history-entry-hover' : ''}`}
                  onMouseEnter={() => onHistoryHover(i)}
                  onFocus={() => onHistoryHover(i)}
                  onBlur={() => onHistoryHover(null)}
                  tabIndex={0}
                >
                  <span className="hud-history-glyph">
                    {ORIENTATION_GLYPH[reading.orientation]}
                  </span>
                  <span className="hud-history-coord">
                    x:{reading.at.x} y:{reading.at.y}
                  </span>
                  <span className="hud-history-arrow">→</span>
                  <span className="hud-history-hazards">
                    {reading.hazardCount} haz
                  </span>
                  <span className="hud-history-cells">
                    {reading.cells.length}c
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="hud-history-note">hover an entry to re-scan</div>
      </div>

      <div className="hud-divider" />

      <div className="hud-section">
        <div className="hud-row">
          <span className="hud-label">seed</span>
          <span className="hud-value">{config.seed}</span>
        </div>
        <div className="hud-row">
          <span className="hud-label">field</span>
          <span className="hud-value">
            {config.width} × {config.height}
          </span>
        </div>
        <div className="hud-row">
          <span className="hud-label">hazards</span>
          <span className="hud-value">{config.mineCount}</span>
        </div>
      </div>

      <div className="hud-divider" />

      <div className="hud-section">
        <div className="hud-row">
          <span className="hud-label">resolved</span>
          <span className="hud-value">{tally.resolved}</span>
        </div>
        <div className="hud-row">
          <span className="hud-label">flagged</span>
          <span className="hud-value">{tally.flagged}</span>
        </div>
        <div className="hud-row">
          <span className="hud-label">unresolved</span>
          <span className="hud-value">{tally.unresolved}</span>
        </div>
        <div className="hud-row">
          <span className="hud-label">confirms</span>
          <span className="hud-value">{confirms}</span>
        </div>
        <div className="hud-row">
          <span className="hud-label">contradictions</span>
          <span
            className={`hud-value ${
              contradictionCount > 0 ? 'hud-value-contradiction' : ''
            }`}
            aria-live="polite"
          >
            {contradictionCount}
          </span>
        </div>
        <div className="hud-row">
          <span className="hud-label">occluded</span>
          <span
            className={`hud-value ${
              occludedCount > 0 ? 'hud-value-occluded' : ''
            }`}
          >
            {occludedCount}
          </span>
        </div>
      </div>

      <div className="hud-divider" />

      <div className="hud-section">
        <div className="hud-row">
          <span className="hud-label">cursor</span>
          <span className="hud-value">
            {state.cursor ? `${state.cursor.x},${state.cursor.y}` : '—'}
          </span>
        </div>
        <div className="hud-row">
          <span className="hud-label">phase</span>
          <span
            className={`hud-value ${
              state.phase.kind === 'breached'
                ? 'hud-value-breach'
                : state.phase.kind === 'cleared'
                ? 'hud-value-cleared'
                : ''
            }`}
          >
            {state.phase.kind === 'cleared' ? 'stabilized' : state.phase.kind}
          </span>
        </div>
      </div>

      <div className="hud-hint">
        <div>left-click unresolved — resolve (costs 1 charge)</div>
        <div>right-click — flag (free)</div>
        <div>click numbered tile — confirm (when flags match)</div>
        <div>successful confirm restores +1 charge</div>
        <div>
          h / v — arm horizontal / vertical probe (costs{' '}
          {PROBE_TUNABLES.cost} charge)
        </div>
        <div>esc — disarm probe</div>
        <div>red halo — local constraint proven impossible</div>
        <div>
          sealed tile (◈) — safe but value hidden; click to unveil (costs{' '}
          {PROTECTED_TUNABLES.unveilCost} charge)
        </div>
      </div>

      <button
        type="button"
        className="hud-button"
        onClick={() => onReseed(Math.floor(Math.random() * 0x7fffffff))}
      >
        reseed
      </button>
    </div>
  );
}
