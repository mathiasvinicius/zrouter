// Skills shipped with this deployment. Link to the dashboard's own origin,
// never to upstream instructions for a different installation.

export const SKILLS = [
  {
    id: "zrouter",
    name: "ZRouter (Entry)",
    description: "Endpoint, API key, model discovery and links to this deployment's capability skills.",
    endpoint: null,
    icon: "hub",
    isEntry: true,
  },
  {
    id: "zrouter-chat",
    name: "Chat",
    description: "Authenticated chat and profile-bound combinations, with streaming when supported.",
    endpoint: "/v1/chat/completions",
    icon: "chat",
  },
  {
    id: "zrouter-image",
    name: "Image Generation",
    description: "Text-to-image; discover currently available image models before use.",
    endpoint: "/v1/images/generations",
    icon: "image",
  },
  {
    id: "zrouter-video",
    name: "Video Generation",
    description: "Asynchronous video jobs when an xAI connection is available.",
    endpoint: "/v1/videos/generations",
    icon: "movie",
  },
  {
    id: "zrouter-tts",
    name: "Text-to-Speech",
    description: "Speech synthesis; discover current voices and models before use.",
    endpoint: "/v1/audio/speech",
    icon: "record_voice_over",
  },
  {
    id: "zrouter-stt",
    name: "Speech-to-Text",
    description: "Audio transcription; discover current STT models before use.",
    endpoint: "/v1/audio/transcriptions",
    icon: "mic",
  },
  {
    id: "zrouter-embeddings",
    name: "Embeddings",
    description: "Vector embeddings for applications; separate from ZRouter's Neo4j identity memory.",
    endpoint: "/v1/embeddings",
    icon: "scatter_plot",
  },
  {
    id: "zrouter-web-search",
    name: "Web Search",
    description: "Web search when a configured search provider is available.",
    endpoint: "/v1/search",
    icon: "search",
  },
  {
    id: "zrouter-web-fetch",
    name: "Web Fetch",
    description: "Fetch URL content when a configured fetch provider is available.",
    endpoint: "/v1/web/fetch",
    icon: "language",
  },
  {
    id: "zrouter-memory",
    name: "Neo4j Identity Memory",
    description: "Bank-isolated automatic recall, historical context and optional explicit lookup.",
    endpoint: null,
    icon: "database",
  },
];

export function getSkillRawUrl(id, origin = "") {
  return `${origin}/skills/${id}/SKILL.md`;
}
