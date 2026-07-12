# Simple LLM Chat App

A minimal, streaming chat interface talking directly to an LLM — no documents, no
retrieval, no tools. It exists as a clean starting point: a small, well-understood
skeleton you can grow into a RAG pipeline, an agentic system, or an MCP-connected
assistant without fighting inherited complexity.

```
SIMPLE-LLM-CHAT-APP/
├── frontend/          React + Vite chat UI
└── node-backend/      Express + ws backend, LLM service wrapper
```

## Running it

**Backend**
```bash
cd node-backend
cp .env.example .env   # fill in OPENAI_API_KEY
npm install
npm run dev             # nodemon, listens on :8100
```

**Frontend**
```bash
cd frontend
npm install
npm run dev              # vite, listens on 127.0.0.1:5173
```

The frontend proxies `/api/*` (including the WebSocket) to the backend — see
`frontend/vite.config.js`.

## Key decisions

**WebSocket over HTTP streaming (SSE).** Chat is bidirectional over time (the user
sends messages, the server streams tokens back) and a single long-lived connection
per browser tab keeps this simple: one `wss.on("connection")` handler owns a
conversation's history for the lifetime of the tab. `node-backend/server.js:24-25`.

**Conversation history lives in memory, per-connection.** `history` is a closure
variable inside the `connection` handler, not a database row. This is deliberately
disposable — closing the socket drops it. It's the right amount of state for a
single-session demo; a real product would move this to a session store or DB
(see "Growing this into RAG" below).

**LLM access is isolated behind a service class**, not called directly from the
WebSocket handler. `node-backend/services/llmService.js` wraps the OpenAI SDK
and is configured entirely through environment variables:
- `LLM_MODEL`, `LLM_TEMPERATURE`, `LLM_SYSTEM_PROMPT`, `OPENAI_BASE_URL`

Swapping models, providers, or pointing at a local/self-hosted OpenAI-compatible
endpoint (vLLM, Ollama, LM Studio, Azure OpenAI) means changing `.env`, not code.
The server code (`server.js`) never imports `openai` directly — it only knows
about `LLMService`.

**`LLMService.streamChat()` already has a context-injection seam.** It accepts
an optional `{ context }` and folds it into the system prompt ahead of the
conversation history (`buildMessages`). This is intentionally the exact shape a
retriever's output should take — see below.

**Token streaming end-to-end.** The backend streams OpenAI's chat-completion
deltas straight to the browser as `{"type":"token","text":...}` WebSocket
frames; the frontend appends them to the last message as they arrive. No
buffering, no waiting for the full response.

**Client-side persistence via `localStorage`**, not a database. Chat history is
a UX nicety for reloads, not a system of record — appropriate for a
single-user local dev tool, not appropriate once there's a real backend store
or multi-device sync requirement.

**Suggested queries are config, not hardcoded JSX.** The pool of sample
prompts, how many are shown as "starter chips," and the autosuggest debounce/
limit are all in `frontend/src/config/suggestedQueries.config.js`. Swap the
list for domain-specific prompts once this becomes a real product.

**No auth, no rate limiting, no persistence layer.** This is a local dev
scaffold, not a deployable app. CORS is locked to `http://localhost:5173`
intentionally — tighten or replace before this goes anywhere near the internet.

## Growing this into RAG, agents, or MCP

The seams above exist on purpose. Rough path for each direction:

### RAG (Retrieval-Augmented Generation)
1. Add a retriever (vector store query, keyword search, hybrid) that runs
   before `llmService.streamChat(history)` is called in `server.js`.
2. Pass its output straight into the existing hook:
   ```js
   const context = await retrieve(message);
   for await (const token of llmService.streamChat(history, { context })) { ... }
   ```
3. Nothing about the WebSocket protocol, frontend, or streaming logic needs to
   change — `context` is already wired into the system prompt.
4. Longer term: swap the in-memory `history` array for a session-scoped store
   so retrieved chunks/citations can be persisted alongside messages.

### Agentic AI
1. Give `LLMService` (or a new `AgentService` beside it) access to tools —
   function-calling via the OpenAI SDK's `tools` param, or a manual
   plan/act/observe loop.
2. The WebSocket message protocol already supports arbitrary `type` values
   (`token`, `done`, `error`) — extend it with e.g. `tool_call` /
   `tool_result` events so the frontend can render intermediate agent steps
   instead of only final tokens.
3. Keep the per-connection `history` pattern; an agent's scratchpad/trace is
   just richer content in that same array.

### MCP (Model Context Protocol)
1. Add an MCP client inside `node-backend` (e.g. `@modelcontextprotocol/sdk`)
   and connect to one or more MCP servers (filesystem, database, internal
   tools) at startup.
2. Expose the discovered MCP tools to the model the same way you would any
   function-calling tool — this composes cleanly with the "Agentic AI" step
   above rather than being a separate integration.
3. `LLMService` stays the single choke point for provider/model config, so
   MCP tool results flow through the same `history`/streaming path already
   built.

The common thread: **new capabilities plug into `LLMService` and the
`history` array**, not into the WebSocket transport or the frontend rendering
loop. That boundary is what keeps this scaffold cheap to extend.
