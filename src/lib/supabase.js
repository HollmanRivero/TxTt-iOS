import { createClient } from "@supabase/supabase-js";

// ─── Replace these with your actual values (use import.meta.env in production) ───
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://api.yourdomain.com";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "your_anon_key_here";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Persist session in localStorage so the user stays logged in offline
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // Catches OAuth redirects automatically
  },
});

// ── Auth helpers ──────────────────────────────────────────────────────────────

/** Sign in with Google — opens OAuth popup/redirect */
export const signInWithGoogle = () =>
  supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });

/** Sign in with Apple — opens OAuth popup/redirect */
export const signInWithApple = () =>
  supabase.auth.signInWithOAuth({
    provider: "apple",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });

/** Send email OTP (6-digit code to email) */
export const sendEmailOTP = (email) =>
  supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

/** Send phone OTP via Twilio */
export const sendPhoneOTP = (phone) =>
  supabase.auth.signInWithOtp({
    phone, // Must be E.164 format: +4712345678
    options: { shouldCreateUser: true },
  });

/** Verify OTP (works for both email and phone) */
export const verifyOTP = ({ email, phone, token }) => {
  if (email) {
    return supabase.auth.verifyOtp({ email, token, type: "email" });
  }
  return supabase.auth.verifyOtp({ phone, token, type: "sms" });
};

/** Register with email + password (no OTP — Supabase sends confirmation link) */
export const signUpWithEmailPassword = (email, password) =>
  supabase.auth.signUp({ email, password });

/** Sign in with email + password */
export const signInWithEmailPassword = (email, password) =>
  supabase.auth.signInWithPassword({ email, password });

/** Register with phone + password — sends OTP once for verification */
export const signUpWithPhone = (phone, password) =>
  supabase.auth.signUp({ phone, password });

/** Sign in with phone + password — no OTP, direct login */
export const signInWithPhone = (phone, password) =>
  supabase.auth.signInWithPassword({ phone, password });

/** Send password reset email — link redirects to /auth/reset */
export const resetPasswordByEmail = (email) =>
  supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset`,
  });

/** Sign out */
export const signOut = () => supabase.auth.signOut();

/** Get current session */
export const getSession = () => supabase.auth.getSession();

/** Subscribe to auth state changes */
export const onAuthStateChange = (callback) =>
  supabase.auth.onAuthStateChange(callback);
