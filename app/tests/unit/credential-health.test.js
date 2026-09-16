// Entrega 8 (B) — credential health scheduler: backoff 5m→2h, reset on success,
// per-connection opt-out (interval 0), stale-state clearing on re-validation,
// and fail-open when the tester itself throws.
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  BACKOFF_SCHEDULE,
  DEFAULT_INTERVAL_MS,
  nextBackoffMs,
  resolveConnIntervalMs,
  resolveGlobalIntervalMs,
  successHealthPatch,
  failureHealthPatch,
  sweepConnections,
  __resetCredentialHealthState,
  getHealthSnapshot,
} from "../../src/lib/credentialHealth/scheduler.js";

const conn = (id, extra = {}) => ({ id, provider: "claude", authType: "oauth", isActive: true, ...extra });

function freshState() {
  return { initialized: true, timer: null, sweeping: false, failures: new Map(), timing: new Map() };
}

describe("credential health — backoff schedule", () => {
  it("grows 5m -> 10m -> 30m -> 2h and clamps at the ceiling", () => {
    expect(BACKOFF_SCHEDULE).toEqual([300_000, 600_000, 1_800_000, 7_200_000]);
    expect(nextBackoffMs(0)).toBe(300_000);
    expect(nextBackoffMs(1)).toBe(600_000);
    expect(nextBackoffMs(2)).toBe(1_800_000);
    expect(nextBackoffMs(3)).toBe(7_200_000);
    expect(nextBackoffMs(4)).toBe(7_200_000);
    expect(nextBackoffMs(99)).toBe(7_200_000);
  });

  it("resets on success (failure count cleared -> next interval is the base cadence)", async () => {
    const state = freshState();
    const test = vi.fn()
      .mockResolvedValueOnce({ valid: false, error: "boom" })  // failure #1 -> 5m
      .mockResolvedValueOnce({ valid: false, error: "boom" })  // failure #2 -> 10m
      .mockResolvedValueOnce({ valid: true });                 // success -> reset

    let now = 0;
    for (let i = 0; i < 3; i++) {
      const res = await sweepConnections({ connections: [conn("c1")], test, now, globalIntervalMs: DEFAULT_INTERVAL_MS, state });
      expect(res).toHaveLength(1);
      expect(res[0].valid).toBe(i === 2);
      if (i < 2) expect(res[0].backoffLevel).toBe(i);
      // advance past the scheduled retry so the next sweep considers it due
      now = res[0].nextAttemptAt;
    }
    expect(state.failures.get("c1")).toBeUndefined();
    const last = state.timing.get("c1");
    expect(last.status).toBe("active");
    expect(last.nextAttemptAt - last.lastAttemptAt).toBe(DEFAULT_INTERVAL_MS);
  });

  it("a connection in backoff is skipped until its next attempt time", async () => {
    const state = freshState();
    const test = vi.fn().mockResolvedValue({ valid: false, error: "boom" });
    await sweepConnections({ connections: [conn("c1")], test, now: 0, state });
    expect(test).toHaveBeenCalledTimes(1);
    // not due yet
    await sweepConnections({ connections: [conn("c1")], test, now: 1000, state });
    expect(test).toHaveBeenCalledTimes(1);
    // due after 5 minutes
    await sweepConnections({ connections: [conn("c1")], test, now: 300_001, state });
    expect(test).toHaveBeenCalledTimes(2);
  });
});

describe("credential health — per-connection interval", () => {
  it("interval 0 (or negative) = never test this connection", async () => {
    const state = freshState();
    const test = vi.fn();
    const res = await sweepConnections({
      connections: [conn("skip", { healthCheckInterval: 0 }), conn("skip2", { healthCheckInterval: -5 }), conn("run")],
      test: test.mockResolvedValue({ valid: true }),
      now: 0, state,
    });
    expect(test).toHaveBeenCalledTimes(1);
    expect(test).toHaveBeenCalledWith("run");
    expect(res.map((r) => r.id)).toEqual(["run"]);
  });

  it("a positive interval overrides the global cadence", () => {
    expect(resolveConnIntervalMs({ healthCheckInterval: 30 }, DEFAULT_INTERVAL_MS)).toBe(1_800_000);
    expect(resolveConnIntervalMs({}, DEFAULT_INTERVAL_MS)).toBe(DEFAULT_INTERVAL_MS);
    expect(resolveConnIntervalMs({ healthCheckInterval: 0 }, DEFAULT_INTERVAL_MS)).toBeNull();
  });

  it("global interval comes from CREDENTIAL_HEALTH_CHECK_INTERVAL, default 5 min", () => {
    expect(resolveGlobalIntervalMs({})).toBe(DEFAULT_INTERVAL_MS);
    expect(resolveGlobalIntervalMs({ CREDENTIAL_HEALTH_CHECK_INTERVAL: "600000" })).toBe(600_000);
    // too small to be a sane cadence -> default
    expect(resolveGlobalIntervalMs({ CREDENTIAL_HEALTH_CHECK_INTERVAL: "100" })).toBe(DEFAULT_INTERVAL_MS);
    expect(resolveGlobalIntervalMs({ CREDENTIAL_HEALTH_CHECK_INTERVAL: "abc" })).toBe(DEFAULT_INTERVAL_MS);
  });
});

describe("credential health — stale state is cleared on successful re-validation", () => {
  it("successHealthPatch nulls modelLock_*, errorCode, backoffLevel, rateLimitedUntil, lastError", () => {
    const connection = {
      id: "c1",
      testStatus: "unavailable",
      errorCode: 502,
      backoffLevel: 3,
      rateLimitedUntil: "2030-01-01T00:00:00.000Z",
      lastError: "502 bad gateway",
      lastErrorAt: "2026-01-01T00:00:00.000Z",
      "modelLock_claude-opus-4-6": "2030-01-01T00:00:00.000Z",
      "modelLock___all": "2030-01-01T00:00:00.000Z",
    };
    const patch = successHealthPatch(connection);
    expect(patch.testStatus).toBe("active");
    expect(patch.errorCode).toBeNull();
    expect(patch.backoffLevel).toBe(0);
    expect(patch.rateLimitedUntil).toBeNull();
    expect(patch.lastError).toBeNull();
    expect(patch.lastErrorAt).toBeNull();
    expect(patch["modelLock_claude-opus-4-6"]).toBeNull();
    expect(patch["modelLock___all"]).toBeNull();
    expect(patch.lastTested).toBeTruthy();
    // no unrelated keys are introduced
    expect(Object.keys(patch).every((k) => k.startsWith("modelLock_") || k === "lastTested" || k in connection)).toBe(true);
  });

  it("failureHealthPatch records the error and the backoff level", () => {
    const patch = failureHealthPatch("Token invalid", 2);
    expect(patch.testStatus).toBe("error");
    expect(patch.lastError).toBe("Token invalid");
    expect(patch.backoffLevel).toBe(2);
    expect(failureHealthPatch(undefined, 0).lastError).toBe("Connection failed");
  });
});

describe("credential health — fail-open", () => {
  beforeEach(() => __resetCredentialHealthState());

  it("a throwing tester is recorded as a failure, the sweep completes", async () => {
    const state = freshState();
    const test = vi.fn(async (id) => {
      if (id === "bad") throw new Error("tester exploded");
      return { valid: true };
    });
    const res = await sweepConnections({ connections: [conn("bad"), conn("good")], test, now: 0, state });
    expect(res).toHaveLength(2);
    const bad = res.find((r) => r.id === "bad");
    expect(bad.valid).toBe(false);
    expect(bad.error).toContain("tester exploded");
    expect(res.find((r) => r.id === "good").valid).toBe(true);
  });

  it("tester failures never leave the scheduler without a next attempt", async () => {
    const state = freshState();
    const test = vi.fn().mockRejectedValue(new Error("nope"));
    // getHealthSnapshot reads the process singleton, so drive the real state object
    const res = await sweepConnections({ connections: [conn("c1")], test, now: 0, state });
    expect(res[0].valid).toBe(false);
    expect(res[0].nextAttemptAt).toBe(300_000);
    const t = state.timing.get("c1");
    expect(t.status).toBe("error");
    expect(t.nextAttemptAt).toBeGreaterThan(0);
    expect(t.lastError).toContain("nope");
    expect(state.failures.get("c1")).toBe(1);
  });
});

describe("credential health — sweep is bounded concurrently and sequential batches", () => {
  it("tests every due connection once and returns one row each", async () => {
    const state = freshState();
    const connections = Array.from({ length: 12 }, (_, i) => conn(`c${i}`));
    const test = vi.fn().mockResolvedValue({ valid: true });
    const res = await sweepConnections({ connections, test, now: 0, state });
    expect(res).toHaveLength(12);
    expect(new Set(res.map((r) => r.id)).size).toBe(12);
  });
});
