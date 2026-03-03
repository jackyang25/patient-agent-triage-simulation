import type { Message, HttpAdapterConfig as HttpConfig } from "../types";
import type { AgentAdapter, AgentResponse } from "./adapter";

const DEFAULT_ESCALATION_PATTERNS = [
  "escalat",
  "transfer",
  "connect you with",
  "human provider",
  "speak with a doctor",
  "speak with a nurse",
  "speak with a clinician",
  "emergency",
  "go to the ER",
  "go to the clinic immediately",
  "go to the hospital",
  "seek immediate",
  "urgent care",
];

interface DefaultResponseShape {
  content?: string;
  message?: string;
  text?: string;
  response?: string;
  escalated?: boolean;
}

function defaultMapResponse(data: unknown): { content: string; escalatedExplicit?: boolean } {
  const d = data as DefaultResponseShape;
  const content = d.content ?? d.message ?? d.text ?? d.response ?? "";
  return { content, escalatedExplicit: d.escalated };
}

export class HttpAgentAdapter implements AgentAdapter {
  private endpoint: string;
  private headers: Record<string, string>;
  private escalationPatterns: string[];

  constructor(config: HttpConfig) {
    this.endpoint = config.endpoint;
    this.headers = config.headers ?? {};
    this.escalationPatterns = config.escalationPatterns ?? DEFAULT_ESCALATION_PATTERNS;
  }

  async respond(
    messages: Message[],
    turnIndex: number,
  ): Promise<AgentResponse> {
    void turnIndex;

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

    const data = await res.json();
    const { content, escalatedExplicit } = defaultMapResponse(data);

    // detect escalation: explicit flag from agent, or pattern match in content
    const escalated =
      escalatedExplicit === true ||
      this.escalationPatterns.some((p) =>
        content.toLowerCase().includes(p.toLowerCase()),
      );

    return { content: content || "(no response)", escalated };
  }
}
