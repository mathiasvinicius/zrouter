import { NextResponse } from "next/server";
import { deleteApiKey, getApiKeyById, getComboById, updateApiKey } from "@/lib/localDb";
import { ensureBank, ensureMentalModel } from "@/lib/identityMemory/index.js";
import { resolveMemoryProfile } from "@/lib/identityMemory/profileConfig.js";
import { normalizeKeySources } from "@/lib/db/repos/apiKeysRepo.js";

// GET /api/keys/[id] - Get single key
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const key = await getApiKeyById(id);
    if (!key) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }
    return NextResponse.json({ key });
  } catch (error) {
    console.log("Error fetching key:", error);
    return NextResponse.json({ error: "Failed to fetch key" }, { status: 500 });
  }
}

async function updateKey(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { isActive, name, comboId, soul, hindsightBankId, memoryBackend, memoryEnabled, sources } = body;

    const existing = await getApiKeyById(id);
    if (!existing) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    const updateData = {};
    if (isActive !== undefined) updateData.isActive = isActive;
    if (name !== undefined) updateData.name = String(name).trim();
    if (comboId !== undefined) {
      if (!comboId || !(await getComboById(comboId))) {
        return NextResponse.json({ error: "A valid combo is required" }, { status: 400 });
      }
      updateData.comboId = comboId;
    }
    if (soul !== undefined) updateData.soul = String(soul);
    if (sources !== undefined) updateData.sources = normalizeKeySources(sources);
    if (hindsightBankId !== undefined || memoryBackend !== undefined || memoryEnabled !== undefined) {
      let memoryProfile;
      try {
        memoryProfile = resolveMemoryProfile({
          enabled: memoryEnabled === undefined ? existing.memoryEnabled : !!memoryEnabled,
          bankId: hindsightBankId === undefined ? existing.hindsightBankId : hindsightBankId,
          memoryBackend: memoryBackend === undefined ? existing.memoryBackend : memoryBackend,
          mentalModelId: existing.mentalModelId,
          name: updateData.name || existing.name,
        });
      } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      Object.assign(updateData, memoryProfile);
      if (memoryProfile.memoryEnabled) {
        await ensureBank(memoryProfile, updateData.name || existing.name);
        await ensureMentalModel(memoryProfile, updateData.name || existing.name);
      }
    }

    const updated = await updateApiKey(id, updateData);

    return NextResponse.json({ key: updated });
  } catch (error) {
    console.log("Error updating key:", error);
    return NextResponse.json({ error: "Failed to update key" }, { status: 500 });
  }
}

// PATCH is the canonical partial-update method. PUT remains as a compatible alias.
export async function PATCH(request, context) {
  return updateKey(request, context);
}

export async function PUT(request, context) {
  return updateKey(request, context);
}

// DELETE /api/keys/[id] - Delete API key
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;

    const deleted = await deleteApiKey(id);
    if (!deleted) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Key deleted successfully" });
  } catch (error) {
    console.log("Error deleting key:", error);
    return NextResponse.json({ error: "Failed to delete key" }, { status: 500 });
  }
}
