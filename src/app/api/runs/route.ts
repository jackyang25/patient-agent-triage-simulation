import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { getSessionId } from "@/lib/request-context";

export async function GET(request: Request) {
  const sessionId = getSessionId(request);
  return NextResponse.json(store.getAllRuns(sessionId));
}

export async function DELETE(request: Request) {
  const sessionId = getSessionId(request);
  store.clear(sessionId);
  return NextResponse.json({ cleared: true });
}
