

import type { Robot, HistoryPoint, FleetConfig, ConfigUpdateResult } from "../models/types.ts";
import { SIMULATOR_URL } from "../config/env.ts";

export function applyConfigUpdate(
  current: FleetConfig,
  body: Partial<FleetConfig>
): ConfigUpdateResult {
  const next: FleetConfig = { ...current };
  const rejected: string[] = [];

  // TEMP: cap raised for local DB-persistence load testing only.
  // Production/live-deploy value is 1500 (see FINDINGS.md — Render free tier OOMs ~2000-5000).
  // Revert to <= 1500 before committing/deploying.
  const FLEET_SIZE_CAP = 20000;
  if (body.fleetSize !== undefined) {
    if (Number.isInteger(body.fleetSize) && body.fleetSize > 0 && body.fleetSize <= FLEET_SIZE_CAP) {
      next.fleetSize = body.fleetSize;
    } else {
      rejected.push(`fleetSize must be an integer between 1 and ${FLEET_SIZE_CAP} (got ${body.fleetSize})`);
    }
  }

  // TEMP: minimum interval lowered for local load testing only. Revert to >= 200 before committing/deploying.
  const MIN_UPDATE_INTERVAL_MS = 50;
  if (body.updateIntervalMs !== undefined) {
    if (Number.isInteger(body.updateIntervalMs) && body.updateIntervalMs >= MIN_UPDATE_INTERVAL_MS) {
      next.updateIntervalMs = body.updateIntervalMs;
    } else {
      rejected.push(`updateIntervalMs must be an integer of at least ${MIN_UPDATE_INTERVAL_MS} (got ${body.updateIntervalMs})`);
    }
  }

  return { next, rejected };
}

// The simulator has no fallback polling for config changes — this push is
// the ONLY way a live config change ever reaches it (see server/server.ts's
// pingSimulator for the same category of problem: a single request that can
// land in the simulator's cold-start rejection window and be lost). Retrying
// a few times gives it a real chance instead of silently dropping the
// operator's change on one bad-timed attempt.
const PUSH_CONFIG_RETRY_ATTEMPTS = 5;
const PUSH_CONFIG_RETRY_DELAY_MS = 6000;

export async function pushConfigToSimulator(config: FleetConfig): Promise<void> {
  if (!SIMULATOR_URL) return;
  for (let attempt = 1; attempt <= PUSH_CONFIG_RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${SIMULATOR_URL}/config-changed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        console.log(`pushed config to simulator (attempt ${attempt}/${PUSH_CONFIG_RETRY_ATTEMPTS})`);
        return;
      }
      console.error(`push config to simulator got HTTP ${res.status} (attempt ${attempt}/${PUSH_CONFIG_RETRY_ATTEMPTS})`);
    } catch (err) {
      console.error(`push config to simulator failed: ${(err as Error).message} (attempt ${attempt}/${PUSH_CONFIG_RETRY_ATTEMPTS})`);
    }
    if (attempt < PUSH_CONFIG_RETRY_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, PUSH_CONFIG_RETRY_DELAY_MS));
    }
  }
  console.error(`push config to simulator gave up after ${PUSH_CONFIG_RETRY_ATTEMPTS} attempts — change was NOT delivered`);
}

export function markRobotOffline(fleet: Map<string, Robot>, robotId: string): Robot | null {
  const existing = fleet.get(robotId);
  if (!existing || existing.status === "offline") return null;
  const updated: Robot = { ...existing, status: "offline" };
  fleet.set(robotId, updated);
  return updated;
}

export function computeStats(fleet: Map<string, Robot>): HistoryPoint {
  const robots = Array.from(fleet.values());
  const active = robots.filter((r) => r.status === "active" || r.status === "on_mission").length;
  return { t: Date.now(), active, total: robots.length };
}
