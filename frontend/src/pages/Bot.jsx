import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import {
  searchUsers,
  getMessages,
  sendMessage,
  startConversation,
  updateProfile,
  getProfile,
} from "../lib/messages";
import "./Bot.css";

// ── Conversation helpers ──────────────────────────────────────────────────────

/** Best-match contact lookup by name / username / phone */
async function resolveContact(name) {
  const results = await searchUsers(name);
  return results?.[0] ?? null;
}

/** Find an existing 1:1 conversation between two users (no creation) */
async function findConversation(myId, otherId) {
  const { data: mine } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", myId);

  const myConvIds = (mine ?? []).map((r) => r.conversation_id);
  if (!myConvIds.length) return null;

  const { data: shared } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", otherId)
    .in("conversation_id", myConvIds);

  return shared?.[0]?.conversation_id ?? null;
}

/** Find or create a conversation with another user */
async function findOrStartConversation(myId, otherId) {
  const existing = await findConversation(myId, otherId);
  if (existing) return existing;
  const conv = await startConversation(myId, otherId);
  return conv.id;
}

/** Search the user's own messages by keyword (RLS limits to their conversations) */
async function searchMyMessages(myId, query) {
  const { data: mine } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", myId);

  const ids = (mine ?? []).map((r) => r.conversation_id);
  if (!ids.length) return [];

  const { data } = await supabase
    .from("messages")
    .select("content, created_at, conversation_id, sender_id")
    .in("conversation_id", ids)
    .ilike("content", `%${query}%`)
    .limit(20);

  return data ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Bot() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Anthropic-format conversation (sent to the Edge Function)
  const [apiMessages, setApiMessages] = useState([]);
  // Visible chat log (bubbles)
  const [log, setLog] = useState([
    { role: "bot", text: "Hi! I'm your TxTt assistant. Ask me to send a message, start a call, search your chats, or change a setting." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(null); // { working, toolUses }

  const scrollRef = useRef(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [log, loading, pending]);

  const append = (role, text) => setLog((l) => [...l, { role, text }]);

  // ── Call the Edge Function ────────────────────────────────────────────────
  const callBot = async (messages) => {
    const { data, error } = await supabase.functions.invoke("bot", {
      body: { messages },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data; // { content, stop_reason }
  };

  // ── Execute one tool against Supabase ─────────────────────────────────────
  const executeTool = async ({ name, input }) => {
    switch (name) {
      case "list_contacts": {
        const results = await searchUsers(input.query ?? "");
        return results.map((r) => ({
          name: r.full_name,
          username: r.username,
        }));
      }
      case "search_messages": {
        const found = await searchMyMessages(user.id, input.query);
        return found.map((m) => ({
          text: m.content,
          at: m.created_at,
          mine: m.sender_id === user.id,
        }));
      }
      case "get_history": {
        const contact = await resolveContact(input.contact);
        if (!contact) return { error: `No contact found matching "${input.contact}".` };
        const convId = await findConversation(user.id, contact.id);
        if (!convId) return { messages: [], note: "No conversation with this contact yet." };
        const msgs = await getMessages(convId, input.limit ?? 20);
        return msgs.map((m) => ({
          from: m.sender_id === user.id ? "me" : (contact.full_name || contact.username),
          text: m.content,
          at: m.created_at,
        }));
      }
      case "send_message": {
        const contact = await resolveContact(input.contact);
        if (!contact) return { error: `No contact found matching "${input.contact}".` };
        const convId = await findOrStartConversation(user.id, contact.id);
        await sendMessage(convId, user.id, input.text);
        return { sent: true, to: contact.full_name || contact.username, text: input.text };
      }
      case "start_call": {
        const contact = await resolveContact(input.contact);
        if (!contact) return { error: `No contact found matching "${input.contact}".` };
        const convId = await findOrStartConversation(user.id, contact.id);
        navigate(`/call/${convId}`);
        return { calling: contact.full_name || contact.username, kind: input.kind };
      }
      case "update_setting": {
        await updateProfile(user.id, { [input.setting]: input.value });
        return { updated: input.setting, value: input.value };
      }
      case "set_away_mode": {
        const on = Boolean(input.on);
        await updateProfile(user.id, { away_mode: on });
        return { away_mode: on, message: on ? "Away mode turned ON" : "Away mode turned OFF" };
      }
      case "get_my_profile": {
        const p = await getProfile(user.id);
        return {
          full_name:    p.full_name    ?? null,
          username:     p.username     ?? null,
          phone:        p.phone        ?? null,
          away_mode:    p.away_mode    ?? false,
          whatsapp_url: p.whatsapp_url ?? null,
        };
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  };

  const needsConfirm = (t) => t.name === "send_message" || t.name === "start_call";

  // ── Agentic loop ──────────────────────────────────────────────────────────
  const runConversation = async (messages) => {
    setLoading(true);
    try {
      let working = messages;

      while (true) {
        const res = await callBot(working);
        working = [...working, { role: "assistant", content: res.content }];

        // Show any text the bot returned
        const text = res.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        if (text) append("bot", text);

        if (res.stop_reason !== "tool_use") {
          setApiMessages(working);
          break;
        }

        const toolUses = res.content.filter((b) => b.type === "tool_use");

        // If any tool needs confirmation, pause and ask the user
        if (toolUses.some(needsConfirm)) {
          setApiMessages(working);
          setPending({ working, toolUses });
          setLoading(false);
          return;
        }

        // Otherwise run read-only tools immediately and loop
        const results = [];
        for (const t of toolUses) {
          const out = await executeTool(t);
          results.push({
            type: "tool_result",
            tool_use_id: t.id,
            content: JSON.stringify(out),
          });
        }
        working = [...working, { role: "user", content: results }];
      }
    } catch (e) {
      append("system", "⚠️ " + (e.message || "Something went wrong."));
    } finally {
      setLoading(false);
    }
  };

  // ── Resume after a confirmation decision ──────────────────────────────────
  const resolvePending = async (approved) => {
    if (!pending) return;
    const { working, toolUses } = pending;
    setPending(null);
    setLoading(true);

    try {
      const results = [];
      for (const t of toolUses) {
        let out;
        if (needsConfirm(t) && !approved) {
          out = { cancelled: true, note: "User declined this action." };
        } else {
          out = await executeTool(t);
        }
        results.push({
          type: "tool_result",
          tool_use_id: t.id,
          content: JSON.stringify(out),
        });
      }
      if (approved) {
        const t0 = toolUses.find(needsConfirm);
        if (t0?.name === "send_message") append("action", `✓ Sent to ${t0.input.contact}`);
        if (t0?.name === "start_call")   append("action", `✓ Calling ${t0.input.contact}…`);
      } else {
        append("action", "✗ Cancelled");
      }
      await runConversation([...working, { role: "user", content: results }]);
    } catch (e) {
      append("system", "⚠️ " + (e.message || "Error"));
      setLoading(false);
    }
  };

  // ── Send a typed message ──────────────────────────────────────────────────
  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading || pending) return;
    setInput("");
    append("me", text);
    const next = [...apiMessages, { role: "user", content: text }];
    setApiMessages(next);
    await runConversation(next);
  };

  // ── Confirmation card content ─────────────────────────────────────────────
  const renderConfirmCard = () => {
    const t = pending.toolUses.find(needsConfirm);
    if (!t) return null;
    return (
      <div className="bot-confirm">
        {t.name === "send_message" ? (
          <>
            <p className="confirm-title">Send this message?</p>
            <p className="confirm-detail"><strong>To:</strong> {t.input.contact}</p>
            <p className="confirm-detail confirm-body">"{t.input.text}"</p>
          </>
        ) : (
          <>
            <p className="confirm-title">Start this call?</p>
            <p className="confirm-detail">
              <strong>{t.input.kind === "video" ? "Video" : "Audio"} call</strong> with {t.input.contact}
            </p>
          </>
        )}
        <div className="confirm-actions">
          <button className="confirm-cancel" onClick={() => resolvePending(false)}>Cancel</button>
          <button className="confirm-ok" onClick={() => resolvePending(true)}>
            {t.name === "send_message" ? "Send" : "Call"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="bot-root">
      <header className="bot-header">
        <button className="back-btn" onClick={() => navigate("/")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </button>
        <h1 className="bot-title">Assistant</h1>
      </header>

      <div className="bot-log" ref={scrollRef}>
        {log.map((m, i) => (
          <div key={i} className={`bot-bubble ${m.role}`}>{m.text}</div>
        ))}

        {loading && (
          <div className="bot-bubble bot typing">
            <span /><span /><span />
          </div>
        )}

        {pending && renderConfirmCard()}
      </div>

      <div className="bot-input-bar">
        <input
          className="bot-input"
          type="text"
          placeholder={pending ? "Confirm the action above first…" : "Ask your assistant…"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          disabled={loading || !!pending}
        />
        <button className="bot-send" onClick={handleSend} disabled={loading || !!pending || !input.trim()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
