# Fleet Management Dashboard

A live fleet management dashboard built as an end-to-end full-stack system.

The system consists of:

* A **simulated robot fleet** that continuously publishes robot position, status, and battery information over WebSocket.
* A **Node.js + TypeScript backend** that ingests robot updates, maintains the latest fleet state, and broadcasts updates to connected dashboard clients.
* A **React + TypeScript dashboard** that provides a live site view, fleet trends, robot search, and a **Needs Attention** view.
* **Live configuration controls** that allow fleet size and update interval to be changed without modifying code or redeploying the application.
* **Persisted robot history** — each robot's position, status, and battery are written to a TimescaleDB-backed Postgres database and exposed through `GET /robots/history/:robotId`, so per-robot history survives a backend restart (the optional stretch goal from the challenge). **Why Postgres + TimescaleDB:** the history writes are append-only and always queried by time range per robot — exactly the access pattern TimescaleDB's hypertables are built to optimize — while still being plain Postgres underneath, so no new query language or client library was needed on top of what `pg`/TypeORM already provide.

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

The server and simulator are two separate processes with two separate `.env` files
(`server/.env` and `simulator/.env`) — they are listed separately below so it's clear which
variable belongs to which process. A few values (`FLEET_SIZE`, `UPDATE_INTERVAL_MS`) exist in
**both** files and must be kept consistent between the two; everything else only exists in one.

### Server (`server/.env`)

| Variable              | Purpose                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `PORT`                 | Port on which the backend listens                            |
| `ADMIN_TOKEN`          | Shared secret required to modify live configuration          |
| `SIMULATOR_URL`        | Public simulator URL used for production keep-alive requests |
| `FLEET_SIZE`           | Initial number of simulated robots (must match the simulator's) |
| `UPDATE_INTERVAL_MS`   | Initial robot update interval (must match the simulator's)   |
| `DB_HOST`              | Postgres host for the robot history store                    |
| `DB_PORT`              | Postgres port                                                 |
| `DB_USERNAME`          | Postgres username                                             |
| `DB_PASSWORD`          | Postgres password                                             |
| `DB_NAME`              | Postgres database name                                        |
| `DB_SSL`               | Set to `true` for a managed Postgres that requires SSL (e.g. Timescale Cloud); leave `false` for local Postgres |

The server will not start without a reachable Postgres database — `DB_HOST` through `DB_NAME`
are required, not optional. On startup, TypeORM creates the `robot_history` and
`fleet_activity` tables automatically (`synchronize: true`); converting them into TimescaleDB
hypertables is a one-time step covered in **Local Development** below.

### Simulator (`simulator/.env`)

| Variable                | Purpose                                                     |
| ------------------------ | ------------------------------------------------------------ |
| `WS_URL`                 | WebSocket URL of the backend's robot-ingestion endpoint      |
| `CONTROL_URL`             | HTTP URL of the backend, polled for live config changes      |
| `FLEET_SIZE`              | Starting fleet size (must match the server's)                |
| `UPDATE_INTERVAL_MS`      | Starting update interval, in ms (must match the server's)    |
| `PAYLOAD_PADDING_BYTES`   | Extra filler bytes added to each message, for payload-size testing |

If the server and simulator's `FLEET_SIZE`/`UPDATE_INTERVAL_MS` disagree at startup, the
simulator self-corrects to the server's value within one polling cycle (~5s) — so a mismatch
isn't fatal, but it will cause a brief, visible jump right after both processes start.

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

**Taking time to reach the target is expected behavior, not an error.** The Total count climbing gradually toward the requested fleet size — rather than jumping there instantly — means the change is actively being applied, not stuck or failing. The count may also briefly pause at a given number before continuing to climb; this is still normal, and it will keep progressing toward the target. This is a free-tier resource constraint, not an application bug — see `FINDINGS.md` for the numbers observed at each fleet size.

**Fleet size limits, by environment:**

* **Live Render deployment (this control):** the Live Config endpoint enforces a **maximum of 1,500** — a deliberate safety cap, set below the 2,000–5,000 range where Render's free tier (0.1 CPU, 512MB RAM) was observed to run out of memory and crash. Even at 1,500, expect noticeably slower connection ramp-up past a few hundred robots, since the free tier's CPU limits how fast it can accept new connections — see `FINDINGS.md` for the numbers observed.
* **Running locally:** fleet sizes up to **~7,000–8,000** run cleanly via the `FLEET_SIZE` startup variable, since local hardware isn't CPU/RAM-constrained the way the free tier is. The actual breaking point found in testing was around 10,240 robots (an OS file-descriptor limit, not a code limit) — see `FINDINGS.md` for the full local scaling results.

**Note:** the 1,500 cap applies to the Live Config *button* everywhere (local or Render), since it's the same validation code either way — applying a value above 1,500 through the UI will be rejected on both. To test fleet sizes above 1,500 locally, set `FLEET_SIZE` directly in `server/.env` and `simulator/.env` (matching values in both) and restart both processes — this bypasses the live-control cap by design, since it's a startup value, not a live change.

---

# Before You Start: Setup Precautions

A few things worth checking before running this locally, especially on a machine that hasn't
run this project before:

* **Postgres must be running and reachable before you start the server.** The server calls
  `AppDataSource.initialize()` on startup and will fail to boot if it can't reach Postgres —
  this isn't a soft dependency. Confirm `psql -h $DB_HOST -p $DB_PORT -U $DB_USERNAME -d $DB_NAME`
  connects successfully before running `npm run server`.
* **The TimescaleDB extension version must match your installed Postgres major version.**
  `timescaledb-2-postgresql-18` only works against Postgres 18 — check with `psql --version`
  first. Installing the wrong package version will fail silently at `apt install` or fail
  later at `CREATE EXTENSION`.
* **`server/.env` and `simulator/.env` are two different files** (see **Configuration**
  above) — copy both from their respective `.env.example`, not just one. A missing
  `simulator/.env` will leave the simulator trying to reach `ws://localhost:8080/ws/robots`
  by default, which only works if the server's `PORT` is also `8080`.
* **`FLEET_SIZE` and `UPDATE_INTERVAL_MS` should match between the two `.env` files.** They
  don't have to — the simulator self-corrects to the server's value within one poll cycle —
  but mismatched values will cause a brief, visible fleet-size jump right after both processes
  start, which can look like a bug if you're not expecting it.
* **Ports must be free.** The server defaults to `8080`; the simulator talks to it over both
  `WS_URL` and `CONTROL_URL`, which default to that same port. If something else on the
  machine already uses `8080`, change `PORT` in `server/.env` and update `simulator/.env`'s
  `WS_URL`/`CONTROL_URL` to match.
* **Run the server once before creating hypertables.** `create_hypertable()` only works on a
  table that already exists — the server has to start at least once first so TypeORM's
  `synchronize: true` creates `robot_history` and `fleet_activity`, *then* the hypertable SQL
  in **Database Setup (Linux)** below can run.
* **`DB_SSL` must match the target database.** `true` against a local Postgres (which usually
  has no SSL configured) will fail to connect; `false` against a managed Postgres that
  requires SSL (e.g. Timescale Cloud) will also fail to connect. Local Postgres →
  `DB_SSL=false`; a cloud/managed Postgres → `DB_SSL=true`.

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

## Database Setup (Linux)

The server persists robot history to Postgres and needs the **TimescaleDB** extension for hypertables. These steps assume a Debian/Ubuntu-based Linux machine with Postgres 18 already installed (check with `psql --version`).

Add the TimescaleDB apt repo and install the extension package matching your Postgres major version:

```bash
sudo apt install gnupg postgresql-common apt-transport-https lsb-release wget
echo "deb [signed-by=/usr/share/keyrings/timescale.keyring] https://packagecloud.io/timescale/timescaledb/$(lsb_release -is | tr '[:upper:]' '[:lower:]')/ $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/timescaledb.list
wget --quiet -O - https://packagecloud.io/timescale/timescaledb/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/timescale.keyring
sudo apt update
sudo apt install timescaledb-2-postgresql-18
sudo timescaledb-tune --quiet --yes
sudo systemctl restart postgresql
```

Create the local database:

```bash
createdb robot
```

Set `server/.env` to point at it (see `server/.env.example`):

```text
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=
DB_NAME=robot
DB_SSL=false
```

Start the server once (`npm run server`, see below) so TypeORM creates the `robot_history` and `fleet_activity` tables, then convert them into hypertables:

```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;
SELECT create_hypertable('robot_history', 'recorded_at', if_not_exists => true);
SELECT create_hypertable('fleet_activity', 'recorded_at', if_not_exists => true);
```

This is a one-time step per fresh database — it does not need to be repeated unless the database is recreated.

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
* In-memory fleet state for the live view, with history persisted separately to TimescaleDB for the `/robots/history/:robotId` stretch goal — TimescaleDB was chosen because the history writes are append-only, time-ordered, and queried by time range, which is exactly what its hypertables are built for
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


