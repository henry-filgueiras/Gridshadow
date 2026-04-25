import { useMemo } from 'react';
import type { GameState } from '../types';
import { resolvedCurvePoints, runSummary } from '../engine';

// Run Summary v1 — post-run forensic panel. The brief: "forensic, not
// casino UI". No medals, no score. One hero graph (resolved % over
// step count), a compact stat block, and a breach/cleared banner at the
// top. Rendered only at terminal phase — during an active run this
// panel is absent so the live HUD is the focus.
//
// The graph is inline SVG. No chart library: one <polyline>, two
// framing lines, one gridline at 50%. Hand-sized so a phone viewport
// renders without fuss. We compute path geometry in a `useMemo` keyed
// on the ledger so scrolling or unrelated re-renders don't recompute.

interface RunSummaryProps {
  state: GameState;
}

// Graph canvas size in SVG user units. Width carries the time axis, so
// it's the larger dimension; height is generous enough that a single
// pixel of stroke still reads at small render sizes. viewBox lets the
// browser rescale the whole drawing to whatever CSS width the HUD has.
const GRAPH_W = 300;
const GRAPH_H = 120;
const PAD_L = 28;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 18;
const PLOT_W = GRAPH_W - PAD_L - PAD_R;
const PLOT_H = GRAPH_H - PAD_T - PAD_B;

export function RunSummary({ state }: RunSummaryProps) {
  const summary = useMemo(() => runSummary(state), [state]);
  const points = useMemo(() => resolvedCurvePoints(state), [state]);

  const path = useMemo(() => {
    if (points.length === 0) return '';
    const lastStep = points[points.length - 1]!.step;
    const denomX = lastStep > 0 ? lastStep : 1;
    return points
      .map((p, i) => {
        const x = PAD_L + (p.step / denomX) * PLOT_W;
        const y = PAD_T + (1 - p.fraction) * PLOT_H;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [points]);

  const lastPoint = points.length > 0 ? points[points.length - 1]! : null;
  const lastStep = lastPoint ? lastPoint.step : 0;

  const pctText = `${Math.round(summary.resolvedPct * 100)}%`;
  const kindLabel =
    summary.phase === 'cleared'
      ? 'field stabilized'
      : summary.phase === 'breached'
      ? 'breach'
      : 'run in progress';

  return (
    <div
      className={`run-summary run-summary-${summary.phase}`}
      role="status"
      aria-label="run summary"
    >
      <div className="run-summary-head">
        <div className="run-summary-title">run summary</div>
        <div className="run-summary-kind">{kindLabel}</div>
      </div>

      <div className="run-summary-hero">
        <div className="run-summary-hero-pct">{pctText}</div>
        <div className="run-summary-hero-label">resolved</div>
      </div>

      {points.length > 0 ? (
        <svg
          className="run-summary-graph"
          viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
          role="img"
          aria-label={`resolved curve over ${lastStep} action steps`}
          preserveAspectRatio="none"
        >
          {/* Frame: baseline (0%) and ceiling (100%) on the left gutter.
              Single subtle gridline at 50% for quick read. */}
          <line
            x1={PAD_L}
            y1={PAD_T + PLOT_H}
            x2={GRAPH_W - PAD_R}
            y2={PAD_T + PLOT_H}
            className="run-summary-graph-axis"
          />
          <line
            x1={PAD_L}
            y1={PAD_T}
            x2={PAD_L}
            y2={PAD_T + PLOT_H}
            className="run-summary-graph-axis"
          />
          <line
            x1={PAD_L}
            y1={PAD_T + PLOT_H / 2}
            x2={GRAPH_W - PAD_R}
            y2={PAD_T + PLOT_H / 2}
            className="run-summary-graph-grid"
          />

          {/* Y-axis labels — minimal: 0%, 50%, 100%. */}
          <text
            x={PAD_L - 4}
            y={PAD_T + 4}
            className="run-summary-graph-ylabel"
            textAnchor="end"
          >
            100%
          </text>
          <text
            x={PAD_L - 4}
            y={PAD_T + PLOT_H / 2 + 3}
            className="run-summary-graph-ylabel"
            textAnchor="end"
          >
            50%
          </text>
          <text
            x={PAD_L - 4}
            y={PAD_T + PLOT_H + 3}
            className="run-summary-graph-ylabel"
            textAnchor="end"
          >
            0%
          </text>

          {/* X-axis labels — first and last step only. The ledger is
              intentionally step-indexed, not time-indexed; no need to
              dress this up as a wall clock. */}
          <text
            x={PAD_L}
            y={GRAPH_H - 4}
            className="run-summary-graph-xlabel"
            textAnchor="start"
          >
            0
          </text>
          <text
            x={GRAPH_W - PAD_R}
            y={GRAPH_H - 4}
            className="run-summary-graph-xlabel"
            textAnchor="end"
          >
            {lastStep}
          </text>
          <text
            x={PAD_L + PLOT_W / 2}
            y={GRAPH_H - 4}
            className="run-summary-graph-xlabel"
            textAnchor="middle"
          >
            step
          </text>

          <path
            d={path}
            fill="none"
            className={`run-summary-graph-curve run-summary-graph-curve-${summary.phase}`}
          />
        </svg>
      ) : (
        <div className="run-summary-graph-empty">no actions recorded</div>
      )}

      <div className="run-summary-stats">
        <Stat
          label="resolved"
          value={`${summary.resolvedCount} / ${summary.totalResolvable}`}
        />
        <Stat label="steps" value={summary.steps} />
        <Stat label="probes" value={summary.action.probe} />
        <Stat label="confirms" value={summary.confirms} />
        <Stat label="unveils" value={summary.action.unveil} />
        <Stat
          label="closure +charge"
          value={summary.closureRestorations}
        />
        <Stat
          label="contradiction peak"
          value={summary.contradictionPeak}
        />
        <Stat
          label="final charge"
          value={`${summary.witnessCharge} / ${summary.witnessMax}`}
        />
        {summary.breachStep !== null && (
          <Stat label="breach at step" value={summary.breachStep} />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="run-summary-stat">
      <span className="run-summary-stat-label">{label}</span>
      <span className="run-summary-stat-value">{value}</span>
    </div>
  );
}
