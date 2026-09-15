import { NextResponse } from "next/server";
import { getApiKeys, createApiKey, getComboById } from "@/lib/localDb";
import { getConsistentMachineId } from "@/shared/utils/machineId";
import { ensureBank, ensureMentalModel } from "@/lib/identityMemory/index.js";
import { resolveMemoryProfile } from "@/lib/identityMemory/profileConfig.js";
import { normalizeKeySources } from "@/lib/db/repos/apiKeysRepo.js";

export const dynamic = "force-dynamic";

// GET /api/keys - List API keys
export async function GET() {
  try {
    const keys = await getApiKeys();
    return NextResponse.json({ keys: keys.filter((key) => !key.isService) });
  } catch (error) {
    console.log("Error fetching keys:", error);
    return NextResponse.json({ error: "Failed to fetch keys" }, { status: 500 });
  }
}

// POST /api/keys - Create new API key
export async function POST(request) {
  try {
    const body = await request.json();
    const { name, comboId, soul, hindsightBankId, memoryBackend, memoryEnabled, sources } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!comboId || !(await getComboById(comboId))) {
      return NextResponse.json({ error: "A valid combo is required" }, { status: 400 });
    }
    let memoryProfile;
    try {
      memoryProfile = resolveMemoryProfile({
        enabled: memoryEnabled !== false,
        bankId: hindsightBankId,
        memoryBackend,
        name,
      });
    } catch (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Always get machineId from server
    const machineId = await getConsistentMachineId();
    if (memoryProfile.memoryEnabled) {
      await ensureBank(memoryProfile, name);
      await ensureMentalModel(memoryProfile, name);
    }
    const apiKey = await createApiKey(name, machineId, {
      comboId,
      soul: typeof soul === "string" ? soul : "",
      sources: normalizeKeySources(sources),
      ...memoryProfile,
    });

    return NextResponse.json({
      key: apiKey.key,
      name: apiKey.name,
      id: apiKey.id,
      machineId: apiKey.machineId,
      comboId: apiKey.comboId,
      hindsightBankId: apiKey.hindsightBankId,
      memoryBackend: apiKey.memoryBackend,
      mentalModelId: apiKey.mentalModelId,
      memoryEnabled: apiKey.memoryEnabled,
      sources: apiKey.sources,
    }, { status: 201 });
  } catch (error) {
    console.log("Error creating key:", error);
    return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
  }
}
