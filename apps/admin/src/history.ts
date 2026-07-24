import { useRef, useState } from "react";
import type { Element } from "@abbiss/preview-engine";

/**
 * Undo/redo history for the element list (spec 07 §6.7). Discrete actions go through
 * `commit` (optionally coalescing a burst of edits under the same key, so typing or
 * dragging a slider is one undo step); continuous canvas gestures call `snapshot` once
 * at the start and then `set` live. A full stack, capped so memory stays bounded.
 */
export function useHistory(initial: Element[]) {
  const [elements, setEls] = useState<Element[]>(initial);
  const ref = useRef<Element[]>(initial);
  const past = useRef<Element[][]>([]);
  const future = useRef<Element[][]>([]);
  const lastKey = useRef<{ key: string; t: number } | null>(null);
  const [, force] = useState(0);
  const bump = () => force((x) => x + 1);

  const apply = (val: Element[]) => { ref.current = val; setEls(val); };

  /** Live update with no history entry (used during a drag/resize gesture). */
  const set = (updater: Element[] | ((prev: Element[]) => Element[])) => {
    const v = typeof updater === "function" ? (updater as (p: Element[]) => Element[])(ref.current) : updater;
    apply(v);
  };

  /** Record the current state as an undo point. Same key within 800ms coalesces. */
  const snapshot = (key?: string) => {
    const now = Date.now();
    if (key && lastKey.current && lastKey.current.key === key && now - lastKey.current.t < 800) {
      lastKey.current.t = now;
      return;
    }
    past.current = [...past.current, ref.current].slice(-100);
    future.current = [];
    lastKey.current = key ? { key, t: now } : null;
    bump();
  };

  /** Snapshot + apply, for discrete actions. */
  const commit = (updater: Element[] | ((prev: Element[]) => Element[]), key?: string) => {
    snapshot(key);
    set(updater);
  };

  const undo = () => {
    if (!past.current.length) return;
    const prev = past.current[past.current.length - 1];
    past.current = past.current.slice(0, -1);
    future.current = [ref.current, ...future.current];
    lastKey.current = null;
    apply(prev);
    bump();
  };
  const redo = () => {
    if (!future.current.length) return;
    const next = future.current[0];
    future.current = future.current.slice(1);
    past.current = [...past.current, ref.current];
    lastKey.current = null;
    apply(next);
    bump();
  };

  /** Load a fresh document, clearing history. */
  const reset = (val: Element[]) => {
    past.current = []; future.current = []; lastKey.current = null;
    apply(val);
    bump();
  };

  return {
    elements, ref, set, commit, snapshot, undo, redo, reset,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
