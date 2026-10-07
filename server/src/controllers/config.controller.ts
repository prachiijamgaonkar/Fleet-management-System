import type { Request, Response } from "express";
import { applyConfigUpdate, pushConfigToSimulator } from "../services/fleet.service.ts";
import { getCurrentConfig, setCurrentConfig } from "../state/fleetState.ts";
import { ADMIN_TOKEN } from "../config/env.ts";
import type { FleetConfig } from "../models/types.ts";

export function getConfig(req: Request, res: Response): void {
  res.json(getCurrentConfig());
}

export function updateConfig(req: Request, res: Response): void {
  if (req.headers["x-admin-token"] !== ADMIN_TOKEN) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const { next, rejected } = applyConfigUpdate(getCurrentConfig(), req.body as Partial<FleetConfig>);
  setCurrentConfig(next);
  pushConfigToSimulator(next);
  res.json({ ...next, rejected });
}
