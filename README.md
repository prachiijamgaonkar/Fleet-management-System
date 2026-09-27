# Fleet Management Dashboard

A live fleet management dashboard built as an end-to-end full-stack system.

The system consists of:

* A **simulated robot fleet** that continuously publishes robot position, status, and battery information over WebSocket.
* A **Node.js + TypeScript backend** that ingests robot updates, maintains the latest fleet state, and broadcasts updates to connected dashboard clients.
* A **React + TypeScript dashboard** that provides a live site view, fleet trends, robot search, and a **Needs Attention** view.
* **Live configuration controls** that allow fleet size and update interval to be changed without modifying code or redeploying the application.

## Live Deployment

### Dashboard

**https://fleet-management-system-hzza.onrender.com**

The backend serves the dashboard directly, so the application uses a single public origin for both the frontend and backend.

The same deployment exposes:

* `/ws/dashboard` — WebSocket used by the dashboard
* `/ws/robots` — WebSocket used by the robot simulator
* `/config` — REST endpoint for configuration management

### Cold Start

The application is deployed on Render's free tier.

After a period of inactivity, Render may put the service to sleep. As a result, the first request can take approximately **30–60 seconds** while the service starts again.

If the dashboard initially displays:

> Connecting to fleet…

please allow the service time to wake up. This is an expected characteristic of the free hosting tier rather than an application error.

More details about deployment behavior and observed limitations are documented in `FINDINGS.md`.

---

# Configuration

The simulator and backend support configurable fleet behavior through environment variables.

The complete list of variables, including descriptions, is available in:

* `server/.env.example`
* `simulator/.env.example`

The main configuration values are:

| Variable                | Component          | Purpose                                                      |
| ----------------------- | ------------------ | ------------------------------------------------------------ |
| `FLEET_SIZE`            | Server & Simulator | Initial number of simulated robots                           |
| `UPDATE_INTERVAL_MS`    | Server & Simulator | Initial robot update interval                                |
| `PAYLOAD_PADDING_BYTES` | Simulator          | Adds filler bytes to each message for payload-size testing   |
| `ADMIN_TOKEN`           | Server             | Shared secret required to modify live configuration          |
| `PORT`                  | Server             | Port on which the backend listens                            |
| `SIMULATOR_URL`         | Server             | Public simulator URL used for production keep-alive requests |

`FLEET_SIZE` and `UPDATE_INTERVAL_MS` should be configured consistently between the server and simulator.

---

# Live Configuration

The deployed fleet can be reconfigured without a code change or redeployment.

From the dashboard:

1. Open the sidebar and select **Live Config**.
2. Enter the **control password**, which is the deployed backend's `ADMIN_TOKEN`.
3. Enter a new **fleet size** and/or **update interval**.
4. Leave a field blank if that value should remain unchanged.
5. Click **Apply**.
6. The dashboard displays a success message or explains why the requested value was rejected.

For example, invalid fleet sizes are rejected with an appropriate validation message.

**Control password:**

* **Live deployment testingt:** use the password given in email.
* **Local setup:** set your own value for `ADMIN_TOKEN` in `server/.env` (see `server/.env.example`).

### Reset

The **Reset** button only clears the configuration form locally. It does **not** reset the running fleet configuration.

### Applying Changes

Once the simulator is running, configuration changes are picked up during its next polling cycle, which occurs within approximately **5 seconds**.

On Render's free tier, the simulator may first need to wake from inactivity. This behavior is documented in `FINDINGS.md`.

**Expect a ramp-up delay for larger fleet sizes.** The change is picked up within ~5 seconds, but the fleet does not jump to the new size instantly — each robot has to open its own connection to the backend, and Render's free tier (0.1 CPU) can only accept new connections at a limited rate. In practice:

* Small changes (up to ~100 robots) settle within **~30–60 seconds**.
* Larger fleet sizes (1000–1500 robots) climb steadily but take noticeably longer to fully connect — the rate slows further as the count approaches the target, since the backend is simultaneously serving already-connected robots and accepting new ones on the same limited CPU share.

This is a free-tier resource constraint, not an application bug — see `FINDINGS.md` for the numbers observed at each fleet size.

**Fleet size limits, by environment:**

* **Live Render deployment (this control):** the Live Config endpoint enforces a **maximum of 2,000** — a deliberate safety cap, set below the 2,000–5,000 range where Render's free tier (0.1 CPU, 512MB RAM) was observed to run out of memory and crash. Even at 2,000, expect noticeably slower connection ramp-up past a few hundred robots, since the free tier's CPU limits how fast it can accept new connections — see `FINDINGS.md` for the numbers observed.
* **Running locally:** fleet sizes up to **~7,000–8,000** run cleanly via the `FLEET_SIZE` startup variable, since local hardware isn't CPU/RAM-constrained the way the free tier is. The actual breaking point found in testing was around 10,240 robots (an OS file-descriptor limit, not a code limit) — see `FINDINGS.md` for the full local scaling results.

**Note:** the 2,000 cap applies to the Live Config *button* everywhere (local or Render), since it's the same validation code either way — applying a value above 2,000 through the UI will be rejected on both. To test fleet sizes above 2,000 locally, set `FLEET_SIZE` directly in `server/.env` and `simulator/.env` (matching values in both) and restart both processes — this bypasses the live-control cap by design, since it's a startup value, not a live change.

---

# Local Development

## Prerequisites

* Node.js
* npm
* Git

## Clone the Repository

```bash
git clone https://github.com/prachiijamgaonkar/Fleet-management-System.git
cd Fleet-management-System
```

## Install Dependencies

```bash
npm install
```

## Build the Dashboard

```bash
npm run build
```

This compiles the React frontend into:

```text
web/dist/
```

## Start the Backend

Open a terminal from the project root:

```bash
npm run server
```

The backend starts the server and serves the compiled dashboard.

## Start the Simulator

Open a second terminal from the project root:

```bash
npm run simulator
```

The simulator starts publishing updates for the mock robot fleet.

## Open the Dashboard

Once both processes are running, open:

```text
http://localhost:8080
```

---

# Local Configuration

To customize the local fleet configuration, create the environment files from the provided examples.

### Server

```bash
cp server/.env.example server/.env
```

### Simulator

```bash
cp simulator/.env.example simulator/.env
```

Edit the required values in each `.env` file and restart the corresponding process.

---

# Running Tests

Backend tests can be run with:

```bash
cd server
npm test
```

---

# Rebuilding After Frontend Changes

The backend serves the contents of the compiled `web/dist/` directory.

Therefore, after making changes to files under:

```text
web/src/
```

rebuild the frontend:

```bash
npm run build
```

Then restart the server if required.

---

# AI Delegation Notes

This project was developed collaboratively with **Claude** during an extended implementation and debugging session covering the simulator, backend, frontend, deployment, testing, and documentation. **ChatGPT (OpenAI)** was also used alongside Claude, mainly to research and cross-check some concepts (e.g. WebSocket architecture options, deployment platform choices) while deciding how to approach the project, before implementation work with Claude began.

I built this project with AI assistance, but every architecture and implementation decision was taken carefully — reviewed and directed throughout development.

### Implementation

I directed the implementation step by step with Claude, covering:

* Simulator state management
* Robot movement and status logic
* Backend WebSocket and HTTP handling
* React dashboard components
* Styling and UI implementation

I gave the requirements and direction for each piece, reviewed what Claude produced, and asked for corrections and changes as I tested the running system myself — this was an iterative back-and-forth, not a single one-shot generation.

Key architectural decisions were mine, made deliberately rather than accepted as defaults:

* WebSocket instead of a message queue
* In-memory fleet state instead of a database
* React instead of vanilla JavaScript once dashboard complexity increased
* MUI for the dashboard UI

### Debugging and Load Testing

Performance and reliability findings were based on actual testing of the running system.

This included:

* File-descriptor limit investigation
* React versus vanilla JavaScript performance measurements
* Render free-tier memory/OOM behavior
* Idle-sleep and cold-start behavior
* Fleet scaling and configuration testing

These tests were performed against the running application, and the resulting measurements informed the decisions documented in `FINDINGS.md`.


