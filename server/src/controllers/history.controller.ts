import type { Request, Response } from "express";
import { getHistoryForRobot } from "../services/history.service.ts";

export async function getRobotHistory(req: Request, res: Response): Promise<void> {
  const robotId = req.params.robotId as string;

  try {
    const points = await getHistoryForRobot(robotId);
    res.json(points);
  } catch (err) {
    console.error(`failed to fetch history for ${robotId}:`, err);
    res.status(500).json({ error: "history_unavailable" });
  }
}
