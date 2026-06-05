import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { getProfile, updateProfile } from "../lib/messages";
import { supabase, signOut } from "../lib/supabase";
import "./Settings.css";

export default function Settings() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);

  // Profile fields
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");

  // Account fields (editable)
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Password fields
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  // ── Load profile ────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    getProfile(user.id)
      .then((p) => {
        setProfile(p);
        setFullName(p.full_name || "");
        setUsername(p.username || "");
        setEmail(user.email || p.email || "");
        setPhone(user.phone || p.phone || "");
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  // ── Save ────────────────────────────────────────────────────
  const handleSave = async () => {
    setError(null);
    setSaved(false);

    // Validate username
    if (username && !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      setError("Username must be 3–20 letters, numbers or underscores.");
      return;
    }

    // Validate password if user typed something
    if (newPassword) {
      if (newPassword.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
      if (newPassword !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    setSaving(true);
    try {
      // 1. Update profile table (name, username, phone)
      await updateProfile(user.id, {
        full_name: fullName.trim() || null,
        username: username.trim() || null,
        phone: phone.trim() || null,
      });

      // 2. Update email in Supabase Auth if changed
      const emailChanged = email.trim() && email.trim() !== (user.email || "");
      if (emailChanged) {
        const { error: emailErr } = await supabase.auth.updateUser({
          email: email.trim(),
        });
        if (emailErr) throw emailErr;
      }

      // 3. Update password if user filled it in
      if (newPassword) {
        const { error: passErr } = await supabase.auth.updateUser({
          password: newPassword,
        });
        if (passErr) throw passErr;
        setNewPassword("");
        setConfirmPassword("");
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      if (err.message?.includes("duplicate") || err.code === "23505") {
        setError("That username is already taken.");
      } else {
        setError(err.message || "Could not save. Try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  const getInitial = () => {
    const name = fullName || username || email;
    return name ? name[0].toUpperCase() : <img src="/default-avatar.png" alt="" />;
  };

  if (loading) {
    return (
      <div className="settings-root">
        <div className="settings-loading"><div className="spinner-lg" /></div>
      </div>
    );
  }

  return (
    <div className="settings-root">

      {/* Header */}
      <header className="settings-header">
        <button className="back-btn" onClick={() => navigate("/")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </button>
        <h1 className="settings-title">Settings</h1>
      </header>

      <div className="settings-body">

        {/* Avatar */}
        <div className="settings-avatar-section">
          <div className="settings-avatar">{getInitial()}</div>
        </div>

        {/* Profile fields */}
        <div className="settings-section">
          <p className="section-label">Profile</p>

          <label className="settings-field">
            <span className="field-label">Display name</span>
            <input
              className="field-input"
              type="text"
              placeholder="Your name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={50}
            />
          </label>

          <label className="settings-field">
            <span className="field-label">Username</span>
            <input
              className="field-input"
              type="text"
              placeholder="username"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              maxLength={20}
            />
            <span className="field-hint">
              People can find you by this. Letters, numbers, underscores.
            </span>
          </label>
        </div>

        {/* Account fields — now editable */}
        <div className="settings-section">
          <p className="section-label">Account</p>

          <label className="settings-field">
            <span className="field-label">Email</span>
            <input
              className="field-input"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {email !== (user?.email || "") && (
              <span className="field-hint">
                A confirmation link will be sent to the new address.
              </span>
            )}
          </label>

          <label className="settings-field">
            <span className="field-label">Phone</span>
            <input
              className="field-input"
              type="tel"
              placeholder="+47 000 00 000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
        </div>

        {/* Password section */}
        <div className="settings-section">
          <p className="section-label">Security</p>

          <label className="settings-field">
            <span className="field-label">New password</span>
            <div className="field-input-wrap">
              <input
                className="field-input"
                type={showPassword ? "text" : "password"}
                placeholder="Leave blank to keep current"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="field-eye-btn"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {newPassword.length > 0 && (
            <label className="settings-field">
              <span className="field-label">Confirm password</span>
              <input
                className="field-input"
                type={showPassword ? "text" : "password"}
                placeholder="Repeat new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>
          )}
        </div>

        {/* Feedback */}
        {error && <p className="settings-error">{error}</p>}
        {saved && <p className="settings-saved">✓ Saved</p>}

        {/* Save button */}
        <button className="settings-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? <span className="spinner" /> : "Save changes"}
        </button>

        {/* Sign out */}
        <button className="settings-signout-btn" onClick={signOut}>
          Sign out
        </button>

      </div>
    </div>
  );
}
