import pkg from "../../../../package.json" with { type: "json" };

// ZRouter: endpoint 100% offline. Não fazemos lookup externo (npm registry,
// GitHub ou site do upstream): a versão instalada é a fonte de verdade e
// atualizações são gerenciadas localmente pelo pipeline de merge em
// /opt/containers/zrouter (upstreams.lock.json + bases/).
export async function GET() {
  return Response.json({
    currentVersion: pkg.version,
    latestVersion: pkg.version,
    hasUpdate: false,
  });
}
