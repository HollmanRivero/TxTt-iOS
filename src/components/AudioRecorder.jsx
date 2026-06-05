import { useEffect, useRef, useState } from "react";
import "./AudioRecorder.css";

/**
 * AudioRecorder
 * Hold the mic button to record, release to get the audio blob.
 * Props:
 *   onRecorded(blob) — called when user releases and recording is > 1s
 *   onCancel()       — called when recording is too short (< 1s)
 */
export default function AudioRecorder({ onRecorded, disabled }) {
  const [state, setState] = useState("idle"); // idle | recording | processing
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  // ── Cleanup on unmount ──────────────────────────────────────
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // ── Start recording ─────────────────────────────────────────
  const startRecording = async () => {
    if (disabled || state !== "idle") return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(100); // collect data every 100ms
      startTimeRef.current = Date.now();
      setState("recording");
      setDuration(0);

      // Tick duration counter
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 500);

    } catch (err) {
      console.error("Microphone access denied:", err);
      alert("Microphone access is required to send audio messages.");
    }
  };

  // ── Stop recording ──────────────────────────────────────────
  const stopRecording = () => {
    if (state !== "recording") return;

    clearInterval(timerRef.current);
    setState("processing");

    const elapsed = Date.now() - startTimeRef.current;
    const recorder = mediaRecorderRef.current;

    recorder.onstop = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());

      if (elapsed < 1000) {
        // Too short — ignore
        setState("idle");
        setDuration(0);
        return;
      }

      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      setState("idle");
      setDuration(0);
      onRecorded(blob);
    };

    recorder.stop();
  };

  // ── Touch and mouse events ──────────────────────────────────
  const handleMouseDown = (e) => { e.preventDefault(); startRecording(); };
  const handleMouseUp   = (e) => { e.preventDefault(); stopRecording(); };
  const handleTouchStart = (e) => { e.preventDefault(); startRecording(); };
  const handleTouchEnd   = (e) => { e.preventDefault(); stopRecording(); };

  const isRecording = state === "recording";

  return (
    <div className="audio-recorder">
      {isRecording && (
        <div className="recording-indicator">
          <span className="rec-dot" />
          <span className="rec-time">{duration}s</span>
          <span className="rec-hint">Release to send</span>
        </div>
      )}

      <button
        className={`mic-btn ${isRecording ? "recording" : ""}`}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        disabled={disabled}
        title="Hold to record"
        type="button"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>
        </svg>
      </button>
    </div>
  );
}
