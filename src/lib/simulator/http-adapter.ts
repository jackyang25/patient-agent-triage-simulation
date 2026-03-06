import type { Message, HttpAdapterConfig as HttpConfig } from "../types";
import type { AgentAdapter, AgentResponse } from "./adapter";

interface ResponseShape {
  content?: string;
  message?: string;
  text?: string;
  response?: string;
  escalated?: boolean;
}

export class HttpAgentAdapter implements AgentAdapter {
  private endpoint: string;
  private headers: Record<string, string>;

  constructor(config: HttpConfig) {
    this.endpoint = config.endpoint;
    this.headers = config.headers ?? {};
  }

  async respond(
    messages: Message[],
    _turnIndex: number,
  ): Promise<AgentResponse> {

    const body = {
      messages: messages.map((m) => ({
        role: m.role === "patient" ? "user" : m.role === "agent" ? "assistant" : m.role,
        content: m.content,
      })),
    };

    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.headers,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Agent HTTP ${res.status}: ${text}`);
    }

    const data = await res.json() as ResponseShape;
    const content = data.content ?? data.message ?? data.text ?? data.response ?? "";

    return { content: content || "(no response)", escalated: data.escalated === true };
  }
}
