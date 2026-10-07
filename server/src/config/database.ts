import { DataSource } from "typeorm";
import { RobotHistoryEntry } from "../entities/RobotHistoryEntry.ts";
import { FleetActivityEntry } from "../entities/FleetActivityEntry.ts";
import { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME, DB_SSL } from "./env.ts";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: DB_HOST,
  port: DB_PORT,
  username: DB_USERNAME,
  password: DB_PASSWORD,
  database: DB_NAME,
  ssl: DB_SSL ? { rejectUnauthorized: false } : false,

  synchronize: true,
  entities: [RobotHistoryEntry, FleetActivityEntry],
});
