import { NextResponse } from "next/server";
import { z } from "zod";
import { StubAgentAdapter } from "@/lib/simulator/agent";
import { getModelFromRequest } from "@/lib/request-context";
import type { Message } from "@/lib/types";

const requestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    }),
  ),
});

export async function POST(request: Request) {
  const model = getModelFromRequest(request);
  const body = await request.json();

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const messages: Message[] = parsed.data.messages.map((m, i) => ({
    role:
      m.role === "user"
        ? ("patient" as const)
        : m.role === "assistant"
          ? ("agent" as const)
          : ("system" as const),
    content: m.content,
    turnIndex: i,
  }));

  const agent = new StubAgentAdapter(model);

  try {
    const response = await agent.respond(messages, messages.length);
    return NextResponse.json({
      content: response.content,
      escalated: response.escalated,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
