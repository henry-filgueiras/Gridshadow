import { tallyTiles, witnessStatus } from '../engine';
import type { GameState } from '../types';

interface HUDProps {
  state: GameState;
  onReseed: (seed: number) => void;
}

export function HUD({ state, onReseed }: HUDProps) {
  const { config } = state.board;
  const tally = tallyTiles(state);
  const breach = state.phase.kind === 'breached' ? state.phase.at : null;
  const wStatus = witnessStatus(state);
  const { charge, max } = state.witness;

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
              state.phase.kind === 'breached' ? 'hud-value-breach' : ''
            }`}
          >
            {state.phase.kind}
          </span>
        </div>
      </div>

      <div className="hud-hint">
        <div>left-click — resolve (costs 1 charge)</div>
        <div>right-click — flag (free)</div>
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
