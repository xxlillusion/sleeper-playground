import { useEffect, useState } from "react";
import type { ThemeName } from "../components/PerspectiveView";

/* Follows the OS preference. A data-theme attribute on <html>, as the explorer supports, wins when present. */
function current(): ThemeName {
  const forced = document.documentElement.dataset.theme;
  if (forced === "dark") return "Pro Dark";
  if (forced === "light") return "Pro Light";
  return matchMedia("(prefers-color-scheme: dark)").matches ? "Pro Dark" : "Pro Light";
}
export function useTheme(): ThemeName {
  const [t, setT] = useState<ThemeName>(current);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => setT(current());
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return t;
}
