import { NextResponse } from "next/server";
import { getApiKeyById } from "@/lib/localDb";
import { clearBankMemories, getMemoryBackend, listBankMemories } from "@/lib/identityMemory/index.js";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const key = await getApiKeyById(id);
    if (!key?.hindsightBankId) {
      return NextResponse.json({ error: "No memory bank assigned" }, { status: 404 });
    }
    const url = new URL(request.url);
    const data = await listBankMemories(
      key,
      Number(url.searchParams.get("limit") || 50),
      Number(url.searchParams.get("offset") || 0),
    );
    return NextResponse.json({ bankId: key.hindsightBankId, memoryBackend: getMemoryBackend(key), ...data });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}

export async function DELETE(_request, { params }) {
  try {
    const { id } = await params;
    const key = await getApiKeyById(id);
    if (!key?.hindsightBankId) {
      return NextResponse.json({ error: "No memory bank assigned" }, { status: 404 });
    }
    const data = await clearBankMemories(key);
    return NextResponse.json({ bankId: key.hindsightBankId, memoryBackend: getMemoryBackend(key), ...data });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}
