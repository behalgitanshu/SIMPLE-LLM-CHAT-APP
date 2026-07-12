import OpenAI from "openai";

const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant. Answer clearly and concisely.";

export class LLMService {
  constructor({
    apiKey = process.env.OPENAI_API_KEY,
    baseURL = process.env.OPENAI_BASE_URL || undefined,
    model = process.env.LLM_MODEL || "gpt-4o-mini",
    temperature = process.env.LLM_TEMPERATURE ? Number(process.env.LLM_TEMPERATURE) : undefined,
    systemPrompt = process.env.LLM_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT,
  } = {}) {
    this.model = model;
    this.temperature = temperature;
    this.systemPrompt = systemPrompt;
    this.client = new OpenAI({ apiKey, baseURL });
  }

  createSystemMessage() {
    return { role: "system", content: this.systemPrompt };
  }

  // `context` is a placeholder hook for RAG: pass retrieved chunks in and
  // they get folded into the system message ahead of the conversation history.
  buildMessages(history, context) {
    if (!context) return history;
    return [
      { role: "system", content: `${this.systemPrompt}\n\nUse the following context if relevant:\n${context}` },
      ...history.slice(1),
    ];
  }

  async *streamChat(history, { context } = {}) {
    const messages = this.buildMessages(history, context);
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: this.temperature,
      stream: true,
    });

    for await (const part of stream) {
      const token = part.choices[0]?.delta?.content || "";
      if (token) yield token;
    }
  }
}

export const defaultLLMService = new LLMService();
