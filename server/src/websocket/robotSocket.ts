import { WebSocket, WebSocketServer } from "ws";
import type { Robot } from "../models/types.ts";
import { fleet } from "../state/fleetState.ts";
import { markRobotOffline } from "../services/fleet.service.ts";
import { recordHistoryPoint } from "../services/history.service.ts";
import { OFFLINE_REMOVE_MS } from "../config/env.ts";
import { broadcastToDashboards, broadcastRemoved } from "./dashboardSocket.ts";

interface RobotSocket extends WebSocket {
  isAlive?: boolean;
  robotId?: string;
}

const offlineTimers = new Map<string, ReturnType<typeof setTimeout>>();

function cancelOfflineRemoval(robotId: string): void {
  const timer = offlineTimers.get(robotId);
  if (timer) {
    clearTimeout(timer);
    offlineTimers.delete(robotId);
  }
}

function handleRobotDecommissioned(robotId: string): void {
  cancelOfflineRemoval(robotId);
  if (!fleet.has(robotId)) return;
  fleet.delete(robotId);
  broadcastRemoved(robotId);
  console.log(`${robotId} removed (decommissioned)`);
}

function handleRobotOffline(robotId: string): void {
  const updated = markRobotOffline(fleet, robotId);
  if (!updated) return;
  broadcastToDashboards(updated);
  console.log(`${robotId} marked offline (connection lost)`);

  cancelOfflineRemoval(robotId);
  const timer = setTimeout(() => {
    offlineTimers.delete(robotId);
    if (fleet.get(robotId)?.status !== "offline") return; // reconnected since
    fleet.delete(robotId);
    broadcastRemoved(robotId);
    console.log(`${robotId} removed (offline for ${OFFLINE_REMOVE_MS / 1000}s)`);
  }, OFFLINE_REMOVE_MS);
  offlineTimers.set(robotId, timer);
}

export function registerRobotSocket(robotWSS: WebSocketServer): void {
  robotWSS.on("connection", (ws: RobotSocket) => {
    console.log("robot connected");
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", (raw) => {
      let update: Robot;
      try {
        update = JSON.parse(raw.toString());
      } catch (err) {
        console.error(`malformed message from robot socket, ignoring: ${(err as Error).message}`);
        return;
      }
      if (!update || typeof update.robot_id !== "string" || !update.robot_id) {
        console.error("message missing a valid robot_id, ignoring");
        return;
      }
      ws.robotId = update.robot_id;
      cancelOfflineRemoval(update.robot_id);
      fleet.set(update.robot_id, update);
      broadcastToDashboards(update);
      recordHistoryPoint(update);
    });

    ws.on("close", (code) => {
      if (!ws.robotId) return;
      if (code === 4000) {
        handleRobotDecommissioned(ws.robotId);
      } else {
        console.log("robot disconnected");
        handleRobotOffline(ws.robotId);
      }
    });

    ws.on("error", (err: NodeJS.ErrnoException) => {
      console.error(`robot socket error (${ws.robotId ?? "unidentified"}): ${err.code || err.message}`);
    });
  });

  setInterval(() => {
    robotWSS.clients.forEach((client) => {
      const ws = client as RobotSocket;
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 10000);
}
