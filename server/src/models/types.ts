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
