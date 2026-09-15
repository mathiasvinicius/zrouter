export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initConsoleLogCapture } = await import("@/lib/consoleLogBuffer");
    initConsoleLogCapture();

    // Server-only: lets capabilities.js read the synced catalog without pulling
    // node:fs into the dashboard's browser bundle.
    const { installCatalogSource } = await import("open-sse/providers/catalogOverride.js");
    await installCatalogSource();

    const { startModelCatalogSync } = await import("@/lib/modelCatalog/sync.js");
    startModelCatalogSync();

    // One-shot Neo4j index/constraint bootstrap, once per process. Not awaited:
    // an unreachable Neo4j must never delay (or block) the gateway boot, and the
    // recall path is already fail-open.
    import("@/lib/identityMemory/schema.js")
      .then(({ ensureNeo4jSchema }) => ensureNeo4jSchema())
      .catch((error) => console.warn(`[IdentityMemory][schema] bootstrap skipped: ${error.message}`));
  }
}
