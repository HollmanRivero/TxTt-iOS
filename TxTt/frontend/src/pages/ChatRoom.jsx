import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { inviteToCall } from "../lib/webrtc"; 
import { getMessages, sendMessage, sendImageMessage, sendAudioMessage, getRetention, setRetention } from "../lib/messages";
import ChatInput from "../components/ChatInput";
import { Phone, Video, Trash2, ChevronLeft, FileText, Download } from "lucide-react"; 
import "./ChatRoom.css";

export default function ChatRoom() {
  const { conversationId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [peer, setPeer] = useState(null);
  const [loading, setLoading] = useState(!conversationId || conversationId === 'undefined' ? false : true);
  const [showRetentionMenu, setShowRetentionMenu] = useState(false);
  const [retentionHours, setRetentionHours] = useState(null); 

  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!conversationId || conversationId === 'undefined' || !user) {
      return;
    }

    let isMounted = true;

    async function loadChatData() {
      try {
        const data = await getMessages(conversationId, 50);
        if (!isMounted) return;
        setMessages(data || []);

        const hours = await getRetention(conversationId);
        if (!isMounted) return;
        setRetentionHours(hours);

        const { data: members, error: membersError } = await supabase
          .from("conversation_members")
          .select("user_id, profiles(id, full_name, username, avatar_url)")
          .eq("conversation_id", conversationId)
          .neq("user_id", user.id);

        if (membersError) throw membersError;

        if (isMounted && members && members.length > 0) {
          const profileData = members[0].profiles;
          setPeer({
            id: members[0].user_id, 
            full_name: profileData?.full_name,
            username: profileData?.username,
            avatar_url: profileData?.avatar_url
          });
        }
      } catch (err) {
        console.error("Error loading chat:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadChatData();

    const channel = supabase
      .channel(`room:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          if (!isMounted) return;
          if (payload.eventType === "INSERT") {
            setMessages((prev) => {
              if (prev.some((m) => m.id === payload.new.id)) return prev;
              return [...prev, payload.new];
            });
          } else if (payload.eventType === "DELETE") {
            setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [conversationId, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // FIKS: Gjennomgått og sikret at fil og tekst sendes uavhengig av rekkefølge
  const handleSendMessage = async (text, file = null) => {
    if (!user || !conversationId || conversationId === 'undefined') return;
    
    try {
      // Hvis første argument tilfeldigvis er et File-objekt (fordi rekkefølgen ble snudd i komponenten)
      const actualFile = file || (text instanceof File ? text : null);
      const actualText = text instanceof File ? "" : text;

      if (actualFile) {
        console.log("[ChatRoom] Starter opplasting av fil:", actualFile.name);
        const newFileMsg = await sendImageMessage(conversationId, user.id, actualFile);
        if (newFileMsg) {
          setMessages((prev) => [...prev, newFileMsg]);
          console.log("[ChatRoom] Fil lastet opp og sendt suksessfullt!");
        }
      } else if (actualText && typeof actualText === "string" && actualText.trim()) {
        const newTxtMsg = await sendMessage(conversationId, user.id, actualText.trim());
        if (newTxtMsg) setMessages((prev) => [...prev, newTxtMsg]);
      }
    } catch (err) {
      console.error("[ChatRoom] Kunne ikke sende melding eller laste opp fil:", err);
    }
  };

  const handleSendAudio = async (audioBlob) => {
    if (!user || !conversationId || conversationId === 'undefined') return;
    try {
      const newAudioMsg = await sendAudioMessage(conversationId, user.id, audioBlob);
      if (newAudioMsg) setMessages((prev) => [...prev, newAudioMsg]);
    } catch (err) {
      console.error("Failed to send audio message:", err);
    }
  };

  const handleUpdateRetention = async (hours) => {
    if (!conversationId || conversationId === 'undefined') return;
    setRetentionHours(hours);
    setShowRetentionMenu(false);

    if (hours === 0) {
      setMessages([]); 
    }

    try {
      await setRetention(conversationId, hours);
      if (hours === 0) {
        await supabase.from("messages").delete().eq("conversation_id", conversationId);
      }
    } catch (err) {
      console.error("Failed to update retention:", err);
    }
  };

  const initiateCall = async (isVideoCall) => {
    if (!user || !peer || !conversationId || conversationId === 'undefined') return;
    try {
      const myName = user.profile?.full_name || user.profile?.username || user.email || "TxTt User";
      await inviteToCall({
        targetUserId: peer.id,
        conversationId,
        callerId: user.id,
        callerName: myName,
        isVideo: isVideoCall
      });

      navigate(`/call/${conversationId}`, {
        state: { 
          isVideo: isVideoCall, 
          isAnswering: false, 
          callerName: peer.full_name || peer.username || "Contact" 
        }
      });
    } catch (err) {
      console.error("Call initialization failed:", err);
    }
  };

  const getFileName = (url) => {
    if (!url) return "Shared File";
    try {
      const cleanUrl = url.split('?')[0];
      const parts = cleanUrl.split("/");
      const lastPart = parts[parts.length - 1] || "Document";
      return lastPart.includes("_") ? lastPart.split("_").slice(1).join("_") : lastPart;
    } catch {
      return "Document";
    }
  };

  return (
    <div className="chat-root" style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw", overflow: "hidden", position: "relative", backgroundColor: "rgb(11, 11, 15)", color: "#ffffff" }}>
      {/* HEADER */}
      <header className="chat-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", height: "70px", padding: "0 16px", borderBottom: "1px solid rgba(255,255,255,0.05)", boxSizing: "border-box", zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", flex: 1 }}>
          <button className="back-btn" onClick={() => navigate("/")} style={{ marginRight: "8px", background: "none", border: "none", color: "#fff", cursor: "pointer" }}>
            <ChevronLeft size={24} />
          </button>
          <div className="avatar sm" style={{ width: "36px", height: "36px", borderRadius: "50%", backgroundColor: "#1f1f2e", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "600", color: "#ffffff" }}>
            {peer?.avatar_url ? (
              <img src={peer.avatar_url} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
            ) : (
              (peer?.full_name || peer?.username || "?")[0].toUpperCase()
            )}
          </div>
          <span className="chat-header-name" style={{ marginLeft: "10px", fontSize: "0.95rem", fontWeight: 500, color: "#ffffff" }}>
            {peer?.full_name || peer?.username || "Loading..."}
          </span>
        </div>

        <div className="chat-header-actions" style={{ position: "relative", display: "flex", gap: "12px", alignItems: "center" }}>
          <button className="icon-btn" onClick={() => initiateCall(false)} title="Audio Call" type="button" style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: "6px" }}>
            <Phone size={20} />
          </button>
          <button className="icon-btn" onClick={() => initiateCall(true)} title="Video Call" type="button" style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: "6px" }}>
            <Video size={20} />
          </button>
          
          <button className="icon-btn" onClick={() => setShowRetentionMenu(!showRetentionMenu)} title="Auto-delete settings" type="button" style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: "6px", display: "flex", alignItems: "center", gap: "4px" }}>
            <Trash2 size={20} />
            <span className="retention-badge" style={{ fontSize: "0.75rem", opacity: 0.8, color: "#ffffff" }}>
              {retentionHours === 0 ? "🔥" : retentionHours === null ? "♾️" : `${retentionHours}h`}
            </span>
          </button>
          
          {showRetentionMenu && (
            <div className="retention-menu" style={{ position: "absolute", top: "100%", right: 0, zIndex: 100, background: "#121218", border: "1px solid #232330", borderRadius: "12px", padding: "8px", display: "flex", flexDirection: "column", minWidth: "160px" }}>
              <p className="retention-title font-bold" style={{ margin: "4px 8px", fontSize: "0.75rem", color: "#888" }}>Auto-delete history</p>
              <button type="button" className={`retention-option ${retentionHours === 0 ? "active" : ""}`} onClick={() => handleUpdateRetention(0)}>🔥 Delete instantly</button>
              <button type="button" className={`retention-option ${retentionHours === 24 ? "active" : ""}`} onClick={() => handleUpdateRetention(24)}>🕒 24 Hours</button>
              <button type="button" className={`retention-option ${retentionHours === 168 ? "active" : ""}`} onClick={() => handleUpdateRetention(168)}>🗓️ 7 Days</button>
              <button type="button" className={`retention-option ${retentionHours === null ? "active" : ""}`} onClick={() => handleUpdateRetention(null)}>♾️ Keep forever</button>
            </div>
          )}
        </div>
      </header>

      {/* MELDINGSLISTE */}
      <div className="chat-messages" style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px", boxSizing: "border-box" }}>
        {loading ? (
          <div className="chat-loading" style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}><div className="spinner-lg" /></div>
        ) : messages.length === 0 ? (
          <div className="chat-empty" style={{ textAlign: "center", color: "#666", marginTop: "20px" }}>No messages yet. Say hello!</div>
        ) : (
          messages.map((msg, index) => {
            const isOwn = msg.sender_id === user.id;
            const cleanUrlPath = msg.file_url ? msg.file_url.toLowerCase().split('?')[0] : "";
            const contentString = typeof msg.content === "string" ? msg.content : "";
            
            const isBase64Image = contentString.startsWith("data:image");
            
            const isImage = isBase64Image || (msg.file_url && (
              cleanUrlPath.endsWith(".png") ||
              cleanUrlPath.endsWith(".jpg") ||
              cleanUrlPath.endsWith(".jpeg") ||
              cleanUrlPath.endsWith(".gif") ||
              cleanUrlPath.endsWith(".webp") ||
              msg.message_type === "image"
            ));

            const isAudio = msg.file_url && (
              cleanUrlPath.endsWith(".ogg") ||
              cleanUrlPath.endsWith(".mp3") ||
              cleanUrlPath.endsWith(".wav") ||
              msg.message_type === "audio"
            );

            const imageSrc = isBase64Image ? contentString : msg.file_url;

            return (
              <div key={msg.id || index} className={`msg-row ${isOwn ? "own" : "other"}`} style={{ display: "flex", justifyContent: isOwn ? "flex-end" : "flex-start", width: "100%" }}>
                <div className="msg-col" style={{ maxWidth: "70%" }}>
                  
                  {contentString && !isBase64Image && !contentString.includes("[object Object]") && (
                    <div className={`bubble ${isOwn ? "bubble-own" : "bubble-other"}`} style={{ color: "#ffffff" }}>
                      {msg.content}
                    </div>
                  )}
                  
                  {isImage && imageSrc && (
                    <div className="bubble bubble-media" style={{ padding: "4px", background: "none" }}>
                      <img src={imageSrc} alt="Shared attachment" className="msg-image" style={{ maxWidth: "220px", maxHeight: "200px", borderRadius: "12px", display: "block", objectFit: "cover" }} />
                    </div>
                  )}

                  {msg.file_url && !isImage && !isAudio && (
                    <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className={`bubble ${isOwn ? "bubble-own" : "bubble-other"}`} style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none", color: "#ffffff" }}>
                      <FileText size={24} style={{ color: isOwn ? "#fff" : "var(--primary)" }} />
                      <div style={{ textAlign: "left", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <p style={{ fontSize: "0.85rem", fontWeight: "500", margin: 0 }}>{getFileName(msg.file_url)}</p>
                        <p style={{ fontSize: "0.7rem", opacity: 0.6, margin: 0 }}>Click to download</p>
                      </div>
                      <Download size={16} style={{ marginLeft: "auto", opacity: 0.8 }} />
                    </a>
                  )}

                  {msg.file_url && isAudio && (
                    <div className="bubble bubble-audio">
                      <audio src={msg.file_url} controls className="msg-audio" />
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT-FELT */}
      <div style={{ width: "100%", height: "80px", minHeight: "80px", boxSizing: "border-box", zIndex: 10 }}>
        <ChatInput onSendMessage={handleSendMessage} onSendAudio={handleSendAudio} disabled={loading} />
      </div>
    </div>
  );
}