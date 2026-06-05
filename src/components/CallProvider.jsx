import { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { listenForCalls } from "../lib/webrtc";
import { supabase } from "../lib/supabase";
import "./IncomingCall.css";

const CallContext = createContext(null);

export function CallProvider({ children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [incomingCall, setIncomingCall] = useState(null);

  // Logger hver gang incomingCall endrer seg
  useEffect(() => {
    console.log("[CallProvider] incomingCall state ->", incomingCall);
  }, [incomingCall]);

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
