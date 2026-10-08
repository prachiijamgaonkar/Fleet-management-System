import "dotenv/config";
import "reflect-metadata";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { app } from "./app.ts";
import { AppDataSource } from "./config/database.ts";
import { registerRobotSocket } from "./websocket/robotSocket.ts";
import { registerDashboardSocket } from "./websocket/dashboardSocket.ts";
import { PORT, SIMULATOR_URL } from "./config/env.ts";
import { flushHistoryBuffer } from "./services/history.service.ts";
import { flushFleetActivity } from "./services/activity.service.ts";

const server = createServer(app);

const robotWSS = new WebSocketServer({ noServer: true });
const dashboardWSS = new WebSocketServer({ noServer: true });

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

registerRobotSocket(robotWSS);
registerDashboardSocket(dashboardWSS);

// A single fire-and-forget ping can land in the simulator's own cold-start
// rejection window (Render's free tier returns 429 to connections that
// arrive before a just-woken service is ready) and then silently give up for
// a full 10 minutes until the next scheduled ping — which can itself land in
// another bad window, repeating indefinitely. Retrying a few times with a
// short delay gives the simulator a real chance to finish booting within
// this one wake-up attempt, instead of depending on the 10-minute interval
// to eventually get lucky.
const PING_RETRY_ATTEMPTS = 5;
const PING_RETRY_DELAY_MS = 6000;

async function pingSimulator(): Promise<void> {
  if (!SIMULATOR_URL) return;
  for (let attempt = 1; attempt <= PING_RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(SIMULATOR_URL);
      if (res.ok) {
        console.log(`simulator ping succeeded (attempt ${attempt}/${PING_RETRY_ATTEMPTS})`);
        return;
      }
      console.error(`simulator ping got HTTP ${res.status} (attempt ${attempt}/${PING_RETRY_ATTEMPTS})`);
    } catch (err) {
      console.error(`simulator ping failed: ${(err as Error).message} (attempt ${attempt}/${PING_RETRY_ATTEMPTS})`);
    }
    if (attempt < PING_RETRY_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, PING_RETRY_DELAY_MS));
    }
  }
  console.error(`simulator ping gave up after ${PING_RETRY_ATTEMPTS} attempts — will retry on the next scheduled ping`);
}

AppDataSource.initialize()
  .then(() => {
    console.log("database connected");
    server.listen(PORT, () => {
      console.log(`server listening on ${PORT}`);
      void pingSimulator();
      setInterval(() => void pingSimulator(), 10 * 60 * 1000);
    });
  })
  .catch((err) => {
    console.error("database connection failed:", err);
    process.exit(1);
  });

async function shutdown(signal: string): Promise<void> {
  console.log(`received ${signal}, flushing buffered writes before exit`);
  await Promise.all([flushHistoryBuffer(), flushFleetActivity()]);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
