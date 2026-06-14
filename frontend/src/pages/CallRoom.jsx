import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { CallSession } from "../lib/webrtc";
import "./CallRoom.css";

export default function CallRoom() {
  const { conversationId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Call params passed via navigation state
  const { isVideo = true, isAnswering = false, callerName = "Unknown" } =
    location.state || {};

  const [callState, setCallState] = useState("connecting"); // connecting | connected | ended
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(!isVideo);
  const [duration, setDuration] = useState(0);
  const [remoteTick, setRemoteTick] = useState(0); // bumpes per ankommende remote-track

  const sessionRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);  // alltid til stede, sikrer at lyd alltid spiller
  const durationTimerRef = useRef(null);
  const remoteStreamRef = useRef(null); // siste remote MediaStream

  // ── Set up the call ─────────────────────────────────────────
  useEffect(() => {
    if (!user || !conversationId) return;

    const session = new CallSession({
      conversationId,
      userId: user.id,
      isVideo,
      onRemoteStream: (stream) => {
        console.log("[Call] onRemoteStream mottatt - tracks:",
          stream.getTracks().map((t) => `${t.kind}:${t.enabled}`));

        // Lagre streamen og re-attach via en effect (kjorer ETTER render, saa
        // <video>/<audio> garantert finnes). Hver ny track bumper tick -> effekten
        // re-setter srcObject, slik at Android WebView plukker opp video-tracken
        // som ankommer etter audio-tracken.
        remoteStreamRef.current = stream;
        setRemoteTick((t) => t + 1);
        setCallState("connected");
        startDurationTimer();
      },
      onStateChange: (state) => {
        console.log("[Call] WebRTC state ->", state);
        if (state === "connected") setCallState("connected");
        // Ikke naviger bort paa "failed" - webrtc.js forsoeker ICE-restart i opptil
        // 8 sek og kaller selv hangup ("ended") hvis det fortsatt feiler. Aa rive
        // ned her ville drepe forbindelsen foer restarten fikk virke.
        if (state === "ended" || state === "closed") {
          stopDurationTimer();
          setCallState("ended");
          // Lengre delay (3s) saa du ser hva som skjedde foer det navigerer bort
          setTimeout(() => navigate(`/chat/${conversationId}`), 3000);
        }
      },
    });

    sessionRef.current = session;

    const setup = async () => {
      try {
        console.log("[Call] setup starter - isAnswering:", isAnswering, "isVideo:", isVideo);
        const localStream = isAnswering
          ? await session.answerCall()
          : await session.startCall();
        console.log("[Call] localStream OK:", localStream);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }
      } catch (err) {
        console.error("[Call] setup feilet:", err);
        let msg = "Could not start the call.";
        if (err.name === "NotReadableError" || err.name === "TrackStartError")
          msg = "Your camera or microphone is in use by another app or browser tab. Close it (e.g. Zoom/Teams/Camera or another TxTt tab) and try again.";
        else if (err.name === "NotAllowedError" || err.name === "SecurityError")
          msg = "Camera/microphone access was denied. Allow access in your browser/app settings and try again.";
        else if (err.name === "NotFoundError" || err.name === "OverconstrainedError")
          msg = "No camera or microphone was found on this device.";
        else if (err.message)
          msg += " (" + err.message + ")";
        alert(msg);
        navigate(`/chat/${conversationId}`);
      }
    };

    setup();

    return () => {
      console.log("[Call] CallRoom unmounter - hangup");
      stopDurationTimer();
      session.hangup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fest remote-stream til elementene ETTER render ──────────
  // Kjorer paa hver remoteTick (ny track ankommer). Re-setting av srcObject
  // tvinger Android WebView til aa vise en video-track som kom etter audioen,
  // og effekten kjorer foerst naar elementene faktisk er montert (ingen ref-race).
  useEffect(() => {
    const stream = remoteStreamRef.current;
    if (!stream) return;

    const v = remoteVideoRef.current;
    if (v) {
      v.muted = true; // lyd gaar via eget audio-element => fri autoplay
      v.srcObject = stream;
      v.play().catch((e) => {
        if (e.name !== "AbortError") console.warn("[Call] video.play():", e.name);
      });
    }

    const a = remoteAudioRef.current;
    if (a) {
      a.srcObject = stream;
      a.play().catch((e) => {
        if (e.name !== "AbortError") console.warn("[Call] audio.play():", e.name);
      });
    }
  }, [remoteTick]);

  // ── DIAGNOSTIKK: logg inbound audio hvert 2. sek (fjernes senere) ──
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const s = await sessionRef.current?.getAudioStats?.();
        if (s) {
          const inn = s.inbound;
          console.log("[Call][stats] conn:", s.conn, "ice:", s.ice,
            "| audio bytes:", inn?.bytesReceived ?? "-",
            "packets:", inn?.packetsReceived ?? "-",
            "level:", inn?.audioLevel ?? "-");
        } else {
          console.log("[Call][stats] ingen pc enda");
        }
      } catch (e) {
        console.warn("[Call][stats] feil:", e?.message ?? e);
      }
    }, 2000);
    return () => clearInterval(id);
  }, []);

  // ── Duration timer ──────────────────────────────────────────
  const startDurationTimer = () => {
    if (durationTimerRef.current) return;
    const start = Date.now();
    durationTimerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - start) / 1000));
    }, 1000);
  };
  const stopDurationTimer = () => {
    clearInterval(durationTimerRef.current);
    durationTimerRef.current = null;
  };

  const formatDuration = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  // ── Controls ────────────────────────────────────────────────
  const handleMute = () => setMuted(sessionRef.current?.toggleMute());
  const handleCamera = () => setCameraOff(sessionRef.current?.toggleCamera());
  const handleSwitchCamera = async () => {
    const stream = await sessionRef.current?.switchCamera();
    // Re-sett lokalt forhaandsbilde til den nye kamera-streamen
    if (stream && localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
  };
  const handleHangup = () => {
    sessionRef.current?.hangup();
    navigate(`/chat/${conversationId}`);
  };

  // ───────────────────────────────────────────────────────────

  return (
    <div className="call-root">

      {/* Skjult audio-element - sikrer at lyd alltid spilles,
          uavhengig av om video-elementet finnes (audio-only) eller virker */}
      {/* Off-screen i stedet for display:none - Android WebView spiller ikke
          av lyd fra et display:none-element. */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
      />

      {/* Remote video (full screen) */}
      <div className="remote-video-container">
        {isVideo ? (
          <video ref={remoteVideoRef} autoPlay playsInline muted className="remote-video" />
        ) : (
          <div className="audio-call-bg">
            <div className="audio-avatar">
              {callerName && callerName !== "Unknown"
                ? callerName[0].toUpperCase()
                : <img src="/default-avatar.png" alt="" />}
            </div>
          </div>
        )}

        {/* Call status overlay */}
        <div className="call-status-overlay">
          <p className="call-peer-name">{callerName}</p>
          <p className="call-status-text">
            {callState === "connecting" && "Connecting…"}
            {callState === "connected" && formatDuration(duration)}
            {callState === "ended" && "Call ended"}
          </p>
        </div>
      </div>

      {/* Local video (picture-in-picture) */}
      {isVideo && (
        <div className="local-video-container">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`local-video ${cameraOff ? "hidden" : ""}`}
          />
          {cameraOff && <div className="camera-off-placeholder">Camera off</div>}
        </div>
      )}

      {/* Controls */}
      <div className="call-controls">
        <button
          className={`call-control-btn ${muted ? "active" : ""}`}
          onClick={handleMute}
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23M12 19v4M8 23h8"/>
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>
            </svg>
          )}
        </button>

        {isVideo && (
          <button
            className={`call-control-btn ${cameraOff ? "active" : ""}`}
            onClick={handleCamera}
            title={cameraOff ? "Turn camera on" : "Turn camera off"}
          >
            {cameraOff ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="1" y1="1" x2="23" y2="23"/>
                <path d="M16 16H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2m4-2h2a2 2 0 0 1 2 2v4m0 4 5 3V8l-5 3"/>
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
              </svg>
            )}
          </button>
        )}

        {isVideo && (
          <button
            className="call-control-btn"
            onClick={handleSwitchCamera}
            title="Switch camera"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 7h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3"/>
              <path d="M8 7l1.5-2h5L16 7"/>
              <path d="M9.5 13.5a2.5 2.5 0 0 1 4.2-1.8M14.5 14.5a2.5 2.5 0 0 1-4.2 1.8"/>
              <path d="M13.5 11h1.2v1.2M10.5 17h-1.2v-1.2"/>
            </svg>
          </button>
        )}

        <button className="call-control-btn hangup" onClick={handleHangup} title="End call">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/>
            <line x1="23" y1="1" x2="1" y2="23"/>
          </svg>
        </button>
      </div>

    </div>
  );
}
