import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { GameState } from '../types';
import {
  resolvedCurvePoints,
  runSummary,
  runTracePoints,
} from '../engine';

// Run Summary v1 + Trace Overlay v1 — post-run forensic panel. Brief
// remains "forensic, not casino UI": no medals, no score. The hero is
// still the resolved-% curve over action-step count, but it now carries
// trace overlays (witness-charge line, breach marker, contradiction
// dots, probe / unveil / closure baseline pips), a hover/tap step
// inspector, and a copy-trace clipboard button. All overlays are pure
// derivations of `state.runHistory`; the engine boundary is preserved.

interface RunSummaryProps {
  state: GameState;
}

// Graph canvas size in SVG user units. Width carries the time axis, so
// it's the larger dimension; height is generous enough that a single
// pixel of stroke still reads at small render sizes. viewBox lets the
// browser rescale the whole drawing to whatever CSS width the HUD has.
// PAD_B is bumped from the v1 layout to make room for three pip lanes
// (closure / unveil / probe) sitting between the plot baseline and the
// X-axis labels.
const GRAPH_W = 320;
const GRAPH_H = 138;
const PAD_L = 28;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 32;
const PLOT_W = GRAPH_W - PAD_L - PAD_R;
const PLOT_H = GRAPH_H - PAD_T - PAD_B;

// Pip lane offsets below the plot baseline. Three lanes, 4px each, with
// a 1px gutter — keeps each event channel readable without crowding.
const PIP_LANE_CLOSURE = PAD_T + PLOT_H + 2;
const PIP_LANE_UNVEIL = PAD_T + PLOT_H + 8;
const PIP_LANE_PROBE = PAD_T + PLOT_H + 14;
const PIP_HEIGHT = 4;

// Tooltip dimensions. We render the tooltip inside the SVG as a
// translated <g> so it scales with the graph and doesn't need DOM
// measurement. Width is generous enough to fit the longest line
// ("contradictions: NN") without truncation at the smallest viewport.
const TIP_W = 124;
const TIP_H = 64;

export function RunSummary({ state }: RunSummaryProps) {
  const summary = useMemo(() => runSummary(state), [state]);
  const points = useMemo(() => resolvedCurvePoints(state), [state]);
  const trace = useMemo(() => runTracePoints(state), [state]);

  const lastPoint = points.length > 0 ? points[points.length - 1]! : null;
  const lastStep = lastPoint ? lastPoint.step : 0;
  const denomX = lastStep > 0 ? lastStep : 1;

  // Resolved curve path. Preserved verbatim from v1 — overlays are
  // additive, the existing line is the anchor.
  const resolvedPath = useMemo(() => {
    if (points.length === 0) return '';
    return points
      .map((p, i) => {
        const x = PAD_L + (p.step / denomX) * PLOT_W;
        const y = PAD_T + (1 - p.fraction) * PLOT_H;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [points, denomX]);

  // Witness-charge polyline. Same step axis as the resolved curve;
  // Y maps charge / max into [0, 1]. Rendered with a paler dashed
  // stroke so the eye reads it as a secondary trace, not a competing
  // primary signal.
  const chargePath = useMemo(() => {
    if (trace.chargePoints.length === 0) return '';
    return trace.chargePoints
      .map((p, i) => {
        const x = PAD_L + (p.step / denomX) * PLOT_W;
        const y = PAD_T + (1 - p.fraction) * PLOT_H;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [trace.chargePoints, denomX]);

  // Step → (x, y on resolved curve) lookup, for placing contradiction
  // dots at the right point along the curve. resolvedCurvePoints
  // prepends a synthetic step 0; we skip that by indexing into the
  // ledger directly.
  const stepToCurveY = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of points) {
      const y = PAD_T + (1 - p.fraction) * PLOT_H;
      map.set(p.step, y);
    }
    return map;
  }, [points]);

  // --- Step inspector (scrubber) ------------------------------------
  // UI-only state. Engine determinism is unaffected — the same action
  // log produces the same ledger regardless of which step the player
  // hovered. Mirrors the discipline already used by `historyHighlight`
  // in GameView.
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);
  const overlayRef = useRef<SVGRectElement | null>(null);

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<SVGRectElement>) => {
      if (lastStep === 0) return;
      const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
      if (rect.width === 0) return;
      const px = ((e.clientX - rect.left) / rect.width) * PLOT_W;
      // Snap to the nearest integer step in [1, lastStep]. Every step in
      // that range exists as a ledger entry by construction, so a clamp
      // is enough — no missing-entry case to handle.
      const raw = Math.round((px / PLOT_W) * lastStep);
      const clamped = Math.max(1, Math.min(lastStep, raw));
      setHoveredStep(clamped);
    },
    [lastStep],
  );

  const handlePointerLeave = useCallback(() => {
    setHoveredStep(null);
  }, []);

  const hoveredEntry =
    hoveredStep !== null && hoveredStep >= 1 && hoveredStep <= state.runHistory.length
      ? state.runHistory[hoveredStep - 1]!
      : null;

  // --- Copy trace --------------------------------------------------
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'err'>('idle');
  const copyTimer = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    };
  }, []);

  const handleCopyTrace = useCallback(async () => {
    const trace = {
      schemaVersion: 1,
      seed: state.board.config.seed,
      config: {
        width: state.board.config.width,
        height: state.board.config.height,
        mineCount: state.board.config.mineCount,
        witnessCharges: state.board.config.witnessCharges,
      },
      ledger: state.runHistory,
      summary,
    };
    const json = JSON.stringify(trace, null, 2);
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(json);
        setCopyState('ok');
      } else {
        throw new Error('clipboard unavailable');
      }
    } catch {
      setCopyState('err');
    }
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => {
      setCopyState('idle');
      copyTimer.current = null;
    }, 1800);
  }, [state, summary]);

  const pctText = `${Math.round(summary.resolvedPct * 100)}%`;
  const kindLabel =
    summary.phase === 'cleared'
      ? 'field stabilized'
      : summary.phase === 'breached'
        ? 'breach'
        : 'run in progress';

  const breachStep = trace.breachStep;
  const breachX =
    breachStep !== null
      ? PAD_L + (breachStep / denomX) * PLOT_W
      : null;

  // Scrubber tooltip x — clamp so the box never spills past plot edges.
  const tipAnchorX =
    hoveredStep !== null
      ? PAD_L + (hoveredStep / denomX) * PLOT_W
      : null;
  const tipX =
    tipAnchorX !== null
      ? Math.min(
          GRAPH_W - PAD_R - TIP_W,
          Math.max(PAD_L, tipAnchorX - TIP_W / 2),
        )
      : null;

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

          {/* Charge line — drawn beneath the resolved curve so the
              primary signal still wins the foreground. */}
          {chargePath && (
            <path
              d={chargePath}
              fill="none"
              className="run-summary-graph-charge"
            />
          )}

          {/* Resolved curve — the hero. */}
          <path
            d={resolvedPath}
            fill="none"
            className={`run-summary-graph-curve run-summary-graph-curve-${summary.phase}`}
          />

          {/* Contradiction dots: rising-edge markers along the resolved
              curve. Plotted at each step where contradictionCount went
              up from the prior entry. */}
          {trace.contradictionSteps.map((step) => {
            const cx = PAD_L + (step / denomX) * PLOT_W;
            const cy = stepToCurveY.get(step) ?? PAD_T + PLOT_H;
            return (
              <circle
                key={`contra-${step}`}
                cx={cx}
                cy={cy}
                r={2.4}
                className="run-summary-graph-contradiction"
              />
            );
          })}

          {/* Breach marker: vertical rule at breach step, a tiny ✕ at
              the top. Only on breached runs. */}
          {breachStep !== null && breachX !== null && (
            <g className="run-summary-graph-breach">
              <line
                x1={breachX}
                y1={PAD_T}
                x2={breachX}
                y2={PAD_T + PLOT_H}
                className="run-summary-graph-breach-line"
              />
              <text
                x={breachX}
                y={PAD_T - 1}
                className="run-summary-graph-breach-glyph"
                textAnchor="middle"
              >
                ✕
              </text>
            </g>
          )}

          {/* Baseline pip lanes — one row per event kind. Stacked just
              under the plot baseline. */}
          {trace.closureSteps.map((step) => {
            const x = PAD_L + (step / denomX) * PLOT_W;
            return (
              <line
                key={`closure-${step}`}
                x1={x}
                y1={PIP_LANE_CLOSURE}
                x2={x}
                y2={PIP_LANE_CLOSURE + PIP_HEIGHT}
                className="run-summary-graph-pip-closure"
              />
            );
          })}
          {trace.unveilSteps.map((step) => {
            const x = PAD_L + (step / denomX) * PLOT_W;
            return (
              <line
                key={`unveil-${step}`}
                x1={x}
                y1={PIP_LANE_UNVEIL}
                x2={x}
                y2={PIP_LANE_UNVEIL + PIP_HEIGHT}
                className="run-summary-graph-pip-unveil"
              />
            );
          })}
          {trace.probeSteps.map((step) => {
            const x = PAD_L + (step / denomX) * PLOT_W;
            return (
              <line
                key={`probe-${step}`}
                x1={x}
                y1={PIP_LANE_PROBE}
                x2={x}
                y2={PIP_LANE_PROBE + PIP_HEIGHT}
                className="run-summary-graph-pip-probe"
              />
            );
          })}

          {/* Scrubber overlay — captures pointer events for the inspector.
              Transparent rectangle over the plot region (and the pip lanes,
              so a finger on the bottom edge of the graph still scrubs).
              Placed last so it sits on top of every other graph element. */}
          <rect
            ref={overlayRef}
            x={PAD_L}
            y={PAD_T}
            width={PLOT_W}
            height={PLOT_H + PAD_B - 8}
            className="run-summary-graph-overlay"
            onPointerMove={handlePointerMove}
            onPointerEnter={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            onPointerDown={handlePointerMove}
          />

          {/* Hover guide and tooltip — rendered last so they sit on top
              of the overlay rect and every trace. */}
          {hoveredStep !== null && tipAnchorX !== null && hoveredEntry && (
            <g className="run-summary-graph-scrub" pointerEvents="none">
              <line
                x1={tipAnchorX}
                y1={PAD_T}
                x2={tipAnchorX}
                y2={PAD_T + PLOT_H}
                className="run-summary-graph-scrub-guide"
              />
              <g transform={`translate(${tipX}, ${PAD_T + 2})`}>
                <rect
                  x={0}
                  y={0}
                  width={TIP_W}
                  height={TIP_H}
                  rx={2}
                  ry={2}
                  className="run-summary-graph-scrub-bg"
                />
                <text
                  x={6}
                  y={12}
                  className="run-summary-graph-scrub-step"
                >
                  step {hoveredEntry.step} · {hoveredEntry.action}
                </text>
                <text
                  x={6}
                  y={26}
                  className="run-summary-graph-scrub-line"
                >
                  resolved {Math.round(
                    (hoveredEntry.resolvedCount /
                      Math.max(1, hoveredEntry.totalResolvable)) *
                      100,
                  )}%
                </text>
                <text
                  x={6}
                  y={38}
                  className="run-summary-graph-scrub-line"
                >
                  charge {hoveredEntry.witnessCharge}/{summary.witnessMax}
                </text>
                <text
                  x={6}
                  y={50}
                  className="run-summary-graph-scrub-line"
                >
                  contradictions {hoveredEntry.contradictionCount}
                </text>
                <text
                  x={6}
                  y={60}
                  className="run-summary-graph-scrub-meta"
                >
                  phase {hoveredEntry.phase}
                </text>
              </g>
            </g>
          )}
        </svg>
      ) : (
        <div className="run-summary-graph-empty">no actions recorded</div>
      )}

      {/* Trace legend — one row, terse. Surfaces what the new overlays
          mean without pretending to be a chart toolkit. */}
      {points.length > 0 && (
        <div className="run-summary-legend" aria-hidden>
          <span className="run-summary-legend-item run-summary-legend-resolved">
            resolved
          </span>
          <span className="run-summary-legend-item run-summary-legend-charge">
            charge
          </span>
          <span className="run-summary-legend-item run-summary-legend-contra">
            ● contradiction
          </span>
          <span className="run-summary-legend-item run-summary-legend-closure">
            | closure
          </span>
          <span className="run-summary-legend-item run-summary-legend-unveil">
            | unveil
          </span>
          <span className="run-summary-legend-item run-summary-legend-probe">
            | probe
          </span>
        </div>
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

      <button
        type="button"
        className={`run-summary-copy run-summary-copy-${copyState}`}
        onClick={handleCopyTrace}
        disabled={state.runHistory.length === 0}
      >
        {copyState === 'ok'
          ? 'trace copied'
          : copyState === 'err'
            ? 'copy failed'
            : 'copy trace'}
      </button>
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
