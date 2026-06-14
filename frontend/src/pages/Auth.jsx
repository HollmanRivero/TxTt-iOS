import { useState, useEffect } from "react";
import {
  signInWithGoogle,
  signInWithApple,
  signUpWithEmailPassword,
  signInWithEmailPassword,
  signUpWithPhone,
  signInWithPhone,
  sendPhoneOTP,
  verifyOTP,
  resetPasswordByEmail,
  supabase,
} from "../lib/supabase";
import "./Auth.css";

// ── Helpers ───────────────────────────────────────────────────────────────────
const toE164 = (raw) => {
  const digits = raw.replace(/\D/g, "");
  return digits.startsWith("00") ? "+" + digits.slice(2) : "+" + digits;
};
const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isValidPhone = (v) => /^\+?[\d\s\-()]{7,}$/.test(v);
const detectType = (val) => {
  if (isValidEmail(val)) return "email";
  if (isValidPhone(val)) return "phone";
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────

export default function AuthPage() {
  // view: login | register | phone-verify | forgot | phone-reset-verify | set-new-password
  const [view, setView] = useState("login");

  const [inputValue, setInputValue]     = useState("");
  const [inputType, setInputType]       = useState(null);
  const [password, setPassword]         = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // OTP / reset state
  const [otp, setOtp]                     = useState("");
  const [pendingPhone, setPendingPhone]   = useState("");
  const [newPassword, setNewPassword]     = useState("");
  const [confirmNew, setConfirmNew]       = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [info, setInfo]       = useState(null);

  // ── First-run notice ("READ CAREFULLY") ──────────────────────────────────
  // Shown ONCE, before the user registers. Explains that TxTt is free (up to
  // 5 GB on our shared backend) and that anyone who wants more space / full
  // ownership can spin up their own free Supabase backend in ~2 min. Declining
  // is fine — they simply keep using the shared backend (our credentials).
  const [showIntro, setShowIntro] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem("txtt_intro_seen")) setShowIntro(true);
    } catch { /* localStorage unavailable - just skip the notice */ }
  }, []);
  const dismissIntro = () => {
    try { localStorage.setItem("txtt_intro_seen", "1"); } catch { /* ignore */ }
    setShowIntro(false);
  };
  // Opens Supabase sign-up. window.open works on web AND in the Capacitor
  // WebView (Android opens it in the system browser).
  const openSupabaseSignup = () => {
    window.open("https://supabase.com/dashboard/sign-up", "_blank", "noopener,noreferrer");
  };

  const resetForm = (nextView) => {
    setInputValue(""); setInputType(null);
    setPassword(""); setConfirmPassword("");
    setOtp(""); setNewPassword(""); setConfirmNew("");
    setError(null); setInfo(null);
    setView(nextView);
  };

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
    setInputType(detectType(e.target.value));
    setError(null);
  };

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    const type = detectType(inputValue);
    if (!type) return setError("Enter a valid email or phone number.");
    if (!password) return setError("Enter your password.");

    setLoading(true);
    try {
      const result = type === "email"
        ? await signInWithEmailPassword(inputValue.trim(), password)
        : await signInWithPhone(toE164(inputValue), password);
      if (result.error) throw result.error;
    } catch (err) {
      setError(err.message || "Login failed. Check your details and try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── REGISTER ──────────────────────────────────────────────────────────────
  const handleRegister = async (e) => {
    e.preventDefault();
    setError(null);
    const type = detectType(inputValue);
    if (!type) return setError("Enter a valid email or phone number.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirmPassword) return setError("Passwords do not match.");

    setLoading(true);
    try {
      if (type === "email") {
        const result = await signUpWithEmailPassword(inputValue.trim(), password);
        if (result.error) throw result.error;
        setInfo("Check your email for a confirmation link, then log in.");
        resetForm("login");
      } else {
        const phone = toE164(inputValue);
        const result = await signUpWithPhone(phone, password);
        if (result.error) throw result.error;
        setPendingPhone(phone);
        setInfo(`SMS sent to ${phone}. Enter the code to finish registration.`);
        setView("phone-verify");
      }
    } catch (err) {
      setError(err.message || "Registration failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── PHONE VERIFY (registration, once ever) ────────────────────────────────
  const handleVerifyPhone = async (e) => {
    e.preventDefault();
    setError(null);
    if (otp.length < 6) return setError("Enter the 6-digit code.");

    setLoading(true);
    try {
      const result = await verifyOTP({ phone: pendingPhone, token: otp });
      if (result.error) throw result.error;
      // useAuth picks up session — App redirects automatically
    } catch (err) {
      setError(err.message || "Invalid code. Try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── FORGOT PASSWORD ───────────────────────────────────────────────────────
  const handleForgot = async (e) => {
    e.preventDefault();
    setError(null);
    const type = detectType(inputValue);
    if (!type) return setError("Enter the email or phone you registered with.");

    setLoading(true);
    try {
      if (type === "email") {
        const result = await resetPasswordByEmail(inputValue.trim());
        if (result.error) throw result.error;
        setInfo(`Reset link sent to ${inputValue.trim()}. Check your inbox.`);
        setView("login");
      } else {
        const phone = toE164(inputValue);
        const result = await sendPhoneOTP(phone);
        if (result.error) throw result.error;
        setPendingPhone(phone);
        setInfo(`SMS sent to ${phone}. Enter the code to reset your password.`);
        setView("phone-reset-verify");
      }
    } catch (err) {
      setError(err.message || "Could not send reset. Try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── PHONE RESET — verify OTP ──────────────────────────────────────────────
  const handlePhoneResetVerify = async (e) => {
    e.preventDefault();
    setError(null);
    if (otp.length < 6) return setError("Enter the 6-digit code.");

    setLoading(true);
    try {
      const result = await verifyOTP({ phone: pendingPhone, token: otp });
      if (result.error) throw result.error;
      setOtp("");
      setView("set-new-password");
    } catch (err) {
      setError(err.message || "Invalid code. Try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── SET NEW PASSWORD (after phone OTP reset) ──────────────────────────────
  const handleSetNewPassword = async (e) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 6) return setError("Password must be at least 6 characters.");
    if (newPassword !== confirmNew) return setError("Passwords do not match.");

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setInfo("Password updated! You are now logged in.");
      // useAuth picks up the session — App redirects to /
    } catch (err) {
      setError(err.message || "Could not update password. Try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── GOOGLE ────────────────────────────────────────────────────────────────
  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    const { error } = await signInWithGoogle();
    if (error) { setError(error.message); setLoading(false); }
  };

  const handleApple = async () => {
    setError(null);
    setLoading(true);
    const { error } = await signInWithApple();
    if (error) { setError(error.message); setLoading(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="auth-root">

      {/* ── First-run "READ CAREFULLY" notice ─────────────────────────── */}
      {showIntro && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(10,10,20,0.80)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              background: "#ffffff", color: "#1a1a2e",
              borderRadius: 16, padding: "26px 24px",
              maxWidth: 460, width: "100%",
              maxHeight: "88vh", overflowY: "auto",
              boxShadow: "0 12px 40px rgba(0,0,0,0.35)", lineHeight: 1.55,
            }}
          >
            <h2 style={{ margin: "0 0 6px", fontSize: "1.35rem", letterSpacing: "0.04em" }}>
              READ CAREFULLY
            </h2>
            <p style={{ margin: "0 0 14px", fontWeight: 700, color: "#0b5fff" }}>
              TxTt is 100% free to use.
            </p>
            <p style={{ margin: "0 0 12px", fontSize: "0.95rem" }}>
              Every account includes up to <strong>5&nbsp;GB of storage</strong> on our shared
              backend — no cost, no subscription, ever.
            </p>
            <p style={{ margin: "0 0 12px", fontSize: "0.95rem" }}>
              Want more space and full ownership of your own data? You can connect TxTt to your{" "}
              <strong>own free Supabase backend</strong>. Creating a Supabase account is free and
              takes about <strong>2 minutes</strong> — you get your own private database to use
              with the app.
            </p>
            <p style={{ margin: "0 0 18px", fontSize: "0.95rem" }}>
              Don&apos;t want to bother? No problem — just tap <strong>Continue</strong> and you&apos;ll
              keep using our shared free backend (up to 5&nbsp;GB).
            </p>

            <button
              type="button"
              onClick={openSupabaseSignup}
              style={{
                display: "block", width: "100%", padding: "13px 16px", marginBottom: 10,
                borderRadius: 10, border: "2px solid #3ecf8e", background: "#3ecf8e",
                color: "#03301f", fontWeight: 700, fontSize: "0.95rem", cursor: "pointer",
              }}
            >
              Create my free Supabase account →
            </button>
            <button
              type="button"
              onClick={dismissIntro}
              style={{
                display: "block", width: "100%", padding: "13px 16px",
                borderRadius: 10, border: "1px solid #c9ccd6", background: "#f4f5f8",
                color: "#1a1a2e", fontWeight: 600, fontSize: "0.95rem", cursor: "pointer",
              }}
            >
              Continue (use free shared backend)
            </button>

            <p style={{ margin: "16px 0 0", fontSize: "0.78rem", color: "#6b6b80", textAlign: "center" }}>
              By continuing you agree to our{" "}
              <a href="/privacy" style={{ color: "#0b5fff" }}>Privacy Policy</a>.
            </p>
          </div>
        </div>
      )}

      <div className="auth-card">

        <div className="auth-logo">
          <span className="logo-tx">Tx</span><span className="logo-tt">Tt</span>
        </div>
        <p className="auth-tagline">Talk. Share. Call. Offline first.</p>

        {/* ── LOGIN ──────────────────────────────────────────────── */}
        {view === "login" && (
          <>
            <form className="auth-form" onSubmit={handleLogin}>
              <label className="auth-label">
                Phone or email
                <input
                  className="auth-input"
                  type="text"
                  placeholder="+47 123 45 678 or you@email.com"
                  value={inputValue}
                  onChange={handleInputChange}
                  autoComplete="username"
                  name="username"
                  id="login-identifier"
                  disabled={loading}
                />
              </label>

              <label className="auth-label">
                Password
                <div className="field-input-wrap">
                  <input
                    className="auth-input"
                    type={showPassword ? "text" : "password"}
                    placeholder="Your password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    autoComplete="current-password"
                    name="current-password"
                    id="login-password"
                    disabled={loading}
                  />
                  <button type="button" className="field-eye-btn"
                    onClick={() => setShowPassword(v => !v)} tabIndex={-1}>
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>

              <button
                type="button"
                className="link-btn forgot-link"
                onClick={() => resetForm("forgot")}
              >
                Forgot password?
              </button>

              {error && <p className="auth-error">{error}</p>}
              {info  && <p className="auth-info">{info}</p>}

              <button className="auth-btn primary" type="submit"
                disabled={loading || !inputType || !password}>
                {loading ? <span className="spinner" /> : "Log in →"}
              </button>
            </form>

            <div className="auth-divider"><span>or</span></div>
            <div className="oauth-stack">
              <button className="auth-btn oauth google" onClick={handleGoogle}
                disabled={loading} type="button">
                <GoogleIcon /> Continue with Google
              </button>
              <button className="auth-btn oauth apple" onClick={handleApple}
                disabled={loading} type="button">
                <AppleIcon /> Continue with Apple
              </button>
            </div>

            <p className="auth-switch">
              Don't have an account?{" "}
              <button className="link-btn" onClick={() => resetForm("register")} type="button">
                Sign up
              </button>
            </p>
            <p className="auth-legal">
              By continuing you agree to our <a href="/terms">Terms</a> and{" "}
              <a href="/privacy">Privacy Policy</a>.
            </p>
          </>
        )}

        {/* ── REGISTER ───────────────────────────────────────────── */}
        {view === "register" && (
          <>
            <form className="auth-form" onSubmit={handleRegister}>
              <label className="auth-label">
                Phone or email
                <input
                  className="auth-input"
                  type="text"
                  placeholder="+47 123 45 678 or you@email.com"
                  value={inputValue}
                  onChange={handleInputChange}
                  autoComplete="username"
                  name="username"
                  id="register-identifier"
                  disabled={loading}
                />
                {inputType && (
                  <span className="input-hint">
                    {inputType === "email"
                      ? "📧 Confirmation link sent to your inbox"
                      : "📱 One-time SMS code to verify your number"}
                  </span>
                )}
              </label>

              <label className="auth-label">
                Password
                <div className="field-input-wrap">
                  <input
                    className="auth-input"
                    type={showPassword ? "text" : "password"}
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    autoComplete="new-password"
                    name="new-password"
                    id="register-password"
                    disabled={loading}
                  />
                  <button type="button" className="field-eye-btn"
                    onClick={() => setShowPassword(v => !v)} tabIndex={-1}>
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>

              <label className="auth-label">
                Confirm password
                <input
                  className="auth-input"
                  type={showPassword ? "text" : "password"}
                  placeholder="Repeat password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                  autoComplete="new-password"
                  name="confirm-password"
                  id="register-confirm-password"
                  disabled={loading}
                />
              </label>

              {error && <p className="auth-error">{error}</p>}

              <button className="auth-btn primary" type="submit"
                disabled={loading || !inputType || !password || !confirmPassword}>
                {loading ? <span className="spinner" /> : "Create account →"}
              </button>
            </form>

            <div className="auth-divider"><span>or</span></div>
            <div className="oauth-stack">
              <button className="auth-btn oauth google" onClick={handleGoogle}
                disabled={loading} type="button">
                <GoogleIcon /> Continue with Google
              </button>
              <button className="auth-btn oauth apple" onClick={handleApple}
                disabled={loading} type="button">
                <AppleIcon /> Continue with Apple
              </button>
            </div>

            <p className="auth-switch">
              Already have an account?{" "}
              <button className="link-btn" onClick={() => resetForm("login")} type="button">
                Log in
              </button>
            </p>
            <p className="auth-legal">
              By continuing you agree to our <a href="/terms">Terms</a> and{" "}
              <a href="/privacy">Privacy Policy</a>.
            </p>
          </>
        )}

        {/* ── PHONE VERIFY — registration ─────────────────────────── */}
        {view === "phone-verify" && (
          <>
            {info && <p className="auth-info">{info}</p>}
            <form className="auth-form" onSubmit={handleVerifyPhone}>
              <label className="auth-label">
                6-digit code
                <input
                  className="auth-input otp-input"
                  type="number"
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => { setOtp(e.target.value.slice(0, 6)); setError(null); }}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  name="one-time-code"
                  id="phone-verify-otp"
                  autoFocus
                  disabled={loading}
                />
                <span className="input-hint">
                  This is the only time you'll need a code. After this, log in with your password.
                </span>
              </label>
              {error && <p className="auth-error">{error}</p>}
              <button className="auth-btn primary" type="submit"
                disabled={loading || otp.length < 6}>
                {loading ? <span className="spinner" /> : "Verify & continue →"}
              </button>
            </form>
            <button className="auth-btn ghost" onClick={() => resetForm("register")} type="button">
              ← Back
            </button>
          </>
        )}

        {/* ── FORGOT PASSWORD ─────────────────────────────────────── */}
        {view === "forgot" && (
          <>
            <p className="auth-info">
              Enter the email or phone number you registered with. We'll send you a reset link or code.
            </p>
            <form className="auth-form" onSubmit={handleForgot}>
              <label className="auth-label">
                Phone or email
                <input
                  className="auth-input"
                  type="text"
                  placeholder="+47 123 45 678 or you@email.com"
                  value={inputValue}
                  onChange={handleInputChange}
                  autoComplete="username"
                  name="username"
                  id="forgot-identifier"
                  autoFocus
                  disabled={loading}
                />
              </label>
              {error && <p className="auth-error">{error}</p>}
              <button className="auth-btn primary" type="submit"
                disabled={loading || !inputType}>
                {loading ? <span className="spinner" /> : "Send reset →"}
              </button>
            </form>
            <button className="auth-btn ghost" onClick={() => resetForm("login")} type="button">
              ← Back to login
            </button>
          </>
        )}

        {/* ── PHONE RESET — verify OTP ────────────────────────────── */}
        {view === "phone-reset-verify" && (
          <>
            {info && <p className="auth-info">{info}</p>}
            <form className="auth-form" onSubmit={handlePhoneResetVerify}>
              <label className="auth-label">
                6-digit code
                <input
                  className="auth-input otp-input"
                  type="number"
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => { setOtp(e.target.value.slice(0, 6)); setError(null); }}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  name="one-time-code"
                  id="reset-verify-otp"
                  autoFocus
                  disabled={loading}
                />
              </label>
              {error && <p className="auth-error">{error}</p>}
              <button className="auth-btn primary" type="submit"
                disabled={loading || otp.length < 6}>
                {loading ? <span className="spinner" /> : "Verify →"}
              </button>
            </form>
            <button className="auth-btn ghost" onClick={() => resetForm("forgot")} type="button">
              ← Back
            </button>
          </>
        )}

        {/* ── SET NEW PASSWORD (after phone OTP reset) ────────────── */}
        {view === "set-new-password" && (
          <>
            <p className="auth-info">Choose a new password for your account.</p>
            <form className="auth-form" onSubmit={handleSetNewPassword}>
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
                    name="new-password"
                    id="set-new-password"
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
                  name="confirm-new-password"
                  id="set-confirm-new-password"
                  disabled={loading}
                />
              </label>
              {error && <p className="auth-error">{error}</p>}
              {info  && <p className="auth-info">{info}</p>}
              <button className="auth-btn primary" type="submit"
                disabled={loading || !newPassword || !confirmNew}>
                {loading ? <span className="spinner" /> : "Save new password →"}
              </button>
            </form>
          </>
        )}

        <p style={{ marginTop: 18, fontSize: "0.78rem", lineHeight: 1.5, color: "#6b6b80", textAlign: "center" }}>
          Free up to <strong style={{ color: "#9a9aae" }}>5&nbsp;GB of storage per user</strong>.
          Need more?{" "}
          <a
            href="https://supabase.com/dashboard/sign-up"
            onClick={(e) => { e.preventDefault(); openSupabaseSignup(); }}
            style={{ color: "#3ecf8e", fontWeight: 600, textDecoration: "none" }}
          >
            Create your own free Supabase backend →
          </a>
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
      <path d="M14.98 9.53c-.02-2.18 1.78-3.24 1.86-3.29-1.01-1.48-2.59-1.68-3.15-1.7-1.34-.14-2.62.79-3.3.79-.68 0-1.73-.77-2.85-.75-1.46.02-2.81.85-3.56 2.16-1.52 2.63-.39 6.53 1.09 8.67.72 1.05 1.58 2.23 2.72 2.18 1.09-.04 1.51-.71 2.83-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.92-1.07 2.64-2.12.83-1.21 1.17-2.39 1.19-2.45-.03-.01-2.28-.87-2.3-3.47zM12.79 3.15c.6-.73 1-1.74.89-2.75-.86.04-1.9.57-2.51 1.29-.55.64-1.04 1.67-.91 2.65.96.07 1.94-.49 2.53-1.19z"/>
    </svg>
  );
}
