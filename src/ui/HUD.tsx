import {
  PROBE_TUNABLES,
  PROTECTED_TUNABLES,
  tallyTiles,
  witnessStatus,
} from '../engine';
import type { GameState, ProbeOrientation } from '../types';
import { RunSummary } from './RunSummary';

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
  // Mobile Playability v1: explicit probe-arm controls. Mobile has no
  // keyboard; these visible buttons (also usable on desktop) toggle the
  // same probe-mode state the H / V keys drive. Toggling the same
  // orientation again disarms — matches the keyboard contract exactly.
  onArmProbe: (orientation: ProbeOrientation) => void;
  onCancelProbe: () => void;
}

const ORIENTATION_GLYPH: Record<ProbeOrientation, string> = {
  horizontal: '↔',
  vertical: '↕',
};

export function HUD({
  state,
  probeMode,
  hoveredHistoryIndex,
  onHistoryHover,
  contradictionCount,
  occludedCount,
  onReseed,
  onArmProbe,
  onCancelProbe,
}: HUDProps) {
  const { config } = state.board;
  const tally = tallyTiles(state);
  const breach = state.phase.kind === 'breached' ? state.phase.at : null;
  const terminal = state.phase.kind !== 'active';
  const wStatus = witnessStatus(state);
  const { charge, max, confirms } = state.witness;
  const { probeHistory } = state;

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

      {/* Run Summary — forensic replacement for the bare "cleared" banner
          at terminal phase. Breach keeps the red "detonation at x,y"
          banner above so the immediate cause stays visible; the summary
          panel sits beneath it carrying the *story* of the run. Active
          runs render no summary — live HUD owns the screen. */}
      {terminal && <RunSummary state={state} />}

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
        <div className="hud-probe-actions" role="group" aria-label="witness probe controls">
          <button
            type="button"
            className={`hud-probe-action ${
              probeMode === 'horizontal' ? 'hud-probe-action-on' : ''
            }`}
            aria-pressed={probeMode === 'horizontal'}
            onClick={() => onArmProbe('horizontal')}
          >
            <span className="hud-probe-glyph">{ORIENTATION_GLYPH.horizontal}</span>
            H
          </button>
          <button
            type="button"
            className={`hud-probe-action ${
              probeMode === 'vertical' ? 'hud-probe-action-on' : ''
            }`}
            aria-pressed={probeMode === 'vertical'}
            onClick={() => onArmProbe('vertical')}
          >
            <span className="hud-probe-glyph">{ORIENTATION_GLYPH.vertical}</span>
            V
          </button>
          <button
            type="button"
            className="hud-probe-action hud-probe-action-cancel"
            onClick={onCancelProbe}
            disabled={probeMode === null}
            aria-label="cancel probe mode"
          >
            esc
          </button>
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
        <div>tap / left-click unresolved — resolve (costs 1 charge)</div>
        <div>long-press / right-click — flag (free)</div>
        <div>tap a numbered tile — confirm (when flags match)</div>
        <div>fully stabilizing a constraint restores +1 charge</div>
        <div>
          probe buttons (or h / v) — arm horizontal / vertical probe (costs{' '}
          {PROBE_TUNABLES.cost} charge)
        </div>
        <div>esc / cancel button — disarm probe</div>
        <div>red halo — local constraint proven impossible</div>
        <div>
          sealed tile (◈) — safe but value hidden; tap to unveil (costs{' '}
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
