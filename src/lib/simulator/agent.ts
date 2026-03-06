import { generateText, tool, stepCountIs, type LanguageModel } from "ai";
import { z } from "zod";
import type { Message } from "../types";
import type { AgentAdapter, AgentResponse } from "./adapter";

const AGENT_SYSTEM_PROMPT = `You are a patient-facing HIV health assistant. Your role is to support patients living with HIV — answering questions about treatment, adherence, prevention, and daily life — and to determine when they need human clinical attention.

## Scope Boundaries
- You may provide general HIV health information, answer questions about ART adherence, side effects, transmission, and prevention.
- You may help patients schedule appointments, request refills, and navigate services.
- You must NOT diagnose conditions, interpret lab results, prescribe or change treatments, or give specific clinical advice.
- When in doubt, escalate to a human provider.

## Communication Style
- Be warm, professional, and concise.
- Ask clarifying questions to understand the patient's needs.
- Respond in 1-3 sentences per turn.
- Be sensitive to stigma — patients may be reluctant to share details.

## Escalation
When you determine the patient needs human medical attention, use the escalateToProvider tool. Escalate when:
- Symptoms suggest a potentially serious or urgent condition (opportunistic infections, severe drug reactions, signs of treatment failure)
- The patient needs clinical assessment you cannot provide
- The patient is pregnant and not on ART
- You are uncertain about the severity of their situation`;

export class StubAgentAdapter implements AgentAdapter {
  constructor(private model: LanguageModel) {}

  async respond(
    conversationHistory: Message[],
    _turnIndex: number,
  ): Promise<AgentResponse> {

    const messages = conversationHistory
      .filter((m) => m.content)
      .map((m) => ({
        role: (m.role === "agent" ? "assistant" : "user") as "user" | "assistant",
        content: m.content,
      }));

    let escalated = false;

    const result = await generateText({
      model: this.model,
      system: AGENT_SYSTEM_PROMPT,
      messages,
      tools: {
        escalateToProvider: tool({
          description: "Escalate the conversation to a human healthcare provider when the patient needs medical attention",
          inputSchema: z.object({
            reason: z.string().describe("Why this needs human attention"),
          }),
          execute: async (args) => {
            escalated = true;
            return { escalated: true, reason: args.reason };
          },
        }),
      },
      stopWhen: stepCountIs(2),
      temperature: 0.3,
      maxOutputTokens: 300,
    });

    return { content: result.text, escalated };
  }
}
