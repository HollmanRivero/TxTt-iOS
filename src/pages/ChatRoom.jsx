import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  getMessages, sendMessage, subscribeToMessages,
  sendImageMessage, sendAudioMessage,
  getRetention, setRetention,
} from "../lib/messages";
import { supabase } from "../lib/supabase";
import { inviteToCall } from "../lib/webrtc";
import AudioRecorder from "../components/AudioRecorder";
import "./ChatRoom.css";

export default function ChatRoom() {
  const { conversationId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [otherUser, setOtherUser] = useState(null);
  const [imagePreview, setImagePreview] = useState(null); // { file, url }
  const [retentionHours, setRetentionHoursState] = useState(null); // null = never
  const [retentionMenuOpen, setRetentionMenuOpen] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  // ── Load messages ───────────────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    getMessages(conversationId)
      .then(setMessages)
      .catch(console.error)
      .finally(() => setLoading(false));

    supabase
      .from("conversation_members")
      .select("profiles!conversation_members_user_id_fkey(id, full_name, username, avatar_url)")
      .eq("conversation_id", conversationId)
      .neq("user_id", user?.id)
      .single()
      .then(({ data }) => setOtherUser(data?.profiles))
      .catch(console.error);

    // Last retention-innstillingen
    getRetention(conversationId)
      .then(setRetentionHoursState)
      .catch(console.error);
  }, [conversationId, user]);

  // ── Endre retention ─────────────────────────────────────────
  const handleSetRetention = async (hours) => {
    try {
      await setRetention(conversationId, hours);
      setRetentionHoursState(hours);
      setRetentionMenuOpen(false);
    } catch (err) {
      console.error("Failed to set retention:", err);
    }
  };

  const retentionLabel = (h) => {
    if (h === null || h === undefined) return "Never";
    return `${h}h`;
  };

  // ── Real-time subscription ──────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    const channel = subscribeToMessages(conversationId, (newMsg) => {
      setMessages((prev) => {
        if (prev.find((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
    });
    return () => supabase.removeChannel(channel);
  }, [conversationId]);

  // ── Scroll to bottom ────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send text ───────────────────────────────────────────────
  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setInput("");
    setSending(true);

    const tempMsg = {
      id: `temp-${Date.now()}`,
      content, sender_id: user.id,
      message_type: "text",
      created_at: new Date().toISOString(),
      _optimistic: true,
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      const saved = await sendMessage(conversationId, user.id, content);
      setMessages((prev) => prev.map((m) => m.id === tempMsg.id ? saved : m));
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
      setInput(content);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  // ── Send image ──────────────────────────────────────────────
  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImagePreview({ file, url });
  };

  const handleImageSend = async () => {
    if (!imagePreview || sending) return;
    setSending(true);

    const tempMsg = {
      id: `temp-${Date.now()}`,
      file_url: imagePreview.url,
      sender_id: user.id,
      message_type: "image",
      created_at: new Date().toISOString(),
      _optimistic: true,
    };
    setMessages((prev) => [...prev, tempMsg]);
    setImagePreview(null);

    try {
      const saved = await sendImageMessage(conversationId, user.id, imagePreview.file);
      setMessages((prev) => prev.map((m) => m.id === tempMsg.id ? saved : m));
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── Send audio ──────────────────────────────────────────────
  const handleAudioRecorded = async (blob) => {
    setSending(true);

    const tempUrl = URL.createObjectURL(blob);
    const tempMsg = {
      id: `temp-${Date.now()}`,
      file_url: tempUrl,
      sender_id: user.id,
      message_type: "audio",
      created_at: new Date().toISOString(),
      _optimistic: true,
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      const saved = await sendAudioMessage(conversationId, user.id, blob);
      setMessages((prev) => prev.map((m) => m.id === tempMsg.id ? saved : m));
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── Start a call ────────────────────────────────────────────
  const handleStartCall = async (isVideo) => {
    console.log("[Call] handleStartCall klikket, isVideo:", isVideo, "otherUser:", otherUser);

    if (!otherUser) {
      alert("Kan ikke starte anrop: motpartens profil er ikke lastet (otherUser er null). Sjekk at SQL-fiks for members_read er kjoert.");
      return;
    }

    const myName =
      user.user_metadata?.full_name || user.email || user.phone || "Someone";

    try {
      // Naviger FOERST, sa inviteToCall ikke hindrer det hvis realtime henger
      navigate(`/call/${conversationId}`, {
        state: {
          isVideo,
          isAnswering: false,
          callerName: otherUser.full_name || otherUser.username || "Unknown",
        },
      });

      // Send invite med timeout (5 sek) - hindrer evig hang hvis realtime ikke svarer
      await Promise.race([
        inviteToCall({
          targetUserId: otherUser.id,
          conversationId,
          callerId: user.id,
          callerName: myName,
          isVideo,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("inviteToCall timed out etter 5 sek")), 5000)
        ),
      ]);
      console.log("[Call] Invite sendt");
    } catch (err) {
      console.error("[Call] Feil under inviteToCall:", err);
      alert("Feil under anrop: " + err.message);
    }
  };

  const formatTime = (ts) =>
    new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const isOwn = (msg) => msg.sender_id === user?.id;
  const getInitial = (name) =>
    name ? name[0].toUpperCase() : <img src="/default-avatar.png" alt="" />;

  const grouped = messages.map((msg, i) => ({
    ...msg,
    showAvatar: !isOwn(msg) && (i === 0 || messages[i - 1].sender_id !== msg.sender_id),
    showTime: i === messages.length - 1 || messages[i + 1].sender_id !== msg.sender_id,
  }));

  return (
    <div className="chat-root">

      {/* Header */}
      <header className="chat-header">
        <button className="back-btn icon-btn" onClick={() => navigate("/")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </button>
        <div className="chat-header-user">
          <div className="avatar sm">
            <img src="/default-avatar.png" alt="" />
          </div>
          <p className="chat-header-name">
            {otherUser?.full_name || otherUser?.username || "…"}
          </p>
        </div>

        {/* Call buttons + retention */}
        <div className="chat-header-actions">
          {/* Auto-delete (retention) */}
          <div className="retention-wrapper">
            <button
              className="icon-btn"
              onClick={() => setRetentionMenuOpen((o) => !o)}
              title={`Auto-delete: ${retentionLabel(retentionHours)}`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              {retentionHours !== null && retentionHours !== undefined && (
                <span className="retention-badge">{retentionHours}h</span>
              )}
            </button>
            {retentionMenuOpen && (
              <div className="retention-menu">
                <p className="retention-title">Auto-delete messages</p>
                <button
                  className={`retention-option ${retentionHours === null ? "active" : ""}`}
                  onClick={() => handleSetRetention(null)}
                >Never</button>
                <button
                  className={`retention-option ${retentionHours === 6 ? "active" : ""}`}
                  onClick={() => handleSetRetention(6)}
                >After 6 hours</button>
                <button
                  className={`retention-option ${retentionHours === 12 ? "active" : ""}`}
                  onClick={() => handleSetRetention(12)}
                >After 12 hours</button>
                <button
                  className={`retention-option ${retentionHours === 24 ? "active" : ""}`}
                  onClick={() => handleSetRetention(24)}
                >After 24 hours</button>
              </div>
            )}
          </div>

          <button
            className="icon-btn"
            onClick={() => handleStartCall(false)}
            title="Audio call"
            disabled={!otherUser}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </button>
          <button
            className="icon-btn"
            onClick={() => handleStartCall(true)}
            title="Video call"
            disabled={!otherUser}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="chat-messages">
        {loading && <div className="chat-loading"><div className="spinner-lg" /></div>}
        {!loading && messages.length === 0 && (
          <div className="chat-empty"><p>Say hello 👋</p></div>
        )}

        {grouped.map((msg) => (
          <div key={msg.id} className={`msg-row ${isOwn(msg) ? "own" : "other"}`}>
            {!isOwn(msg) && (
              <div className={`avatar xs ${msg.showAvatar ? "" : "invisible"}`}>
                {otherUser?.avatar_url
                  ? <img src={otherUser.avatar_url} alt="" />
                  : getInitial(otherUser?.full_name || otherUser?.username)}
              </div>
            )}

            <div className="msg-col">
              {/* Text bubble */}
              {(!msg.message_type || msg.message_type === "text") && (
                <div className={`bubble ${isOwn(msg) ? "bubble-own" : "bubble-other"} ${msg._optimistic ? "optimistic" : ""}`}>
                  {msg.content}
                </div>
              )}

              {/* Image bubble */}
              {msg.message_type === "image" && (
                <div className={`bubble bubble-media ${isOwn(msg) ? "bubble-own" : "bubble-other"} ${msg._optimistic ? "optimistic" : ""}`}>
                  <img
                    src={msg.file_url}
                    alt="shared image"
                    className="msg-image"
                    onClick={() => window.open(msg.file_url, "_blank")}
                  />
                </div>
              )}

              {/* Audio bubble */}
              {msg.message_type === "audio" && (
                <div className={`bubble bubble-audio ${isOwn(msg) ? "bubble-own" : "bubble-other"} ${msg._optimistic ? "optimistic" : ""}`}>
                  <audio controls src={msg.file_url} className="msg-audio" />
                </div>
              )}

              {msg.showTime && (
                <span className="msg-time">{formatTime(msg.created_at)}</span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Image preview bar */}
      {imagePreview && (
        <div className="image-preview-bar">
          <img src={imagePreview.url} alt="preview" className="preview-thumb" />
          <div className="preview-actions">
            <span className="preview-label">Send this image?</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="preview-btn cancel" onClick={() => setImagePreview(null)}>Cancel</button>
              <button className="preview-btn send" onClick={handleImageSend} disabled={sending}>
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="chat-input-bar">
        {/* Image picker */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleImageSelect}
        />
        <button
          className="icon-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending || !!imagePreview}
          title="Send image"
          type="button"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </button>

        {/* Text input */}
        <textarea
          ref={inputRef}
          className="chat-textarea"
          placeholder="Message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={sending}
        />

        {/* Send or mic */}
        {input.trim() ? (
          <button
            className="send-btn active"
            onClick={handleSend}
            disabled={sending}
            type="button"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m22 2-7 20-4-9-9-4 20-7z"/><path d="M22 2 11 13"/>
            </svg>
          </button>
        ) : (
          <AudioRecorder onRecorded={handleAudioRecorded} disabled={sending} />
        )}
      </div>

    </div>
  );
}
