import { tallyTiles } from '../engine';
import type { GameState } from '../types';

interface HUDProps {
  state: GameState;
  onReseed: (seed: number) => void;
}

export function HUD({ state, onReseed }: HUDProps) {
  const { config } = state.board;
  const tally = tallyTiles(state);
  const breach = state.phase.kind === 'breached' ? state.phase.at : null;

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
        <div>left-click — resolve</div>
        <div>right-click — flag</div>
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
