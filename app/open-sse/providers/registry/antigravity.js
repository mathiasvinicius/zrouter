import { ANTIGRAVITY_IDE_BASE_URL, ANTIGRAVITY_IDE_USER_AGENT, ANTIGRAVITY_OAUTH_CLIENT } from "../shared.js";

export default {
  id: "antigravity",
  priority: 20,
  alias: "ag",
  uiAlias: "ag",
  display: {
    name: "Antigravity",
    icon: "rocket_launch",
    color: "#F59E0B",
    website: "https://antigravity.google",
    notice: {
      signupUrl: "https://antigravity.google",
    },
    deprecated: true,
    deprecationNotice: "RISK_NOTICE",
  },
  category: "oauth",
  serviceKinds: ["llm", "image", "webSearch", "stt"],
  // STT via local agy-bridge (systemd, host loopback). The bridge forwards
  // OpenAI-style input_audio parts to the antigravity CLI, which transcribes
  // them (@path attachment). No cloud STT key needed — reuses the AGY OAuth.
  sttConfig: {
    baseUrl: "http://127.0.0.1:20130/v1/chat/completions",
    authType: "none", // loopback bridge; per-connection baseUrl override still wins
    format: "agy-stt",
  },
  transport: {
    baseUrls: [ANTIGRAVITY_IDE_BASE_URL],
    format: "antigravity",
    headers: {
      "User-Agent": ANTIGRAVITY_IDE_USER_AGENT,
    },
    retry: {
      "429": {
        attempts: 3,
      },
      "500": {
        attempts: 3,
      },
      "503": {
        attempts: 3,
      },
    },
    usage: {
      quotaApiUrl: `${ANTIGRAVITY_IDE_BASE_URL}/v1internal:fetchAvailableModels`,
      quotaSummaryApiUrl: `${ANTIGRAVITY_IDE_BASE_URL}/v1internal:retrieveUserQuotaSummary`,
      loadProjectApiUrl: "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
      tokenUrl: "https://oauth2.googleapis.com/token",
    },
  },
  models: [
    { id: "audio-transcribe", name: "Audio -> Text (Gemini)", kind: "stt", transport: "agy-stt", upstreamModelId: "gemini-4-argon-low", params: ["prompt", "response_format"] },
    { id: "gemini-4-argon-high", name: "Gemini 4 Argon (High)", upstreamModelId: "gemini-4-argon-high(high)" },
    { id: "gemini-3.8-flash-high", name: "Gemini 3.8 Flash (High)", upstreamModelId: "gemini-3.8-flash-tiered(high)" },
    { id: "gemini-3.7-flash-high", name: "Gemini 3.7 Flash (High)", upstreamModelId: "gemini-3.7-flash-tiered(high)" },
    { id: "gemini-3.6-flash-high", name: "Gemini 3.6 Flash (High)", upstreamModelId: "gemini-3.6-flash-tiered(high)" },
    { id: "gemini-3.5-flash-high", name: "Gemini 3.5 Flash (High)" },
    { id: "gemini-3.1-pro-high", name: "Gemini 3.1 Pro (High)", upstreamModelId: "gemini-pro-agent" },
    { id: "gemini-pro-agent", name: "Gemini (Default)", upstreamModelId: "gemini-pro-agent" },
    { id: "claude-opus-5-5-high", name: "Claude Opus 5.5", upstreamModelId: "claude-opus-5-5-high(high)" },
    { id: "claude-sonnet-5-5-high", name: "Claude Sonnet 5.5", upstreamModelId: "claude-sonnet-5-5-high(high)" },
    { id: "claude-opus-4-6-thinking", name: "Claude Opus 4.6 (Thinking)", upstreamModelId: "claude-opus-4-6-thinking(high)" },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", upstreamModelId: "claude-sonnet-4-6(high)" },
    { id: "gpt-oss-120b-medium", name: "GPT-OSS 120B", upstreamModelId: "gpt-oss-120b-medium(medium)" },
    { id: "gemini-4-argon", name: "Gemini 4 Argon (Default)", upstreamModelId: "gemini-4-argon(high)" },
    { id: "gemini-3.1-flash-image", name: "Gemini 3.1 Flash (Image)", upstreamModelId: "gemini-3.1-flash-agent(low)" },
  ],
  oauth: {
    ...ANTIGRAVITY_OAUTH_CLIENT,
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://www.googleapis.com/oauth2/v1/userinfo",
    scopes: [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/cclog",
      "https://www.googleapis.com/auth/experimentsandconfigs",
    ],
    apiEndpoint: "https://daily-cloudcode-pa.googleapis.com",
    apiVersion: "v1internal",
    loadCodeAssistEndpoint: "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
    onboardUserEndpoint: "https://cloudcode-pa.googleapis.com/v1internal:onboardUser",
    loadCodeAssistUserAgent: ANTIGRAVITY_IDE_USER_AGENT,
    refreshLeadMs: 300000,
  },
  searchViaChat: {
    defaultModel: "gemini-2.5-flash",
    endpoint: `${ANTIGRAVITY_IDE_BASE_URL}/v1internal:generateContent`,
    freeTier: "Free — Google Search grounding through an Antigravity OAuth account.",
  },
  features: {
    usage: true,
  },
};
