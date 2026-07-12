import { useEffect, useRef, useState } from "react";
import "./index.css";
import { pickStarterQueries, getAutoSuggestions } from "./suggestedQueries";
import { AUTOSUGGEST_DEBOUNCE_MS } from "./config/suggestedQueries.config";

function wsUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/chat`;
}

const STORAGE_KEY = "simple-chat-messages";

function loadStoredMessages() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((m) => (m.streaming ? { ...m, streaming: false } : m));
  } catch {
    return [];
  }
}

const STATUS_LABEL = {
  connected: "Connected",
  answering: "Answering…",
  reconnecting: "Reconnecting…",
  connecting: "Connecting…",
};

export default function App() {
  const [messages, setMessages] = useState(loadStoredMessages);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("connecting");
  const wsRef = useRef(null);
  const messagesEndRef = useRef(null);
  const reconnectTimer = useRef(null);
  const textareaRef = useRef(null);
  const [starterQueries, setStarterQueries] = useState(() => pickStarterQueries());
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [debouncedInput, setDebouncedInput] = useState("");

  useEffect(() => {
    connect();
    return () => {
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
      clearTimeout(reconnectTimer.current);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedInput(input), AUTOSUGGEST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  function connect() {
    const ws = new WebSocket(wsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      setStatus("connected");
    };
    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      setStatus("reconnecting");
      reconnectTimer.current = setTimeout(connect, 1500);
    };
    ws.onerror = () => ws.close();

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return;
      const data = JSON.parse(event.data);
      handleServerEvent(data);
    };
  }

  function handleServerEvent(data) {
    if (data.type === "token") {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        next[next.length - 1] = { ...last, text: last.text + data.text };
        return next;
      });
    } else if (data.type === "done") {
      setStatus("connected");
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { ...next[next.length - 1], streaming: false };
        return next;
      });
    } else if (data.type === "error") {
      setStatus("connected");
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          ...next[next.length - 1],
          streaming: false,
          error: data.message,
        };
        return next;
      });
    }
  }

  function send(message) {
    const trimmed = message.trim();
    if (
      !trimmed ||
      !wsRef.current ||
      wsRef.current.readyState !== WebSocket.OPEN
    )
      return;

    setMessages((prev) => [
      ...prev,
      { role: "user", text: trimmed },
      { role: "assistant", text: "", streaming: true },
    ]);
    setStatus("answering");
    setInput("");
    wsRef.current.send(JSON.stringify({ message: trimmed }));
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  function newChat() {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
    setStarterQueries(pickStarterQueries());
    clearTimeout(reconnectTimer.current);
    wsRef.current?.close();
    setStatus("connecting");
    connect();
  }

  function pickSuggestion(query) {
    setInput(query);
    setShowSuggestions(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  const isBusy = status === "connecting" || status === "reconnecting";
  const autoSuggestions = getAutoSuggestions(debouncedInput, starterQueries);

  return (
    <div className="chat-view">
      <div className="header-bar">
        <div className="header-left">
          <div className="app-logo">✦</div>
          <div>
            <h1 className="app-title">LLM Chat Interface</h1>
            <div className={`status-pill ${status}`}>
              <span className="status-dot" />
              {STATUS_LABEL[status]}
            </div>
          </div>
        </div>
        <button className="btn btn-secondary" onClick={newChat} disabled={isBusy}>
          New Chat
        </button>
      </div>

      <div className="messages">
        {messages.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">✦</div>
            <h2>Simple Chat</h2>
            <p>Chat directly with the LLM. No documents, no retrieval.</p>
            <div className="starter-queries">
              {starterQueries.map((q) => (
                <button key={q} className="starter-chip" onClick={() => send(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`row ${m.role}`}>
            <div className="avatar">{m.role === "user" ? "You" : "AI"}</div>
            <div className={`bubble ${m.role}`}>
              {m.text}
              {m.streaming && <span className="cursor" />}
              {m.error && <div className="error-text">{m.error}</div>}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="composer-wrap">
        {showSuggestions && autoSuggestions.length > 0 && (
          <div className="suggestions">
            {autoSuggestions.map((q) => (
              <button
                key={q}
                className="suggestion-item"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickSuggestion(q)}
              >
                {q}
              </button>
            ))}
          </div>
        )}
        <div className="composer">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setShowSuggestions(false)}
            onKeyDown={onKeyDown}
            placeholder="Message the assistant…"
            rows={1}
          />
          <button
            className="btn btn-primary"
            onClick={() => send(input)}
            disabled={status !== "connected" || !input.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
