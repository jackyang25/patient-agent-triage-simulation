import { NextResponse } from "next/server";
import { SCENARIOS } from "@/lib/scenarios";
import { PROFILES } from "@/lib/profiles";
import { HIV_RUBRIC } from "@/lib/rubrics";

export async function GET() {
  return NextResponse.json({
    scenarios: SCENARIOS,
    profiles: PROFILES,
    rubrics: [HIV_RUBRIC],
  });
}
