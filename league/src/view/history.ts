/* Undo/redo for ViewSpec edits, as a hook. */
import { useCallback, useMemo, useRef, useState } from "react";
import { specEquals, type ViewSpec } from "./spec";

export function useSpecHistory(initial: ViewSpec, max = 50) {
  const [spec, setSpecState] = useState<ViewSpec>(initial);
  const past = useRef<ViewSpec[]>([]), future = useRef<ViewSpec[]>([]);
  const [, tick] = useState(0);
  const set = useCallback((next: ViewSpec | ((s: ViewSpec) => ViewSpec), opts: { record?: boolean } = {}) => {
    setSpecState(cur => {
      const n = typeof next === "function" ? next(cur) : next;
      if (specEquals(n, cur)) return cur;
      if (opts.record !== false) { past.current.push(cur); if (past.current.length > max) past.current.shift(); future.current = []; }
      return n;
    });
    tick(t => t + 1);
  }, [max]);
  const undo = useCallback(() => { const p = past.current.pop(); if (!p) return; setSpecState(cur => { future.current.push(cur); return p; }); tick(t => t + 1); }, []);
  const redo = useCallback(() => { const f = future.current.pop(); if (!f) return; setSpecState(cur => { past.current.push(cur); return f; }); tick(t => t + 1); }, []);
  const reset = useCallback((s: ViewSpec) => { past.current = []; future.current = []; setSpecState(s); tick(t => t + 1); }, []);
  return useMemo(() => ({ spec, set, undo, redo, reset, canUndo: past.current.length > 0, canRedo: future.current.length > 0 }), [spec, set, undo, redo, reset]);
}
