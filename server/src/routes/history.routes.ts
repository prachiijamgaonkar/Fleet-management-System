import { Router } from "express";
import { getRobotHistory } from "../controllers/history.controller.ts";
import { apiPaths } from "../constants.ts";

export const historyRouter = Router();

historyRouter.get(apiPaths.history.byRobotId, getRobotHistory);
