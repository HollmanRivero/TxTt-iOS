import { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { listenForCalls } from "../lib/webrtc";
import { supabase } from "../lib/supabase";
import { registerPushForUser } from "../lib/push";
import "./IncomingCall.css";

const CallContext = createContext(null);

// ── Delt AudioContext som "låses opp" på første brukertrykk ──────────
// På Android-WebView/TWA starter en ny AudioContext i "suspended"-modus
// og kan kun vekkes inne i en brukerhendelse (tap). Når et anrop kommer
// inn finnes det ingen fersk tap → konteksten forblir suspended → ingen
// lyd (bare vibrering). Derfor lager vi ÉN delt kontekst og vekker den på
// første trykk, så den allerede er "varm" når anropet kommer.
let sharedCtx = null;
function getAudioCtx() {
  if (!sharedCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) sharedCtx = new AudioCtx();
  }
  return sharedCtx;
}

let audioUnlockInstalled = false;
function installAudioUnlock() {
  if (audioUnlockInstalled) return;
  audioUnlockInstalled = true;

  const unlock = () => {
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    // Nesten lydløst "blip" for å varme opp enkelte WebView-er
    try {
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      const o = ctx.createOscillator();
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.01);
    } catch {
      /* ignorer */
    }
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
  };

  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchstart", unlock);
}

// ── Klassisk "ring-ring" ringetone via Web Audio API ──────────────
// Ingen lydfil nødvendig. Bruker den delte (opplåste) konteksten og
// spiller en britisk-stil dobbelt-ring i loop til .stop() kalles.
// Lukker IKKE konteksten ved stop, så den holder seg varm til neste anrop.
function createClassicRingtone() {
  const ctx = getAudioCtx();
  if (!ctx) return { stop() {} }; // ingen Web Audio-støtte
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  let stopped = false;
  let loopTimer = null;

  // Spiller én tone (to frekvenser samtidig) fra startTime i gitt varighet
  const tone = (startTime, duration) => {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc2.type = "sine";
    osc1.frequency.value = 400; // klassisk ringetone
    osc2.frequency.value = 450;

    // Myk inn/ut for å unngå "klikk"-lyder
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.28, startTime + 0.03);
    gain.gain.setValueAtTime(0.28, startTime + duration - 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(startTime);
    osc2.start(startTime);
    osc1.stop(startTime + duration);
    osc2.stop(startTime + duration);
  };

  // Én syklus = dobbelt-ring + pause, deretter gjenta (ring-ring ... ring-ring)
  const ringCycle = () => {
    if (stopped) return;
    const t = ctx.currentTime;
    tone(t, 0.4); // ring
    tone(t + 0.6, 0.4); // ring (0.2s gap mellom de to)
    loopTimer = setTimeout(ringCycle, 3000); // ~2s stillhet før neste syklus
  };

  ringCycle();

  return {
    stop() {
      stopped = true;
      if (loopTimer) clearTimeout(loopTimer);
      // Ikke ctx.close() – behold konteksten varm til neste anrop.
    },
  };
}

export function CallProvider({ children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [incomingCall, setIncomingCall] = useState(null);

  // ── Lås opp lyd på første brukertrykk (én gang per app-start) ──
  useEffect(() => {
    installAudioUnlock();
  }, []);

  // Logger hver gang incomingCall endrer seg
  useEffect(() => {
    console.log("[CallProvider] incomingCall state ->", incomingCall);
  }, [incomingCall]);

  // ── Spill ringetone mens et innkommende anrop vises ─────────
  // Starter når incomingCall settes, stopper automatisk når det blir null
  // (svart, avvist eller auto-avvist etter 30s).
  useEffect(() => {
    if (!incomingCall) return;
    console.log("[CallProvider] starter ringetone");
    const ringtone = createClassicRingtone();
    return () => {
      console.log("[CallProvider] stopper ringetone");
      ringtone.stop();
    };
  }, [incomingCall]);

  // ── Registrer enheten for push-varsler (native) ─────────────
  useEffect(() => {
    if (!user) return;
    registerPushForUser(user.id, {
      onCallTapped: ({ conversationId, callerName, isVideo }) => {
        navigate(`/call/${conversationId}`, {
          state: { isVideo, isAnswering: true, callerName },
        });
      },
    });
  }, [user, navigate]);

  // ── Listen for incoming calls globally ──────────────────────
  useEffect(() => {
    if (!user) {
      console.log("[CallProvider] useEffect: ingen user, hopper over");
      return;
    }
    console.log("[CallProvider] useEffect: setter opp listener for", user.id);
    const channel = listenForCalls(user.id, (payload) => {
      console.log("[CallProvider] callback: setIncomingCall(payload)", payload);
      setIncomingCall(payload);
      // Auto-dismiss after 30s if not answered
      setTimeout(() => {
        console.log("[CallProvider] AUTO-DISMISS timer fyrer (30s gikk)");
        setIncomingCall((c) => (c === payload ? null : c));
      }, 30000);
    });
    return () => {
      console.log("[CallProvider] CLEANUP: fjerner kanal");
      supabase.removeChannel(channel);
    };
  }, [user]);

  // ── Accept ──────────────────────────────────────────────────
  const acceptCall = () => {
    console.log("[CallProvider] acceptCall klikket");
    if (!incomingCall) return;
    const { conversationId, callerName, isVideo } = incomingCall;
    setIncomingCall(null);
    navigate(`/call/${conversationId}`, {
      state: { isVideo, isAnswering: true, callerName },
    });
  };

  // ── Decline ─────────────────────────────────────────────────
  const declineCall = () => {
    console.log("[CallProvider] declineCall klikket");
    setIncomingCall(null);
  };

  return (
    <CallContext.Provider value={{ incomingCall }}>
      {children}
      {incomingCall && (
        <div className="incoming-call-overlay">
          <div className="incoming-call-card">
            <div className="incoming-avatar">
              {incomingCall.callerName
                ? incomingCall.callerName[0].toUpperCase()
                : <img src="/default-avatar.png" alt="" />}
            </div>
            <p className="incoming-name">{incomingCall.callerName}</p>
            <p className="incoming-type">
              {incomingCall.isVideo ? "📹 Incoming video call" : "📞 Incoming call"}
            </p>

            <div className="incoming-actions">
              <button className="incoming-btn decline" onClick={declineCall}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/>
                  <line x1="23" y1="1" x2="1" y2="23"/>
                </svg>
              </button>
              <button className="incoming-btn accept" onClick={acceptCall}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </CallContext.Provider>
  );
}

export const useCall = () => useContext(CallContext);
