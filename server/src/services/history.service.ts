import { MoreThan } from "typeorm";
import { AppDataSource } from "../config/database.ts";
import { RobotHistoryEntry } from "../entities/RobotHistoryEntry.ts";
import type { Robot } from "../models/types.ts";

const HISTORY_WINDOW_MS = 60 * 60 * 1000;
const MAX_ROWS = 2000;
const FLUSH_INTERVAL_MS = 2000;
const MAX_BUFFER_SIZE = 200;

function repo() {
  return AppDataSource.getRepository(RobotHistoryEntry);
}

type BufferedPoint = {
  robot_id: string;
  robot_type: string | null;
  x: number;
  y: number;
  status: string;
  battery: number;
};

let buffer: BufferedPoint[] = [];

export function recordHistoryPoint(robot: Robot): void {
  buffer.push({
    robot_id: robot.robot_id,
    robot_type: robot.robot_type ?? null,
    x: robot.x,
    y: robot.y,
    status: robot.status,
    battery: robot.battery,
  });
  if (buffer.length >= MAX_BUFFER_SIZE) void flushHistoryBuffer();
}

export async function flushHistoryBuffer(): Promise<void> {
  if (buffer.length === 0) return;
  const toWrite = buffer;
  buffer = [];
  try {
    await repo().insert(toWrite);
  } catch (err) {
    console.error("failed to flush robot_history batch:", err);
  }
}

setInterval(() => void flushHistoryBuffer(), FLUSH_INTERVAL_MS);

export async function getHistoryForRobot(robotId: string): Promise<RobotHistoryEntry[]> {
  const since = new Date(Date.now() - HISTORY_WINDOW_MS);
  return repo().find({
    where: { robot_id: robotId, recorded_at: MoreThan(since) },
    order: { recorded_at: "DESC" },
    take: MAX_ROWS,
  });
}
