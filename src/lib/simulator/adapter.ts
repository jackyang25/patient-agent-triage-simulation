import type { Message } from "../types";

export interface AgentResponse {
  content: string;
  /** whether this response signals escalation to a human provider */
  escalated: boolean;
}

export interface AgentAdapter {
  respond(
    messages: Message[],
    turnIndex: number,
  ): Promise<AgentResponse>;
}
