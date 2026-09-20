import { SKILLS } from "@/shared/constants/skills.js";

export const dynamic = "force-dynamic";

// Single source of truth for every agent. Skill documents stay in ZRouter and
// are fetched only when needed; nothing is copied into an agent's SOUL/prompt.
export async function GET() {
  return Response.json({
    object: "list",
    data: SKILLS.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      endpoint: skill.endpoint,
      skill_path: `/skills/${skill.id}/SKILL.md`,
      entry: skill.isEntry === true,
    })),
  }, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
