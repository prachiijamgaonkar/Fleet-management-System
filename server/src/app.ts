import express, { type Request, type Response, type NextFunction } from "express";
import { fileURLToPath } from "url";
import path from "path";
import { configRouter } from "./routes/config.routes.ts";
import { historyRouter } from "./routes/history.routes.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const app = express();

app.use(express.json());

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError) {
    res.status(400).json({ error: "invalid_json" });
    return;
  }
  next(err);
});

app.use(express.static(path.join(__dirname, "../../web/dist")));

app.use(configRouter);
app.use(historyRouter);

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "not_found" });
});
