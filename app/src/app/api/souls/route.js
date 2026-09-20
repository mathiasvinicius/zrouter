import { NextResponse } from "next/server";
import { listSouls } from "@/lib/souls/library.js";

export const dynamic = "force-dynamic";

export async function GET() {
  const souls = await listSouls();
  return NextResponse.json({ souls }, { headers: { "Cache-Control": "no-store" } });
}
