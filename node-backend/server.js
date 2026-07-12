import "dotenv/config";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { defaultLLMService } from "./services/llmService.js";

const port = process.env.PORT || 8100;
const llmService = defaultLLMService;

const app = express();
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const server = app.listen(port, () => {
  console.log(`simple-chat backend listening on :${port}`);
});

const wss = new WebSocketServer({ server, path: "/api/chat" });

wss.on("connection", (ws) => {
  const history = [llmService.createSystemMessage()];

  ws.on("message", async (raw) => {
    let payload;
    try {
      payload = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "invalid JSON payload" }));
      return;
    }

    const message = (payload.message || "").trim();
    if (message.length < 1 || message.length > 4000) {
      ws.send(JSON.stringify({ type: "error", message: "message must be 1-4000 characters" }));
      return;
    }

    history.push({ role: "user", content: message });

    try {
      let fullText = "";
      for await (const token of llmService.streamChat(history)) {
        fullText += token;
        ws.send(JSON.stringify({ type: "token", text: token }));
      }

      history.push({ role: "assistant", content: fullText });
      ws.send(JSON.stringify({ type: "done" }));
    } catch (err) {
      ws.send(JSON.stringify({ type: "error", message: err.message }));
    }
  });

  ws.on("close", () => {
    history.length = 0;
  });
});
