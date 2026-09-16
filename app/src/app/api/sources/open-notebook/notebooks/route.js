import { NextResponse } from "next/server";
import { listOpenNotebooks, isOpenNotebookConfigured } from "open-sse/sources/openNotebookBackend.js";

export const dynamic = "force-dynamic";

// GET /api/sources/open-notebook/notebooks
// → {notebooks: [{id, name, description}], count, ...}
// Normalized and minimal: the raw Open Notebook payload is never forwarded, and no
// credential or internal URL ever appears here. Fail-open with HTTP 200 + an empty
// list so a down service degrades the picker instead of breaking the key modal.
export async function GET() {
  const { notebooks, error } = await listOpenNotebooks();
  return NextResponse.json(
    {
      notebooks,
      count: notebooks.length,
      ...(error ? { error } : {}),
      configured: isOpenNotebookConfigured(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
