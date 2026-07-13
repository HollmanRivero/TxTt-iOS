import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";

const CallContext = createContext(null);

export function CallProvider({ children }) {
  const [incomingCall, setIncomingCall] = useState(null);
  const navigate = useNavigate();
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setUserId(data.user.id);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id || null);
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId) return;

    console.log("[CallProvider] useEffect: setter opp listener for", userId);

    const channel = supabase
      .channel(`user-calls:${userId}`)
      .on("broadcast", { event: "call-invite" }, (payload) => {
        console.log("[ListenForCalls] MOTTATT incoming-call:", payload.payload);
        setIncomingCall(payload.payload);
        console.log("[CallProvider] starter ringetone");
      })
      .subscribe((status) => {
        console.log(`[ListenForCalls] subscribe-status: ${status} kanal: user-calls:${userId}`);
      });

    return () => {
      console.log("[CallProvider] CLEANUP: fjerner kanal");
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const acceptCall = () => {
    console.log("[CallProvider] acceptCall klikket");
    if (!incomingCall) return;

    console.log("[CallProvider] stopper ringetone");
    const activeCall = incomingCall;
    setIncomingCall(null);

    navigate(`/call/${activeCall.conversationId}`, {
      state: {
        isVideo: activeCall.isVideo,
        isAnswering: true,
        callerName: activeCall.callerName || "Contact"
      }
    });
  };

  const declineCall = async () => {
    console.log("[CallProvider] declineCall klikket");
    if (!incomingCall) return;

    try {
      const callChannel = supabase.channel(`room_call:${incomingCall.conversationId}`);
      await callChannel.subscribe();
      await callChannel.send({
        type: "broadcast",
        event: "hangup",
        payload: { senderId: userId }
      });
    } catch (err) {
      console.error("Kunne ikke sende avvis-signal:", err);
    }

    console.log("[CallProvider] stopper ringetone");
    setIncomingCall(null);
  };

  return (
    <CallContext.Provider value={{ incomingCall, acceptCall, declineCall }}>
      {children}

      {/* DET REPARERTE OG LUKKEDE POPUP-GRENSESNITTET FOR INNKOMMENDE SAMTALER */}
      {incomingCall && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          backgroundColor: "#0d0d12",
          zIndex: 999999,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          color: "#ffffff",
          fontFamily: "system-ui, sans-serif"
        }}>
          <div style={{ textAlign: "center", marginBottom: "48px" }}>
            <div style={{
              width: "96px",
              height: "96px",
              borderRadius: "50%",
              backgroundColor: "#1f1f2e",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "2.5rem",
              fontWeight: "600",
              margin: "0 auto 24px auto",
              border: "2px solid rgba(255, 255, 255, 0.1)"
            }}>
              {incomingCall.callerName ? incomingCall.callerName[0].toUpperCase() : "?"}
            </div>
            <h2 style={{ fontSize: "1.75rem", margin: "0 0 8px 0", fontWeight: "600" }}>
              {incomingCall.callerName || "Unknown Contact"}
            </h2>
            <p style={{ fontSize: "1rem", color: "#8a8a9e", margin: 0 }}>
              {incomingCall.isVideo ? "📹 Incoming video call..." : "📞 Incoming audio call..."}
            </p>
          </div>

          <div style={{ display: "flex", gap: "32px", alignItems: "center" }}>
            {/* Avvis / Legg på-knapp (Stor rød sirkel) */}
            <button 
              onClick={declineCall}
              type="button"
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                backgroundColor: "#ff3b30",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 8px 24px rgba(255, 59, 48, 0.3)",
                transition: "transform 0.2s"
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.08)"}
              onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>

            {/* Godta / Svar-knapp (Stor grønn sirkel) */}
            <button 
              onClick={acceptCall}
              type="button"
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                backgroundColor: "#34c759",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 8px 24px rgba(52, 199, 89, 0.3)",
                transition: "transform 0.2s"
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.08)"}
              onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.5 19.5 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
              </svg>
            </button>
          </div>
        </div>
      )}
    </CallContext.Provider>
  );
}

export function useCall() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error("useCall må brukes innenfor en CallProvider");
  }
  return context;
}