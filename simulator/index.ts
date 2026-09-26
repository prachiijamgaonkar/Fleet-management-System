import "dotenv/config";
import { WebSocket } from "ws";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
const CONTROL_URL = process.env.CONTROL_URL || "http://localhost:8080";

const SITE_WIDTH = 900;
const SITE_HEIGHT = 560;

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
  reconnectDelay = 1000;
  removed = false; // true once deliberately scaled down — stops reconnect attempts
  ws!: WebSocket;

  constructor({ robot_id, robot_type, x, y }: RobotSeed) {
    this.robot_id = robot_id;
    this.robot_type = robot_type;
    this.x = x;
    this.y = y;
    this.connect();
  }

  connect(): void {
    this.ws = new WebSocket(WS_URL);
    this.ws.on("open", () => {
      this.reconnectDelay = 1000; // reset backoff on a healthy connection
      console.log(`${this.robot_id} connected`);
    });
    this.ws.on("close", () => {
      if (this.removed) return; // scaled down deliberately, don't reconnect
      console.log(`${this.robot_id} disconnected, retrying in ${this.reconnectDelay}ms`);
      setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 15000); // exponential backoff, capped
    });
    this.ws.on("error", (err: NodeJS.ErrnoException) => {
      // "close" fires right after and logs the reconnect — this just adds *why*
      // it failed (e.g. EMFILE from hitting the OS file-descriptor limit),
      // which used to be silently swallowed and made real failures hard to diagnose
      console.error(`${this.robot_id} connection error: ${err.code || err.message}`);
    });
  }

  decommission(): void {
    this.removed = true;
    this.ws.close();
  }

  pickTarget(): void {
    this.target = randomPoint();
  }

  tick(): void {
    // occasionally simulate a dropped connection to exercise reconnect + backend offline-detection
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
    this.ws.send(JSON.stringify(payload));
  }
}

let robots: SimRobot[] = buildRobotList(FLEET_SIZE).map((r) => new SimRobot(r));
let nextId = robots.length + 1;
let currentIntervalMs = UPDATE_INTERVAL_MS;
let tickHandle: ReturnType<typeof setInterval> | null = null;

function startTicking(intervalMs: number): void {
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(() => robots.forEach((r) => r.tick()), intervalMs);
}
startTicking(currentIntervalMs);

async function pollConfig(): Promise<void> {
  try {
    const res = await fetch(`${CONTROL_URL}/config`);
    const cfg: FleetConfig = await res.json();

    if (cfg.fleetSize > robots.length) {
      const toAdd = cfg.fleetSize - robots.length;
      for (let i = 0; i < toAdd; i++) {
        robots.push(new SimRobot({
          robot_id: `r${nextId++}`,
          robot_type: Math.random() < 0.5 ? "picker" : "hauler",
          ...randomPoint(),
        }));
      }
      console.log(`scaled up to ${robots.length} robots`);
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
  } catch (err) {
    // server unreachable this poll — just try again next time
  }
}

setInterval(pollConfig, 5000);

console.log(`simulator running: ${FLEET_SIZE} robots, update every ${UPDATE_INTERVAL_MS}ms -> ${WS_URL}`);
