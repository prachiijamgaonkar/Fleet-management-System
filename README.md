# Peppermint Fleet Control

A live fleet management dashboard: a simulated robot fleet publishes position/status/battery over WebSocket, a Node/TypeScript backend ingests and broadcasts fleet state, and a React/TypeScript dashboard gives an operator a live map, trend chart, search, and a "needs attention" view — plus a live, no-redeploy control for fleet size and update interval.

## Live URLs

- **Dashboard (and the backend surface it consumes):** https://fleet-management-system-hzza.onrender.com
  - The backend serves the dashboard directly, so this one URL is both halves of "the dashboard, and whatever backend surface it consumes" — the same origin also exposes `/ws/dashboard` (WebSocket), `/ws/robots` (WebSocket, used by the simulator), and `/config` (REST).

*(Cold start note: this is deployed on Render's free tier. If the dashboard shows a "Connecting to fleet…" spinner for up to ~30-60 seconds on first load after a period of inactivity, that's an expected free-tier cold start, not a bug — see FINDINGS.md for why.)*

## Configuration knobs

Every value below is an environment variable, read at process startup — see `server/.env.example` and `simulator/.env.example` for the full list with descriptions. The important ones:

| Variable | Where | Purpose |
|---|---|---|
| `FLEET_SIZE` | server & simulator | Starting robot count (should match on both) |
| `UPDATE_INTERVAL_MS` | server & simulator | Starting publish interval |
| `PAYLOAD_PADDING_BYTES` | simulator | Adds filler bytes to each message, for testing payload-size behavior |
| `ADMIN_TOKEN` | server | Shared secret required to change live config |
| `PORT` | server | Port the backend listens on |
| `SIMULATOR_URL` | server | The simulator's own public URL — used for a keep-alive ping (production only) |

## Working the live controls (no redeploy needed)

Open the dashboard → sidebar → **"Live Config"**:
1. Enter the **control password** (the value of `ADMIN_TOKEN` on the deployed backend)
2. Enter a new **fleet size** and/or **update interval** (leave a field blank to leave it unchanged)
3. Click **Apply** — a toast confirms success or explains exactly what was rejected (e.g. fleet size must be 1-5000)
4. **Reset** clears the form fields locally (does not change the running fleet)

Changes take effect within one simulator poll cycle (≤5 seconds) once the simulator is actually running — see FINDINGS.md for what "actually running" means on a free-tier host.

## Local run steps (Linux)

```bash
git clone https://github.com/prachiijamgaonkar/Fleet-management-System.git
cd Fleet-management-System
npm install
npm run build          # compiles the React dashboard into web/dist/
```

Then, in two separate terminals, both from the project root:

```bash
npm run server          # terminal 1 — backend + serves the dashboard
```
```bash
npm run simulator       # terminal 2 — mock robot fleet
```

Open `http://localhost:8080`. To change config knobs locally, copy `server/.env.example` → `server/.env` and `simulator/.env.example` → `simulator/.env`, edit values, restart both processes.

**Running tests:**
```bash
cd server && npm test
```

**Rebuilding after a frontend change:** the server always serves whatever is currently built into `web/dist/` — re-run `npm run build` from the project root after editing anything in `web/src/`.

## AI delegation notes

This project was built collaboratively with Claude (Anthropic) across an extended session covering the full stack: simulator, backend, frontend, deployment, and debugging. Concretely:

- **Implementation** — the large majority of the actual code (simulator state machine, backend WebSocket/HTTP logic, React components, styling) was written by Claude, directed turn-by-turn with explicit decisions, corrections, and priorities set throughout — architecture choices (WebSocket over a message queue, in-memory state over a database, React over vanilla JS at the point complexity justified it, MUI adoption) were each discussed and decided deliberately, not defaulted to.
- **Debugging and load testing** — the file-descriptor limit finding, the React-vs-vanilla performance measurements, the Render free-tier OOM crash, and the idle-sleep diagnosis were all found through live, real testing (not simulated or assumed) — Claude ran the tests and reported real numbers; interpreting them and deciding what to fix vs. document was a joint process.
- **Documentation** — this README, FINDINGS.md, and ARCHITECTURE.md were drafted by Claude from the real findings gathered during the build, reflecting decisions actually made during development.

I can explain any part of this submission — the transport choice, the reconnect logic, the scaling limits, and the deployment tradeoffs — since every decision was walked through and verified live, not accepted blindly.
