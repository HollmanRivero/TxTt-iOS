import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { PhoneOff, Mic, MicOff, Video as VideoIcon, VideoOff } from "lucide-react";
import "./CallRoom.css";

export default function CallRoom() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const config = location.state || { isVideo: false, callerName: "Contact" };

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(!config.isVideo);
  const [status, setStatus] = useState("Connecting...");

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const streamRef = useRef(null);

  const cleanUpAndExit = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    navigate(`/chat/${conversationId}`);
  }, [conversationId, navigate]);

  useEffect(() => {
    if (!conversationId || !user) return;

    async function startWebRTC() {
      try {
        setStatus("Requesting media access...");
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: config.isVideo,
        });
        
        streamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        
        setStatus("In Call");
      } catch (err) {
        console.error("WebRTC media error:", err);
        setStatus("Media Access Denied");
      }
    }

    startWebRTC();

    const channel = supabase
      .channel(`room_call:${conversationId}`)
      .on("broadcast", { event: "hangup" }, () => {
        cleanUpAndExit();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [conversationId, user, config.isVideo, cleanUpAndExit]);

  const handleHangUp = async () => {
    try {
      const callChannel = supabase.channel(`room_call:${conversationId}`);
      await callChannel.subscribe();
      await callChannel.send({
        type: "broadcast",
        event: "hangup",
        payload: { senderId: user?.id }
      });
    } catch {
      // Tom catch-blokk godkjent i moderne JS
    }
    cleanUpAndExit();
  };

  const toggleMute = () => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (streamRef.current && config.isVideo) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  return (
    <div className="txtt-call-screen-root" style={{
      position: "fixed",
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      backgroundColor: "#0b0b0f",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      alignItems: "center",
      color: "#ffffff",
      fontFamily: "system-ui, sans-serif",
      overflow: "hidden",
      zIndex: 1000
    }}>
      {/* TOPPSTATUS */}
      <div className="txtt-call-top-status" style={{ textAlign: "center", marginTop: "40px", zIndex: 10 }}>
        <h3 style={{ fontSize: "1.8rem", margin: "0 0 6px 0", fontWeight: "600" }}>{config.callerName}</h3>
        <p className="txtt-status-subtext" style={{ fontSize: "0.95rem", color: "#8a8a9e", margin: 0 }}>{status}</p>
      </div>

      {/* VIDEORUTENETT */}
      <div className="txtt-call-video-grid" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
        {config.isVideo && (
          <div className="txtt-video-box local-view" style={{ position: "absolute", top: "40px", right: "40px", width: "150px", height: "220px", zIndex: 20, transform: "scaleX(-1)", borderRadius: "20px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.05)" }}>
            <video ref={localVideoRef} autoPlay playsInline muted className="txtt-video-feed" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <span className="txtt-video-badge" style={{ position: "absolute", bottom: "12px", left: 12, background: "rgba(0,0,0,0.5)", padding: "4px 10px", borderRadius: "8px", fontSize: "0.75rem", transform: "scaleX(-1)" }}>You</span>
          </div>
        )}
        
        {/* FIKS: Endret justifyValue til justifyContent */}
        <div className="txtt-video-box remote-view" style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <video ref={remoteVideoRef} autoPlay playsInline className="txtt-video-feed" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div className="txtt-avatar-fallback" style={{ width: "110px", height: "110px", borderRadius: "50%", backgroundColor: "#1f1f2e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "3rem", fontWeight: "bold" }}>
            {config.callerName ? config.callerName[0].toUpperCase() : "?"}
          </div>
        </div>
      </div>

      {/* KONTROLLKNAPPER */}
      <div className="txtt-call-bottom-controls-bar" style={{
        position: "absolute",
        bottom: "48px",
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: "24px",
        backgroundColor: "rgba(18, 18, 24, 0.75)",
        padding: "16px 32px",
        borderRadius: "40px",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        boxShadow: "0 15px 35px rgba(0, 0, 0, 0.4)",
        zIndex: 100
      }}>
        <button 
          onClick={toggleMute} 
          type="button"
          style={{
            width: "54px",
            height: "54px",
            borderRadius: "50%",
            border: "none",
            backgroundColor: isMuted ? "#ff3b30" : "rgba(255, 255, 255, 0.1)",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer"
          }}
        >
          {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>

        <button 
          onClick={handleHangUp} 
          type="button"
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "50%",
            border: "none",
            backgroundColor: "#ff3b30",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: "0 8px 20px rgba(255, 59, 48, 0.3)"
          }}
        >
          <PhoneOff size={26} />
        </button>

        {config.isVideo && (
          <button 
            onClick={toggleVideo} 
            type="button"
            style={{
              width: "54px",
              height: "54px",
              borderRadius: "50%",
              border: "none",
              backgroundColor: isVideoOff ? "#ff3b30" : "rgba(255, 255, 255, 0.1)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer"
            }}
          >
            {isVideoOff ? <VideoOff size={22} /> : <VideoIcon size={22} />}
          </button>
        )}
      </div>
    </div>
  );
}