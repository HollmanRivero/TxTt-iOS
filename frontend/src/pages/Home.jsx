import { useAuth } from "../hooks/useAuth";
import { signOut } from "../lib/supabase";

export default function Home() {
  const { user } = useAuth();

  return (
    <div style={{
      minHeight: "100dvh",
      background: "#0a0a0f",
      color: "#f0f0f5",
      fontFamily: "DM Sans, sans-serif",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
    }}>
      <h1 style={{ fontFamily: "Syne, sans-serif", fontSize: "2rem", margin: 0 }}>
        Tx<span style={{ color: "#5b8fff" }}>Tt</span>
      </h1>
      <p style={{ color: "#6b6b80", margin: 0 }}>
        Signed in as <strong style={{ color: "#f0f0f5" }}>
          {user?.email || user?.phone || user?.user_metadata?.full_name || "you"}
        </strong>
      </p>
      <p style={{ color: "#34d399", fontSize: "0.85rem" }}>
        ✓ Auth working — Phase 1 complete
      </p>
      <button
        onClick={signOut}
        style={{
          background: "transparent",
          border: "1px solid #1e1e2a",
          borderRadius: 10,
          color: "#6b6b80",
          cursor: "pointer",
          fontFamily: "inherit",
          padding: "10px 20px",
          marginTop: 8,
        }}
      >
        Sign out
      </button>
    </div>
  );
}
