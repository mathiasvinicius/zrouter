/**
 * Credential health scheduler (ported from OmniRoute v3.8.51 credentialHealth/scheduler.ts)
 *
 * Reuses the fork's existing testSingleConnection() so every provider validator
 * already written keeps working — no new validator here.
 *
 *   - initial delay 30s after boot (never blocks the boot; a provider outage must
 *     not stop the gateway, same principle as ensureNeo4jSchema)
 *   - sweep cadence: CREDENTIAL_HEALTH_CHECK_INTERVAL (default 5 min)
 *   - per-connection override: `healthCheckInterval` minutes, 0 = never test
 *   - backoff on failure: 5min -> 10min -> 30min -> 2h, reset on success
 *   - a successful re-validation CLEARS the stale health state (modelLock_*,
 *     errorCode, backoffLevel, rateLimitedUntil, lastError) — the exact class of
 *     frozen state that had to be cleaned by hand after the 9Router migration
 *   - result persisted on the connection's existing fields (testStatus/lastError/
 *     lastTested); no new table
 */

import { getProviderConnections, updateProviderConnection } from "@/lib/db/repos/connectionsRepo.js";

export const BACKOFF_SCHEDULE = [300_000, 600_000, 1_800_000, 7_200_000]; // 5m, 10m, 30m, 2h
export const DEFAULT_INTERVAL_MS = 300_000;
export const INITIAL_DELAY_MS = 30_000;
export const CONCURRENCY_LIMIT = 5;
const LOG_PREFIX = "[CredentialHealth]";
const TRUE_ENV = new Set(["1", "true", "yes", "on"]);

/** Exponential backoff for the Nth consecutive failure (clamped at the 2h ceiling). */
export function nextBackoffMs(consecutiveFailures) {
  const i = Math.min(Math.max(0, consecutiveFailures), BACKOFF_SCHEDULE.length - 1);
  return BACKOFF_SCHEDULE[i];
}

/**
 * Effective sweep interval for a connection (ms), or null = never test it.
 * Per-connection `healthCheckInterval` (minutes) wins; 0/negative opts out.
 */
export function resolveConnIntervalMs(conn, globalIntervalMs = DEFAULT_INTERVAL_MS) {
  const minutes = conn?.healthCheckInterval;
  if (minutes === null || minutes === undefined) return globalIntervalMs;
  if (Number(minutes) <= 0) return null;
  return Number(minutes) * 60_000;
}

/** Global cadence: env override (>= 10s), else the 5-minute default. */
export function resolveGlobalIntervalMs(env = process.env) {
  const parsed = parseInt(env?.CREDENTIAL_HEALTH_CHECK_INTERVAL, 10);
  if (!Number.isNaN(parsed) && parsed >= 10_000) return parsed;
  return DEFAULT_INTERVAL_MS;
}

function isEnabled(env = process.env) {
  if (env?.NEXT_PHASE === "phase-production-build") return false;
  const flag = env?.DISABLE_CREDENTIAL_HEALTH_CHECK;
  return !(flag && TRUE_ENV.has(String(flag).trim().toLowerCase()));
}

/**
 * State patch that a SUCCESSFUL re-validation writes: the stale failure state is
 * invalidated, not just overwritten. Keys mirror the repo's own
 * resetHealthStateOnActivation, so a direct scheduler write is idempotent with it.
 */
export function successHealthPatch(connection) {
  const patch = {
    testStatus: "active",
    lastError: null,
    lastErrorAt: null,
    errorCode: null,
    backoffLevel: 0,
    rateLimitedUntil: null,
    lastTested: new Date().toISOString(),
  };
  for (const key of Object.keys(connection || {})) {
    if (key.startsWith("modelLock_")) patch[key] = null;
  }
  return patch;
}

/** State patch for a FAILED re-validation. */
export function failureHealthPatch(error, failures) {
  return {
    testStatus: "error",
    lastError: error || "Connection failed",
    lastErrorAt: new Date().toISOString(),
    lastTested: new Date().toISOString(),
    backoffLevel: Math.min(failures, BACKOFF_SCHEDULE.length - 1),
  };
}

// ── State (globalThis singleton: survives Next.js HMR) ────────────────────
function getState() {
  globalThis.__zrouterCredentialHC ??= {
    initialized: false,
    timer: null,
    sweeping: false,
    // consecutive failures per connection, for backoff
    failures: new Map(),
    // { lastAttemptAt, nextAttemptAt, status, lastError, lastTestedAt }
    timing: new Map(),
  };
  return globalThis.__zrouterCredentialHC;
}

/** Read-only snapshot for the dashboard (per-connection health state). */
export function getHealthSnapshot() {
  const state = getState();
  const out = {};
  for (const [id, t] of state.timing.entries()) {
    const failures = state.failures.get(id) || 0;
    out[id] = {
      status: t.status || "unknown",
      lastTestedAt: t.lastTestedAt || null,
      nextCheckAt: t.nextAttemptAt ? new Date(t.nextAttemptAt).toISOString() : null,
      lastError: t.lastError || null,
      consecutiveFailures: failures,
      // Index into BACKOFF_SCHEDULE and identical to what the sweep reported.
      backoffLevel: failures > 0 ? Math.min(failures - 1, BACKOFF_SCHEDULE.length - 1) : 0,
    };
  }
  return out;
}

/**
 * Sweep a list of connections, testing only the due ones. Pure orchestration:
 * the tester is injected so this is unit-testable without touching the DB or a
 * provider. Fail-open — one connection's throw never stops the sweep.
 *
 * @returns {Promise<Array<{id, provider, tested, valid, error, nextCheckAt, backoffLevel}>>}
 */
export async function sweepConnections({ connections, test, now = Date.now(), globalIntervalMs = DEFAULT_INTERVAL_MS, state = getState() } = {}) {
  const due = [];
  for (const conn of connections || []) {
    const intervalMs = resolveConnIntervalMs(conn, globalIntervalMs);
    if (intervalMs === null) continue; // per-connection opt-out
    const timing = state.timing.get(conn.id);
    if (!timing || now >= timing.nextAttemptAt) due.push({ conn, intervalMs });
  }

  const results = [];
  for (let i = 0; i < due.length; i += CONCURRENCY_LIMIT) {
    const batch = due.slice(i, i + CONCURRENCY_LIMIT);
    const settled = await Promise.all(batch.map(async ({ conn, intervalMs }) => {
      let outcome;
      try {
        outcome = await test(conn.id);
      } catch (e) {
        // A throwing tester is a failure of the check, not of the scheduler.
        outcome = { valid: false, error: e?.message || "Scheduler error" };
      }
      return { conn, intervalMs, outcome };
    }));

    // Scheduling math runs on the injected clock (so a sweep is deterministic and
    // testable); wall-clock time is only used for the persisted ISO stamps.
    const attemptedAt = Date.now();
    for (const { conn, intervalMs, outcome } of settled) {
      const valid = outcome?.valid === true;
      let nextAttemptAt;
      let failures;
      if (valid) {
        state.failures.delete(conn.id);
        failures = 0;
        nextAttemptAt = now + intervalMs;
      } else {
        failures = (state.failures.get(conn.id) || 0) + 1;
        state.failures.set(conn.id, failures);
        nextAttemptAt = now + nextBackoffMs(failures - 1);
      }
      const lastTestedAt = new Date(attemptedAt).toISOString();
      state.timing.set(conn.id, {
        lastAttemptAt: now,
        nextAttemptAt,
        status: valid ? "active" : "error",
        lastError: valid ? null : (outcome?.error || "Connection failed"),
        lastTestedAt,
      });
      results.push({
        id: conn.id,
        provider: conn.provider,
        tested: true,
        valid,
        error: valid ? null : (outcome?.error || "Connection failed"),
        nextAttemptAt,
        backoffLevel: valid ? 0 : Math.min(failures - 1, BACKOFF_SCHEDULE.length - 1),
      });
    }
  }
  return results;
}

/**
 * One full sweep against the real connections + real tester.
 * `force` ignores the due-time gate (manual "test now").
 */
export async function sweep({ force = false } = {}) {
  const state = getState();
  if (state.sweeping) return [];
  state.sweeping = true;
  try {
    const { testSingleConnection } = await import("@/app/api/providers/[id]/test/testUtils.js");

    // A forced sweep still respects the per-connection opt-out (0 = never test).
    const connections = (await getProviderConnections({ isActive: true }))
      .filter((c) => c?.id && (c.authType === "apikey" || c.authType === "oauth" || c.authType === "cookie"));

    const globalIntervalMs = resolveGlobalIntervalMs();
    const test = async (id) => {
      const connection = connections.find((c) => c.id === id);
      const result = await testSingleConnection(id);
      // Persist the health outcome on the connection (existing fields only) and
      // clear the stale failure state when the credential checks out.
      if (connection) {
        const patch = result.valid
          ? { ...successHealthPatch(connection), ...(result.warning ? { lastError: result.warning } : {}) }
          : failureHealthPatch(result.error, (state.failures.get(id) || 0) + 1);
        await updateProviderConnection(id, patch).catch((e) => {
          console.warn(LOG_PREFIX, `persist failed for ${id}: ${e.message}`);
        });
      }
      return result;
    };

    if (force) {
      for (const c of connections) state.timing.delete(c.id);
    }

    const results = await sweepConnections({ connections, test, globalIntervalMs, state });
    if (results.length) {
      const failed = results.filter((r) => !r.valid).length;
      console.log(LOG_PREFIX, `checked ${results.length}/${connections.length} connection(s) — ${failed} failing`);
      for (const r of results) {
        if (r.valid) continue;
        if (r.backoffLevel > 1) continue; // log the transition, not the retry tail
        console.log(LOG_PREFIX, `❌ ${r.provider}/${r.id} — ${r.error} (next check in ${(nextBackoffMs(r.backoffLevel) / 1000)}s)`);
      }
    }
    return results;
  } catch (err) {
    console.warn(LOG_PREFIX, `sweep failed (swallowed): ${err?.message || err}`);
    return [];
  } finally {
    state.sweeping = false;
  }
}

/** Start the scheduler (idempotent, never blocks the boot). */
export function startCredentialHealthScheduler() {
  const state = getState();
  if (!isEnabled()) return false;
  if (state.initialized) return true;
  state.initialized = true;

  const interval = resolveGlobalIntervalMs();
  console.log(LOG_PREFIX, `starting (initial delay ${INITIAL_DELAY_MS / 1000}s, interval ${interval / 1000}s)`);

  const safeSweep = () => sweep().catch((e) => console.warn(LOG_PREFIX, `tick failed: ${e.message}`));
  const initial = setTimeout(safeSweep, INITIAL_DELAY_MS);
  if (initial.unref) initial.unref();
  state.timer = setInterval(safeSweep, interval);
  if (state.timer.unref) state.timer.unref();
  return true;
}

export function stopCredentialHealthScheduler() {
  const state = getState();
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  state.initialized = false;
}

/** Test-only reset. */
export function __resetCredentialHealthState() {
  const state = getState();
  state.failures.clear();
  state.timing.clear();
  state.initialized = false;
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  state.sweeping = false;
}
