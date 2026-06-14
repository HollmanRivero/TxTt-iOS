import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

// StrictMode fjernet bevisst: React's dev-only double-mount feature
// rev WebRTC-sessions ned for fort. Komponenter som setter opp tunge
// ressurser (kamera, peer connections) toler ikke unmount-remount.
createRoot(document.getElementById("root")).render(<App />);
