import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

// StrictMode holdes deaktivert for å unngå WebRTC/kamera-krasj
createRoot(document.getElementById("root")).render(<App />);