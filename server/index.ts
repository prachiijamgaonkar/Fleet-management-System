import "dotenv/config";
import express, { type Request, type Response } from "express";
import { createServer } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { fileURLToPath } from "url";
import path from "path";
import {
  applyConfigUpdate,
  markRobotOffline,
  computeStats,
  type Robot,
  type HistoryPoint,
  type FleetConfig,
} from "./fleetLogic.ts";

// ws's WebSocket doesn't know about our own bookkeeping fields, so we extend it here
interface RobotSocket extends WebSocket {
  isAlive?: boolean;
  robotId?: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
// express.json() throws on malformed JSON bodies; without this, Express's
// default handler sends back an HTML error page, which breaks any caller
// (like the dashboard) expecting a JSON response
app.use((err: Error, req: Request, res: Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError) {
    return res.status(400).json({ error: "invalid_json" });
  }
  next(err);
});
app.use(express.static(path.join(__dirname, "../web/dist")));

const server = createServer(app);

// two WebSocket servers, but neither attaches to the http server directly —
// we route the "upgrade" event ourselves based on the URL path
const robotWSS = new WebSocketServer({ noServer: true });
const dashboardWSS = new WebSocketServer({ noServer: true });

const fleet = new Map<string, Robot>(); // robot_id -> latest state
const history: HistoryPoint[] = []; // rolling trend data for the chart

let currentConfig: FleetConfig = {
  fleetSize: Number(process.env.FLEET_SIZE) || 8,
  updateIntervalMs: Number(process.env.UPDATE_INTERVAL_MS) || 5000,
};
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "changeme";

// public, read-only — the simulator polls this to learn the desired config
app.get("/config", (req: Request, res: Response) => {
  res.json(currentConfig);
});

// protected — only a caller with the correct token can change live config
app.post("/config", (req: Request, res: Response) => {
  if (req.headers["x-admin-token"] !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const { next, rejected } = applyConfigUpdate(currentConfig, req.body as Partial<FleetConfig>);
  currentConfig = next;
  res.json({ ...currentConfig, rejected });
});


server.on("error", (err: NodeJS.ErrnoException) => {
  console.error(`http server error: ${err.code || err.message}`);
});
robotWSS.on("error", (err: NodeJS.ErrnoException) => {
  console.error(`robot WebSocketServer error: ${err.code || err.message}`);
});
dashboardWSS.on("error", (err: NodeJS.ErrnoException) => {
  console.error(`dashboard WebSocketServer error: ${err.code || err.message}`);
});

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/ws/robots") {
    robotWSS.handleUpgrade(req, socket, head, (ws) => robotWSS.emit("connection", ws, req));
  } else if (req.url === "/ws/dashboard") {
    dashboardWSS.handleUpgrade(req, socket, head, (ws) => dashboardWSS.emit("connection", ws, req));
  } else {
    socket.destroy();
  }
});

function broadcastToDashboards(update: Robot): void {
  const msg = JSON.stringify({ type: "update", robot: update });
  dashboardWSS.clients.forEach((client) => {
    if (client.readyState === client.OPEN) client.send(msg);
  });
}

function broadcastRemoved(robotId: string): void {
  const msg = JSON.stringify({ type: "removed", robot_id: robotId });
  dashboardWSS.clients.forEach((client) => {
    if (client.readyState === client.OPEN) client.send(msg);
  });
}


const OFFLINE_REMOVE_MS = 30000;
const offlineTimers = new Map<string, ReturnType<typeof setTimeout>>();

function cancelOfflineRemoval(robotId: string): void {
  const timer = offlineTimers.get(robotId);
  if (timer) {
    clearTimeout(timer);
    offlineTimers.delete(robotId);
  }
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

robotWSS.on("connection", (ws: RobotSocket) => {
  console.log("robot connected");
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });

  ws.on("message", (raw) => {
    const update: Robot = JSON.parse(raw.toString());
    ws.robotId = update.robot_id; // remember which robot this socket belongs to
    cancelOfflineRemoval(update.robot_id); // it's back — don't remove it later
    fleet.set(update.robot_id, update);
    broadcastToDashboards(update);
  });

  ws.on("close", () => {
    console.log("robot disconnected");
    if (ws.robotId) handleRobotOffline(ws.robotId);
  });

 
  ws.on("error", (err: NodeJS.ErrnoException) => {
    console.error(`robot socket error (${ws.robotId ?? "unidentified"}): ${err.code || err.message}`);
  });
});

dashboardWSS.on("connection", (ws: WebSocket) => {
  console.log("dashboard connected");
  // send current full state immediately so a fresh/reconnecting dashboard isn't blank
  ws.send(JSON.stringify({ type: "snapshot", robots: Array.from(fleet.values()), history }));

  ws.on("error", (err: NodeJS.ErrnoException) => {
    console.error(`dashboard socket error: ${err.code || err.message}`);
  });
});

// heartbeat: ping every robot connection every 10s, drop ones that didn't pong back
setInterval(() => {
  robotWSS.clients.forEach((client) => {
    const ws = client as RobotSocket;
    if (!ws.isAlive) return ws.terminate(); 
    ws.isAlive = false;
    ws.ping();
  });
}, 10000);

setInterval(() => {
  const point = computeStats(fleet);
  history.push(point);
  if (history.length > 720) history.shift(); // cap ~1hr of points at 5s resolution
  dashboardWSS.clients.forEach((client) => {
    if (client.readyState === client.OPEN) client.send(JSON.stringify({ type: "history_point", point }));
  });
}, 5000);

// Keep-alive for the simulator: free hosting tiers (e.g. Render) put an idle
// service to sleep after ~15 minutes with no incoming traffic. This server
// naturally stays awake (real visitors hit the dashboard), but the simulator
// never receives any direct incoming traffic — it only makes outbound calls —
// so it can go idle independently, which silently drops every robot at once.
// Pinging it here, once immediately and then periodically, means: whenever a
// real visitor wakes *this* server up, that wake-up cascades to the simulator
// too, instead of requiring a separate, unrelated visitor to its own URL.
const SIMULATOR_URL = process.env.SIMULATOR_URL;

function pingSimulator(): void {
  if (!SIMULATOR_URL) return; // not configured (e.g. local dev) — nothing to do
  fetch(SIMULATOR_URL).catch(() => {

  });
}

const PORT = Number(process.env.PORT) || 8080;
server.listen(PORT, () => {
  console.log(`server listening on ${PORT}`);
  pingSimulator(); 
  setInterval(pingSimulator, 10 * 60 * 1000); // then every 10 minutes
});
