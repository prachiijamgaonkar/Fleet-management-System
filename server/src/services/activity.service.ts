import { MoreThan } from "typeorm";
import { AppDataSource } from "../config/database.ts";
import { FleetActivityEntry } from "../entities/FleetActivityEntry.ts";
import type { HistoryPoint } from "../models/types.ts";

const HISTORY_WINDOW_MS = 60 * 60 * 1000;
const FLUSH_INTERVAL_MS = 5000;
const MAX_BUFFER_SIZE = 200;

function repo() {
  return AppDataSource.getRepository(FleetActivityEntry);
}

let buffer: { active: number; total: number }[] = [];

export function enqueueFleetActivity(point: HistoryPoint): void {
  buffer.push({ active: point.active, total: point.total });
  if (buffer.length >= MAX_BUFFER_SIZE) void flushFleetActivity();
}

export async function flushFleetActivity(): Promise<void> {
  if (buffer.length === 0) return;
  const toWrite = buffer;
  buffer = [];
  try {
    await repo().insert(toWrite);
  } catch (err) {
    console.error("failed to flush fleet_activity batch:", err);
  }
}

setInterval(() => void flushFleetActivity(), FLUSH_INTERVAL_MS);

export async function getFleetActivityHistory(): Promise<FleetActivityEntry[]> {
  const since = new Date(Date.now() - HISTORY_WINDOW_MS);
  return repo().find({
    where: { recorded_at: MoreThan(since) },
    order: { recorded_at: "ASC" },
  });
}
