import { NextResponse } from "next/server";
import { inspectNeo4jSchema } from "@/lib/identityMemory/schema.js";

export const dynamic = "force-dynamic";

// Post-install check for whoever self-hosts: is Neo4j reachable, and did the
// bootstrap apply the schema? Never echoes host, user or password.
export async function GET() {
  const schema = await inspectNeo4jSchema();
  if (!schema) {
    return NextResponse.json({ connected: false, indexes: [], constraints: [], missing: [] });
  }
  const { indexes, constraints, missing } = schema;
  return NextResponse.json({ connected: true, indexes, constraints, missing });
}
