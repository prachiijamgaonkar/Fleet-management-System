import { Router } from "express";
import { getConfig, updateConfig } from "../controllers/config.controller.ts";
import { apiPaths } from "../constants.ts";

export const configRouter = Router();

configRouter.get(apiPaths.config.root, getConfig);
configRouter.post(apiPaths.config.root, updateConfig);
