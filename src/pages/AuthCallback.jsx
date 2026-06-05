import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

/**
 * /auth/callback
 *
 * Supabase automatically exchanges the OAuth code for a session
 * when detectSessionInUrl: true is set in the client config.
 * This page just waits for that to happen and then redirects.
 */
export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        navigate("/", { replace: true });
      }
      if (event === "SIGNED_OUT") {
        navigate("/auth", { replace: true });
      }
    });

    // Fallback: if session already resolved before listener fired
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/", { replace: true });
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  return (
    <div style={{
      minHeight: "100dvh",
      background: "#0a0a0f",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#6b6b80",
      fontFamily: "DM Sans, sans-serif",
      flexDirection: "column",
      gap: 16,
    }}>
      <div style={{
        width: 32, height: 32,
        border: "2px solid rgba(91,143,255,0.3)",
        borderTopColor: "#5b8fff",
        borderRadius: "50%",
        animation: "spin 600ms linear infinite",
      }} />
      <p style={{ margin: 0, fontSize: "0.9rem" }}>Signing you in…</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
