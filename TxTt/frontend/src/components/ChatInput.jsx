import { useState, useRef } from "react";
import { Paperclip, Send, Mic, Square } from "lucide-react";

export default function ChatInput({ onSendMessage, onSendAudio, disabled }) {
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim() || disabled) return;
    onSendMessage(text.trim(), null);
    setText("");
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onSendMessage("", file); 
    if (fileInputRef.current) fileInputRef.current.value = ""; 
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/ogg" });
        onSendAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Kunne ikke starte lydopptak:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <form 
      onSubmit={handleSubmit}
      style={{
        padding: "0 30px", /* God plass på kantene */
        backgroundColor: "#0d0d12",
        borderTop: "1px solid rgba(255, 255, 255, 0.05)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between", /* Fordeler binders, tekstfelt og mikrofon jevnt */
        width: "100%",
        height: "80px",
        boxSizing: "border-box"
      }}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        style={{ display: "none" }} 
        accept="*/*" 
      />
      
      {/* 1. BINDERS (Venstre side) */}
      <div style={{ width: "50px", minWidth: "50px", display: "flex", justifyContent: "flex-start" }}>
        <button 
          type="button" 
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isRecording}
          style={{
            background: "none",
            border: "none",
            color: "#8a8a9e",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "8px"
          }}
        >
          <Paperclip size={24} />
        </button>
      </div>

      {/* 2. TEKSTFELT (Smalere utgave i midten som aldri tar over skjermen) */}
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={isRecording ? "Spiller inn lyd..." : "Type a message..."}
        disabled={disabled || isRecording}
        style={{
          width: "60%", /* FIKS: Gjør skrivelinjen smalere */
          maxWidth: "500px", /* Hindrer at den blir for lang på svære PC-skjermer */
          height: "48px",
          backgroundColor: "#1c1c24",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "24px",
          color: "#ffffff",
          padding: "0 20px",
          fontSize: "1rem",
          outline: "none"
        }}
      />

      {/* 3. MIKROFON / SEND-KNAPP (Høyre side - Nå med massevis av luft!) */}
      <div style={{ width: "50px", minWidth: "50px", display: "flex", justifyContent: "flex-end" }}>
        {text.trim() ? (
          <button 
            type="submit" 
            disabled={disabled}
            style={{
              height: "46px",
              width: "46px",
              backgroundColor: "#34c759",
              border: "none",
              borderRadius: "50%",
              color: "#ffffff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <Send size={20} />
          </button>
        ) : (
          <button 
            type="button" 
            onClick={isRecording ? stopRecording : startRecording}
            disabled={disabled}
            style={{
              background: "none",
              border: "none",
              color: isRecording ? "#ef4444" : "#8a8a9e",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "8px"
            }}
          >
            {isRecording ? <Square size={24} style={{ color: "#ef4444" }} /> : <Mic size={24} />}
          </button>
        )}
      </div>
    </form>
  );
}