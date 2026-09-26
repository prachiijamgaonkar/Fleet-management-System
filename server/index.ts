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
app.use(express.static(path.join(__dirname, "../web/dist")));

const server = createServer(app);

// two WebSocket servers, but neither attaches to the http server directly —
// we route the "upgrade" event ourselves based on the URL path
const robotWSS = new WebSocketServer({ noServer: true });
const dashboardWSS = new WebSocketServer({ noServer: true });

const fleet = new Map<string, Robot>(); // robot_id -> latest state
const history: HistoryPoint[] = []; // rolling trend data for the chart

// the config this process started with — never mutated, so "reset to
// defaults" always has something real to go back to, distinct from whatever
// has been changed live since then
const defaultConfig: FleetConfig = {
  fleetSize: Number(process.env.FLEET_SIZE) || 8,
  updateIntervalMs: Number(process.env.UPDATE_INTERVAL_MS) || 5000,
};
let currentConfig: FleetConfig = { ...defaultConfig };
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "changeme";

// public, read-only — the simulator polls this to learn the desired config.
// "defaults" is extra info for the dashboard's reset button; the simulator
// only ever reads fleetSize/updateIntervalMs and ignores the rest.
app.get("/config", (req: Request, res: Response) => {
  res.json({ ...currentConfig, defaults: defaultConfig });
});

// protected — only a caller with the correct token can change live config
app.post("/config", (req: Request, res: Response) => {
  if (req.headers["x-admin-token"] !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const { next, rejected } = applyConfigUpdate(currentConfig, req.body as Partial<FleetConfig>);
  currentConfig = next;
  res.json({ ...currentConfig, defaults: defaultConfig, rejected });
});

// server/WebSocketServer-level errors (e.g. EMFILE when the OS file-descriptor
// limit is hit while accepting a new connection) happen before any individual
// connection exists, so they need their own handlers — without one, this can
// crash the whole process instead of just failing that one connection attempt
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

function handleRobotOffline(robotId: string): void {
  const updated = markRobotOffline(fleet, robotId);
  if (!updated) return; // unknown robot, or already offline — nothing to broadcast
  broadcastToDashboards(updated);
  console.log(`${robotId} marked offline (connection lost)`);
}

robotWSS.on("connection", (ws: RobotSocket) => {
  console.log("robot connected");
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });

  ws.on("message", (raw) => {
    const update: Robot = JSON.parse(raw.toString());
    ws.robotId = update.robot_id; // remember which robot this socket belongs to
    fleet.set(update.robot_id, update);
    broadcastToDashboards(update);
  });

  ws.on("close", () => {
    console.log("robot disconnected");
    if (ws.robotId) handleRobotOffline(ws.robotId);
  });

  // without this, a per-socket error (e.g. an abrupt network reset) is an
  // unhandled "error" event, which close() fires right after anyway — but
  // logging it here is what actually shows you *why*, instead of just "closed"
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
    if (!ws.isAlive) return ws.terminate(); // triggers "close" above -> markOffline
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

const PORT = Number(process.env.PORT) || 8080;
server.listen(PORT, () => console.log(`server listening on ${PORT}`));
