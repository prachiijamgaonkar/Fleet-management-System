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

function pingSimulator(): void {
  if (!SIMULATOR_URL) return;
  fetch(SIMULATOR_URL).catch(() => {});
}

AppDataSource.initialize()
  .then(() => {
    console.log("database connected");
    server.listen(PORT, () => {
      console.log(`server listening on ${PORT}`);
      pingSimulator();
      setInterval(pingSimulator, 10 * 60 * 1000);
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
