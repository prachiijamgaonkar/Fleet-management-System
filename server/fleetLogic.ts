// Pure, dependency-free logic pulled out of index.ts specifically so it can be
// unit tested without spinning up a real HTTP/WebSocket server. This covers
// the two trickiest pieces of the backend: validating live config changes,
// and deciding when a robot should be marked offline.

export type RobotStatus =
  | "idle"
  | "active"
  | "on_mission"
  | "charging"
  | "blocked"
  | "error"
  | "maintenance"
  | "offline";

export interface Robot {
  robot_id: string;
  robot_type?: string;
  x: number;
  y: number;
  status: RobotStatus;
  battery: number;
  t?: number;
}

export interface HistoryPoint {
  t: number;
  active: number;
  total: number;
}

export interface FleetConfig {
  fleetSize: number;
  updateIntervalMs: number;
}

export interface ConfigUpdateResult {
  next: FleetConfig;
  rejected: string[];
}

/**
 * Validates and applies a partial config update against the current config.
 * Never throws — invalid fields are reported in `rejected` and simply left
 * unchanged in `next`, so a bad fleetSize doesn't block a valid updateIntervalMs
 * in the same request, and vice versa.
 */
export function applyConfigUpdate(
  current: FleetConfig,
  body: Partial<FleetConfig>
): ConfigUpdateResult {
  const next: FleetConfig = { ...current };
  const rejected: string[] = [];

  if (body.fleetSize !== undefined) {
    if (Number.isInteger(body.fleetSize) && body.fleetSize > 0 && body.fleetSize <= 2000) {
      next.fleetSize = body.fleetSize;
    } else {
      rejected.push(`fleetSize must be an integer between 1 and 2000 (got ${body.fleetSize})`);
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

/**
 * Marks a robot offline in the fleet map, given its connection was lost.
 * Returns the updated robot (so the caller can broadcast it) or null if
 * nothing should happen — either the robot is unknown, or it's already
 * marked offline (avoids a redundant broadcast on a double-close event).
 */
export function markRobotOffline(fleet: Map<string, Robot>, robotId: string): Robot | null {
  const existing = fleet.get(robotId);
  if (!existing || existing.status === "offline") return null;
  const updated: Robot = { ...existing, status: "offline" };
  fleet.set(robotId, updated);
  return updated;
}

/** Computes the fleet-wide activity snapshot used for the trend chart. */
export function computeStats(fleet: Map<string, Robot>): HistoryPoint {
  const robots = Array.from(fleet.values());
  const active = robots.filter((r) => r.status === "active" || r.status === "on_mission").length;
  return { t: Date.now(), active, total: robots.length };
}
