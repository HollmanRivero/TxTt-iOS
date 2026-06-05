import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import "./Auth.css";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady]           = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNew, setConfirmNew]   = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [done, setDone]             = useState(false);

  useEffect(() => {
    // Supabase fires PASSWORD_RECOVERY when user arrives via reset link
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async (e) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 6) return setError("Password must be at least 6 characters.");
    if (newPassword !== confirmNew) return setError("Passwords do not match.");

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setDone(true);
      setTimeout(() => navigate("/"), 2000);
    } catch (err) {
      setError(err.message || "Could not reset password. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-root">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="logo-tx">Tx</span><span className="logo-tt">Tt</span>
        </div>

        {done ? (
          <p className="auth-info">✓ Password updated! Taking you in…</p>
        ) : !ready ? (
          <p className="auth-info">Verifying your reset link…</p>
        ) : (
          <>
            <p className="auth-tagline">Choose a new password</p>
            <form className="auth-form" onSubmit={handleReset}>
              <label className="auth-label">
                New password
                <div className="field-input-wrap">
                  <input
                    className="auth-input"
                    type={showPassword ? "text" : "password"}
                    placeholder="At least 6 characters"
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setError(null); }}
                    autoComplete="new-password"
                    autoFocus
                    disabled={loading}
                  />
                  <button type="button" className="field-eye-btn"
                    onClick={() => setShowPassword(v => !v)} tabIndex={-1}>
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>

              <label className="auth-label">
                Confirm new password
                <input
                  className="auth-input"
                  type={showPassword ? "text" : "password"}
                  placeholder="Repeat new password"
                  value={confirmNew}
                  onChange={(e) => { setConfirmNew(e.target.value); setError(null); }}
                  autoComplete="new-password"
                  disabled={loading}
                />
              </label>

              {error && <p className="auth-error">{error}</p>}

              <button className="auth-btn primary" type="submit"
                disabled={loading || !newPassword || !confirmNew}>
                {loading ? <span className="spinner" /> : "Save new password →"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
