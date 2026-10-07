import type { Robot, HistoryPoint, FleetConfig } from "../models/types.ts";
import { FLEET_SIZE, UPDATE_INTERVAL_MS } from "../config/env.ts";

export const fleet = new Map<string, Robot>();
export const history: HistoryPoint[] = [];

let currentConfig: FleetConfig = {
  fleetSize: FLEET_SIZE,
  updateIntervalMs: UPDATE_INTERVAL_MS,
};

export function getCurrentConfig(): FleetConfig {
  return currentConfig;
}

export function setCurrentConfig(next: FleetConfig): void {
  currentConfig = next;
}
