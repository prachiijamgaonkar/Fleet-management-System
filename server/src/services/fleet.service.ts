

import type { Robot, HistoryPoint, FleetConfig, ConfigUpdateResult } from "../models/types.ts";
import { SIMULATOR_URL } from "../config/env.ts";

export function applyConfigUpdate(
  current: FleetConfig,
  body: Partial<FleetConfig>
): ConfigUpdateResult {
  const next: FleetConfig = { ...current };
  const rejected: string[] = [];

  if (body.fleetSize !== undefined) {
    if (Number.isInteger(body.fleetSize) && body.fleetSize > 0 && body.fleetSize <= 1500) {
      next.fleetSize = body.fleetSize;
    } else {
      rejected.push(`fleetSize must be an integer between 1 and 1500 (got ${body.fleetSize})`);
    }
  }

  if (body.updateIntervalMs !== undefined) {
    if (Number.isInteger(body.updateIntervalMs) && body.updateIntervalMs >= 200) {
      next.updateIntervalMs = body.updateIntervalMs;
    } else {
      rejected.push(`updateIntervalMs must be an integer of at least 200 (got ${body.updateIntervalMs})`);
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
