import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export async function GET() {
  return NextResponse.json(store.getAllRuns());
}

export async function DELETE() {
  store.clear();
  return NextResponse.json({ cleared: true });
}
