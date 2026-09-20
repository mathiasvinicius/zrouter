import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/localDb", () => ({ getSettings: vi.fn() }));
vi.mock("@/lib/usageDb", () => ({ getUsageStats: vi.fn() }));
vi.mock("@/lib/cacheMetrics.js", () => ({ getCacheMetrics: vi.fn() }));

import { getSettings } from "@/lib/localDb";
import { getUsageStats } from "@/lib/usageDb";
import { getCacheMetrics } from "@/lib/cacheMetrics.js";
import { GET } from "../../src/app/api/usage/cache-metrics/route.js";

describe("cache metrics HTTP route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSettings.mockResolvedValue({ cacheControlMode: "auto" });
    getCacheMetrics.mockResolvedValue({ requests: 1, cachedTokens: 9, byProvider: {} });
    getUsageStats.mockResolvedValue({
      totalRequests: 3, totalPromptTokens: 100, totalCachedTokens: 40,
      byProvider: { test: { requests: 3, promptTokens: 100, cachedTokens: 40 } },
    });
  });

  it.each(["today", "24h"])("uses live usage for %s without crashing", async (period) => {
    const response = await GET(new Request(`http://localhost/api/usage/cache-metrics?period=${period}`));
    expect(response.status).toBe(200);
    expect(getUsageStats).toHaveBeenCalledWith(period);
    expect(await response.json()).toMatchObject({
      requests: 3, inputTokens: 100, cachedTokens: 40, tokensSaved: 40,
      policyPeriod: "today", policyRequests: 1,
      byProvider: { test: { requests: 3, inputTokens: 100, cachedTokens: 40 } },
    });
  });

  it.each(["7d", "30d", "60d", "all"])("retains aggregates for %s", async (period) => {
    const response = await GET(new Request(`http://localhost/api/usage/cache-metrics?period=${period}`));
    expect(response.status).toBe(200);
    expect(getUsageStats).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ requests: 1, cachedTokens: 9 });
  });

  it("rejects unknown periods before reading the database", async () => {
    const response = await GET(new Request("http://localhost/api/usage/cache-metrics?period=invalid"));
    expect(response.status).toBe(400);
    expect(getCacheMetrics).not.toHaveBeenCalled();
  });
});
