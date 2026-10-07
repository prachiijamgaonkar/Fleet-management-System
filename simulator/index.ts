import "dotenv/config";
import { WebSocket } from "ws";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer, type IncomingMessage, type ServerResponse } from "http";

type RobotStatus =
  | "idle"
  | "active"
  | "on_mission"
  | "charging"
  | "blocked"
  | "error"
  | "maintenance"
  | "offline";

interface Point {
  x: number;
  y: number;
}

interface RobotSeed {
  robot_id: string;
  robot_type: string;
  x: number;
  y: number;
}

interface RosterEntry {
  robot_id: string;
  robot_type: string;
  start: Point;
}

interface FleetConfig {
  fleetSize: number;
  updateIntervalMs: number;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WS_URL = process.env.WS_URL || "ws://localhost:8080/ws/robots";
const FLEET_SIZE = parseInt(process.env.FLEET_SIZE || "8", 10);
const UPDATE_INTERVAL_MS = parseInt(process.env.UPDATE_INTERVAL_MS || "5000", 10);
const PAYLOAD_PADDING_BYTES = parseInt(process.env.PAYLOAD_PADDING_BYTES || "0", 10);

const SITE_WIDTH = 900;
const SITE_HEIGHT = 560;

// Reconnect/connect-ramp pacing, per AWS's "Full Jitter" backoff algorithm
// (https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/):
// sleep = random(0, min(cap, base * 2^attempt)). A fully random delay within the
// current exponential window, not a deterministic doubling, is what actually
// breaks clients out of retrying in synchronized waves.
const RECONNECT_BASE_MS = 1000;
const RECONNECT_CAP_MS = 15000;

// New-connection ramp pacing: spread a batch of new robots' *first* connection
// attempts randomly across a window instead of firing them all in the same tick,
// so scaling up doesn't create its own thundering herd against the server.
const RAMP_MS_PER_ROBOT = 15;
const RAMP_MAX_WINDOW_MS = 20000;

const roster: RosterEntry[] = JSON.parse(fs.readFileSync(path.join(__dirname, "../robots.json"), "utf-8"));

function randomPoint(): Point {
  return { x: Math.random() * SITE_WIDTH, y: Math.random() * SITE_HEIGHT };
}

function buildRobotList(n: number): RobotSeed[] {
  const list: RobotSeed[] = [];
  for (let i = 0; i < n; i++) {
    if (i < roster.length) {
      const r = roster[i];
      list.push({ robot_id: r.robot_id, robot_type: r.robot_type, x: r.start.x, y: r.start.y });
    } else {
      list.push({
        robot_id: `r${i + 1}`,
        robot_type: Math.random() < 0.5 ? "picker" : "hauler",
        ...randomPoint(),
      });
    }
  }
  return list;
}


const DRAIN_RATES: Record<string, number> = {
  active: 0.4,
  on_mission: 0.6,
  idle: 0.05,
  blocked: 0.1,
  error: 0.1,
  maintenance: 0.02,
};

class SimRobot {
  robot_id: string;
  robot_type: string;
  x: number;
  y: number;
  status: RobotStatus = "idle";
  battery: number = 60 + Math.random() * 40;
  target: Point | null = null;
  statusHoldTicks = 0;
  connectAttempt = 0;
  removed = false; // true once deliberately scaled down — stops reconnect attempts
  ws?: WebSocket;

  constructor({ robot_id, robot_type, x, y }: RobotSeed) {
    this.robot_id = robot_id;
    this.robot_type = robot_type;
    this.x = x;
    this.y = y;
    // connect() is NOT called here — it's scheduled externally via
    // scheduleConnections() so a burst of new robots doesn't all open a
    // socket in the same tick of the event loop.
  }

  connect(): void {
    if (this.removed) return; // scaled down before its staggered turn came up
    this.ws = new WebSocket(WS_URL);
    this.ws.on("open", () => {
      this.connectAttempt = 0; // reset backoff on a healthy connection
      console.log(`${this.robot_id} connected`);
    });
    this.ws.on("close", () => {
      if (this.removed) return; // scaled down deliberately, don't reconnect
      this.connectAttempt++;
      // Full Jitter: random(0, min(cap, base * 2^attempt)) — see constant comment above.
      const delay = Math.random() * Math.min(RECONNECT_CAP_MS, RECONNECT_BASE_MS * 2 ** this.connectAttempt);
      console.log(`${this.robot_id} disconnected, retrying in ${Math.round(delay)}ms`);
      setTimeout(() => this.connect(), delay);
    });
    this.ws.on("error", (err: NodeJS.ErrnoException) => {
      console.error(`${this.robot_id} connection error: ${err.code || err.message}`);
    });
  }

  decommission(): void {
    this.removed = true;
    this.ws?.close(4000, "decommissioned");
  }

  pickTarget(): void {
    this.target = randomPoint();
  }

  tick(): void {
    if (!this.ws) return; // still waiting for its staggered first connection attempt

    if (this.ws.readyState === WebSocket.OPEN && Math.random() < 0.0005) {
      this.ws.terminate();
      return;
    }

    this.updateStatus();
    this.updateMovement();
    this.updateBattery();

    if (this.ws.readyState === WebSocket.OPEN) this.publish();
  }

  updateStatus(): void {
    if (this.statusHoldTicks > 0) { this.statusHoldTicks--; return; }

    switch (this.status) {
      case "idle":
        if (this.battery < 20) this.status = "charging";
        else if (Math.random() < 0.3) { this.status = Math.random() < 0.5 ? "active" : "on_mission"; this.pickTarget(); }
        else if (Math.random() < 0.01) { this.status = "maintenance"; this.statusHoldTicks = 6; }
        break;
      case "active":
      case "on_mission":
        if (this.battery < 15) { this.status = "charging"; this.target = null; }
        else if (Math.random() < 0.03) { this.status = "blocked"; this.statusHoldTicks = 2; }
        else if (Math.random() < 0.015) { this.status = "error"; this.statusHoldTicks = 4; }
        else if (!this.target) this.status = "idle";
        break;
      case "charging":
        if (this.battery > 95) this.status = "idle";
        break;
      case "blocked":
      case "error":
        this.status = "active";
        this.pickTarget();
        break;
      case "maintenance":
        this.status = "idle";
        break;
    }
  }

  updateMovement(): void {
    const moving = this.status === "active" || this.status === "on_mission";
    if (!moving || !this.target) return;
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    if (Math.hypot(dx, dy) < 5) { this.target = null; return; }
    const step = 0.15;
    this.x = Math.min(SITE_WIDTH, Math.max(0, this.x + dx * step));
    this.y = Math.min(SITE_HEIGHT, Math.max(0, this.y + dy * step));
  }

  updateBattery(): void {
    if (this.status === "charging") this.battery = Math.min(100, this.battery + 1.2);
    else this.battery = Math.max(0, this.battery - (DRAIN_RATES[this.status] ?? 0.1));
  }

  publish(): void {
    const payload: Record<string, unknown> = {
      t: Math.floor(process.uptime()),
      robot_id: this.robot_id,
      robot_type: this.robot_type,
      x: Number(this.x.toFixed(1)),
      y: Number(this.y.toFixed(1)),
      status: this.status,
      battery: Number(this.battery.toFixed(1)),
    };
    if (PAYLOAD_PADDING_BYTES > 0) payload.padding = "x".repeat(PAYLOAD_PADDING_BYTES);
    this.ws!.send(JSON.stringify(payload)); // only called from tick() after confirming ws is OPEN
  }
}

function scheduleConnections(newRobots: SimRobot[]): void {
  const window = Math.min(newRobots.length * RAMP_MS_PER_ROBOT, RAMP_MAX_WINDOW_MS);
  for (const robot of newRobots) {
    const delay = window > 0 ? Math.random() * window : 0;
    setTimeout(() => robot.connect(), delay);
  }
}

let robots: SimRobot[] = buildRobotList(FLEET_SIZE).map((r) => new SimRobot(r));
scheduleConnections(robots);
let nextId = robots.length + 1;
let currentIntervalMs = UPDATE_INTERVAL_MS;
let tickHandle: ReturnType<typeof setInterval> | null = null;

function startTicking(intervalMs: number): void {
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(() => robots.forEach((r) => r.tick()), intervalMs);
}
startTicking(currentIntervalMs);

function applyFleetConfig(cfg: FleetConfig): void {
  if (cfg.fleetSize > robots.length) {
    const toAdd = cfg.fleetSize - robots.length;
    const added: SimRobot[] = [];
    for (let i = 0; i < toAdd; i++) {
      added.push(new SimRobot({
        robot_id: `r${nextId++}`,
        robot_type: Math.random() < 0.5 ? "picker" : "hauler",
        ...randomPoint(),
      }));
    }
    robots.push(...added);
    scheduleConnections(added);
    console.log(`scaling up to ${robots.length} robots, connections staggered over up to ${Math.min(added.length * RAMP_MS_PER_ROBOT, RAMP_MAX_WINDOW_MS)}ms`);
  } else if (cfg.fleetSize < robots.length) {
    const toRemove = robots.splice(cfg.fleetSize);
    toRemove.forEach((r) => r.decommission());
    console.log(`scaled down to ${robots.length} robots`);
  }

  if (cfg.updateIntervalMs && cfg.updateIntervalMs !== currentIntervalMs) {
    currentIntervalMs = cfg.updateIntervalMs;
    startTicking(currentIntervalMs);
    console.log(`update interval now ${currentIntervalMs}ms`);
  }
}

console.log(`simulator running: ${FLEET_SIZE} robots, update every ${UPDATE_INTERVAL_MS}ms -> ${WS_URL}`);

const HTTP_PORT = Number(process.env.PORT) || 8081;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method === "POST" && req.url === "/config-changed") {
    try {
      const body = await readBody(req);
      const cfg: FleetConfig = JSON.parse(body);
      applyFleetConfig(cfg);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      console.error(`malformed /config-changed request, ignoring: ${(err as Error).message}`);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "invalid_body" }));
    }
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(`simulator running: ${robots.length} robots`);
}).listen(HTTP_PORT, () => console.log(`http endpoint listening on ${HTTP_PORT}`));
