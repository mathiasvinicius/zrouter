// Notion backend — read-only stub (roadmap item 2, phase 1).
// Same contract as the other backends; returns an empty list until NOTION_TOKEN
// exists. Real search (pages/databases/blocks) arrives with the token integration.

const NOTION_VERSION = "2022-06-28";

export function isNotionConfigured() {
  return Boolean(process.env.NOTION_TOKEN);
}

export async function searchNotion() {
  // not-configured → empty list, never an error.
  return [];
}

export async function getNotionSource() {
  return null;
}

// ponytail: [read-only Notion search via REST] → skipped: real search until
// NOTION_TOKEN exists, add when the token is provided; keep read-only forever.
