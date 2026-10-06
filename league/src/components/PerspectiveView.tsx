import { useEffect, useRef } from "react";
import type { HTMLPerspectiveViewerElement, ViewerConfig, ViewerConfigUpdate } from "@perspective-dev/viewer";
import { getClient } from "../perspective/engine";

export type ThemeName = "Pro Light" | "Pro Dark";

interface Props {
  /** Name of a Table hosted on the shared client. null shows nothing. */
  tableName: string | null;
  /** Config to show. A new object identity re-applies it. */
  config: ViewerConfigUpdate | null;
  theme: ThemeName;
  onConfigChange?: (c: ViewerConfig) => void;
  onReady?: (el: HTMLPerspectiveViewerElement) => void;
  /** Called when a restore fails (bad column, bad expression) before the fallback to the table's defaults */
  onError?: (e: unknown) => void;
}

// The element is registered only once Perspective's WASM has initialised, so every method call waits for the upgrade.
const defined = () => customElements.whenDefined("perspective-viewer");

export function PerspectiveView({ tableName, config, theme, onConfigChange, onReady, onError }: Props) {
  const ref = useRef<HTMLPerspectiveViewerElement>(null);
  const cbRef = useRef(onConfigChange); cbRef.current = onConfigChange;
  const errRef = useRef(onError); errRef.current = onError;
  const loaded = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer = 0, gone = false;
    const onUpdate = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => el.save().then(c => cbRef.current?.(c)).catch(() => {}), 250);
    };
    loaded.current = (async () => {
      await defined();
      await el.load(getClient());
      if (!gone) { el.addEventListener("perspective-config-update", onUpdate); onReady?.(el); }
    })();
    loaded.current.catch(e => console.error("perspective viewer", e));
    return () => {
      gone = true;
      el.removeEventListener("perspective-config-update", onUpdate);
      clearTimeout(timer);
      if (typeof el.delete === "function") el.delete().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch table and/or config. restore() is field-wise, so presets are built as complete configs.
  useEffect(() => {
    const el = ref.current;
    if (!el || !tableName || !config) return;
    let live = true;
    (async () => {
      await loaded.current;
      if (!live) return;
      try { await el.restore({ ...config, table: tableName, theme }, { suppress_errors: true }); }
      catch (e) {
        errRef.current?.(e);
        console.warn("restore failed, falling back to the table's defaults", e);
        await el.restore({ table: tableName, theme }).catch(() => {});
        await el.reset(true).catch(() => {});
      }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName, config]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    loaded.current?.then(() => el.restore({ theme })).catch(() => {});
  }, [theme]);

  return <perspective-viewer ref={ref} class="psp" />;
}
