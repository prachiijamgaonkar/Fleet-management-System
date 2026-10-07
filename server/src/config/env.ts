export const PORT = Number(process.env.PORT) || 8080;
export const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "changeme";
export const SIMULATOR_URL = process.env.SIMULATOR_URL;
export const FLEET_SIZE = Number(process.env.FLEET_SIZE) || 8;
export const UPDATE_INTERVAL_MS = Number(process.env.UPDATE_INTERVAL_MS) || 5000;
export const OFFLINE_REMOVE_MS = 30000;

export const DB_HOST = process.env.DB_HOST || "localhost";
export const DB_PORT = Number(process.env.DB_PORT) || 5432;
export const DB_USERNAME = process.env.DB_USERNAME || "postgres";
export const DB_PASSWORD = process.env.DB_PASSWORD || "";
export const DB_NAME = process.env.DB_NAME || "robot";
export const DB_SSL = process.env.DB_SSL === "true";
