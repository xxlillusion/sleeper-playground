import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import "./styles/app.css";
import { App } from "./App";
import { getClient } from "./perspective/engine";

// Start downloading and compiling the engine right away; the viewer element is registered once this finishes.
getClient().catch(e => console.error("perspective init", e));

// No StrictMode: its double mount/unmount in dev would call viewer.delete() on a live element.
createRoot(document.getElementById("root")!).render(<App />);
