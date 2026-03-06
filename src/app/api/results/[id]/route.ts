import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { getSessionId } from "@/lib/request-context";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sessionId = getSessionId(request);
  const { id } = await params;
  const run = store.getRun(sessionId, id);

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json(run);
}
