import type { Robot } from "./types";
import { STATUS_PALETTE } from "./theme";

export function needsAttention(r: Robot): boolean {
  if (r.status === "error" || r.status === "blocked" || r.status === "offline") return true;
  if (r.battery < 15 && r.status !== "charging") return true;
  return false;
}

export const STATUS_COLORS = STATUS_PALETTE;
