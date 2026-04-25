import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Application } from 'pixi.js';
import {
  createGameState,
  detectContradictions,
  protectedTally,
  reduceGame,
} from '../engine';
import { BoardRenderer } from '../render';
import type { BoardConfig, Coord, ProbeOrientation } from '../types';
import { HUD } from './HUD';

// Protected Constraints v1 experiment: bumped the default field to 24×24
// with 99 hazards (~17% density) so there's enough ambiguity for the
// occlusion mechanic to bite, and pulled the starting witness budget to 18
// — tighter-than-proportional pressure relative to the old 16×16/40/12
// baseline, because the experiment is specifically about whether the
// player prefers to infer around hidden truths or pay to see them.
const INITIAL_CONFIG: BoardConfig = {
  width: 24,
  height: 24,
  mineCount: 99,
  seed: 1,
  witnessCharges: 18,
};

export function GameView() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<BoardRenderer | null>(null);
  const [state, dispatch] = useReducer(
    reduceGame,
    INITIAL_CONFIG,
    createGameState,
  );

  // Probe mode is a pure UI concern — engine state is unchanged by toggling,
  // so a replay keyed off the action log is untouched. Probe mode only
  // rewires how a left-click on an unresolved tile is translated into an
  // action: in probe mode it becomes `probe`, otherwise `reveal`.
  const [probeMode, setProbeMode] = useState<ProbeOrientation | null>(null);
  const probeModeRef = useRef<ProbeOrientation | null>(null);
  useEffect(() => {
    probeModeRef.current = probeMode;
  }, [probeMode]);

  // Which probe-history entry is currently being hovered in the HUD. Pure UI
  // state: the engine already owns the ledger (deterministic), this is only
  // "which row is the cursor over right now?". We clamp to the current
  // history length so a regen (which resets probeHistory to []) cannot leave
  // a dangling index pointing at an entry that no longer exists.
  const [hoveredHistoryIndex, setHoveredHistoryIndex] = useState<number | null>(
    null,
  );
  const historyLen = state.probeHistory.length;
  useEffect(() => {
    if (hoveredHistoryIndex !== null && hoveredHistoryIndex >= historyLen) {
      setHoveredHistoryIndex(null);
    }
  }, [historyLen, hoveredHistoryIndex]);

  const historyHighlight: ReadonlyArray<Coord> | null = useMemo(() => {
    if (hoveredHistoryIndex === null) return null;
    return state.probeHistory[hoveredHistoryIndex]?.cells ?? null;
  }, [hoveredHistoryIndex, state.probeHistory]);

  // Contradiction detection is a pure derivation over engine state — HUD
  // readout and renderer halos both consume this single source. Memoized on
  // the tiles array so flag/reveal changes invalidate, but cursor/hover
  // updates don't re-scan. The renderer wants an O(1)-lookup set of
  // row-major indices; the HUD wants the count.
  const contradictions = useMemo(
    () => detectContradictions(state),
    [state],
  );
  const contradictionSet = useMemo(() => {
    if (contradictions.length === 0) return null;
    const w = state.board.config.width;
    const s = new Set<number>();
    for (const c of contradictions) s.add(c.at.y * w + c.at.x);
    return s;
  }, [contradictions, state.board.config.width]);

  // Protected Constraints v1 tally — surfaces the actionable "occluded"
  // count to the HUD. Memo keyed on state so flag/reveal/unveil changes
  // invalidate but hover/cursor do not.
  const protected_ = useMemo(() => protectedTally(state), [state]);

  // Probe mode auto-exits on terminal phase so the HUD indicator can't
  // persist past a run ending. Reseed enters active again with probe mode
  // already null.
  useEffect(() => {
    if (state.phase.kind !== 'active' && probeMode !== null) {
      setProbeMode(null);
    }
  }, [state.phase.kind, probeMode]);

  // Keyboard: H / V toggle the corresponding orientation (pressing the same
  // key twice exits). Escape always exits. Ignored while focus is inside a
  // focusable interactive element — today only the reseed button, but
  // future text fields will get the same behavior for free.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setProbeMode((m) => (m === 'horizontal' ? null : 'horizontal'));
      } else if (e.key === 'v' || e.key === 'V') {
        setProbeMode((m) => (m === 'vertical' ? null : 'vertical'));
      } else if (e.key === 'Escape') {
        setProbeMode(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Pixi v8 init is async. StrictMode double-invokes this effect, so the
    // first cleanup can fire *before* the first init resolves. We must not
    // call Application.destroy() on an uninitialized app (it touches fields
    // populated only by init()). Track whether init completed and only
    // destroy then; if cancellation lands mid-init, tear down inside the
    // async path once init resolves.
    let cancelled = false;
    let app: Application | null = null;
    let renderer: BoardRenderer | null = null;

    (async () => {
      const instance = new Application();
      try {
        await instance.init({
          resizeTo: host,
          background: '#060b10',
          antialias: true,
          autoDensity: true,
          resolution: window.devicePixelRatio || 1,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('pixi init failed', err);
        return;
      }

      if (cancelled) {
        instance.destroy(true, { children: true });
        return;
      }

      host.appendChild(instance.canvas);
      const r = new BoardRenderer(instance, {
        onHover: (x, y) => dispatch({ type: 'hover', x, y }),
        onHoverClear: () => dispatch({ type: 'hoverClear' }),
        onReveal: (x, y) => {
          // Left-click on an unresolved tile. In probe mode this becomes a
          // structural scan; the engine validates target-must-be-unresolved
          // and segment-ambiguity rules, so the UI does not duplicate them.
          const mode = probeModeRef.current;
          if (mode) {
            dispatch({ type: 'probe', x, y, orientation: mode });
          } else {
            dispatch({ type: 'reveal', x, y });
          }
        },
        onFlag: (x, y) => dispatch({ type: 'flag', x, y }),
        // Middle-click keeps its ritual-confirm semantics even in probe
        // mode: the mode only rewires left-click, because confirming a
        // resolved numbered tile is a different instrument than probing.
        onConfirm: (x, y) => dispatch({ type: 'confirm', x, y }),
        // Protected Constraints v1: left-click on a resolved, protected,
        // not-yet-unveiled tile routes here. Probe mode does *not*
        // preempt — each tile state has its own click routing, and an
        // armed probe refuses resolved targets anyway. If we preempted,
        // an operator staying in probe mode would be unable to unveil
        // without disarming every single time.
        onUnveil: (x, y) => dispatch({ type: 'unveil', x, y }),
      });

      app = instance;
      renderer = r;
      rendererRef.current = r;

      r.render(state, {
        probeMode: probeModeRef.current,
        historyHighlight: null,
        contradictions: contradictionSet,
      });
    })();

    return () => {
      cancelled = true;
      renderer?.destroy();
      renderer = null;
      app?.destroy(true, { children: true });
      app = null;
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    rendererRef.current?.render(state, {
      probeMode,
      historyHighlight,
      contradictions: contradictionSet,
    });
  }, [state, probeMode, historyHighlight, contradictionSet]);

  return (
    <div className="game-view">
      <div
        ref={hostRef}
        className="board-host"
        // Suppress the browser context menu so right-click can flag instead.
        onContextMenu={(e) => e.preventDefault()}
      />
      <HUD
        state={state}
        probeMode={probeMode}
        hoveredHistoryIndex={hoveredHistoryIndex}
        onHistoryHover={setHoveredHistoryIndex}
        contradictionCount={contradictions.length}
        occludedCount={protected_.occluded}
        onReseed={(seed) => dispatch({ type: 'regen', seed })}
        // Mobile Playability v1: explicit toggle behavior matches the H/V
        // keyboard contract — re-arming the same orientation disarms.
        // Terminal phases short-circuit (no probe arming once breached or
        // cleared) so the buttons can't strand the HUD in a misleading
        // armed state when the field is no longer interactive.
        onArmProbe={(orientation) => {
          if (state.phase.kind !== 'active') return;
          setProbeMode((m) => (m === orientation ? null : orientation));
        }}
        onCancelProbe={() => setProbeMode(null)}
      />
    </div>
  );
}
