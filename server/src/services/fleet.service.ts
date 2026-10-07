

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

export function pushConfigToSimulator(config: FleetConfig): void {
  if (!SIMULATOR_URL) return;
  fetch(`${SIMULATOR_URL}/config-changed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  }).catch((err) => console.error("failed to push config to simulator:", err));
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
