import { WebSocket, WebSocketServer } from "ws";
import type { Robot } from "../models/types.ts";
import { fleet, history } from "../state/fleetState.ts";
import { computeStats } from "../services/fleet.service.ts";
import { enqueueFleetActivity, getFleetActivityHistory } from "../services/activity.service.ts";

let dashboardWSS: WebSocketServer | null = null;

export function broadcastToDashboards(update: Robot): void {
  if (!dashboardWSS) return;
  const msg = JSON.stringify({ type: "update", robot: update });
  dashboardWSS.clients.forEach((client) => {
    if (client.readyState === client.OPEN) client.send(msg);
  });
}

export function broadcastRemoved(robotId: string): void {
  if (!dashboardWSS) return;
  const msg = JSON.stringify({ type: "removed", robot_id: robotId });
  dashboardWSS.clients.forEach((client) => {
    if (client.readyState === client.OPEN) client.send(msg);
  });
}

export function registerDashboardSocket(wss: WebSocketServer): void {
  dashboardWSS = wss;

  wss.on("connection", async (ws: WebSocket) => {
    console.log("dashboard connected");
    let snapshotHistory: { t: number; active: number; total: number }[] = history;
    try {
      const rows = await getFleetActivityHistory();
      if (rows.length > 0) {
        snapshotHistory = rows.map((r) => ({
          t: new Date(r.recorded_at).getTime(),
          active: r.active,
          total: r.total,
        }));
      }
    } catch (err) {
      console.error("failed to load fleet activity history for snapshot, falling back to memory:", err);
    }
    ws.send(JSON.stringify({ type: "snapshot", robots: Array.from(fleet.values()), history: snapshotHistory }));

    ws.on("error", (err: NodeJS.ErrnoException) => {
      console.error(`dashboard socket error: ${err.code || err.message}`);
    });
  });

  setInterval(() => {
    const point = computeStats(fleet);
    history.push(point);
    if (history.length > 720) history.shift();
    enqueueFleetActivity(point);
    wss.clients.forEach((client) => {
      if (client.readyState === client.OPEN) client.send(JSON.stringify({ type: "history_point", point }));
    });
  }, 5000);
}
