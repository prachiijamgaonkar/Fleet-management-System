# Architecture

## Diagram

```
                    ┌─────────────────────────────────────────┐
                    │              fleet-server                │
                    │         (Node + TypeScript + ws)          │
                    │                                            │
  ┌─────────────┐   │  ┌──────────┐      ┌─────────────────┐   │   ┌──────────────┐
  │             │   │  │ robotWSS │      │  fleet: Map      │   │   │              │
  │  simulator  │◄──┼──┤ /ws/robots│─────►│ (robot_id →      │──┼──►│  dashboard   │
  │ (8+ SimRobot│ WS │  └──────────┘      │  latest state)   │   │WS│  (browser)   │
  │  instances) │   │                     └─────────────────┘   │   │              │
  │             │───┼─────► GET/POST /config (HTTP) ◄───────────┼───┤              │
  └─────────────┘   │                                            │   └──────────────┘
                    │  ┌──────────┐                              │
                    │  │dashboardWSS│◄────────────────────────────┼───┐
                    │  │/ws/dashboard│  history: HistoryPoint[]   │   │
                    │  └──────────┘  (rolling, capped at 720)     │   │
                    │        │                                    │   │
                    │        └── snapshot + live "update"/         │   │
                    │            "history_point" broadcasts ───────┼───┘
                    │                                            │
                    │  express.static(web/dist)  ← serves the     │
                    │  React dashboard from the same origin       │
                    │                                            │
                    │  ┌──────────────┐                          │
                    │  │ history      │  buffered batch INSERT    │
                    │  │ .service.ts  │──────────────────────────┼──┐
                    │  └──────────────┘  every 2s or 200 points   │  │
                    └─────────────────────────────────────────┘  │
                                                                   ▼
                                                    ┌──────────────────────────┐
                                                    │  Postgres + TimescaleDB   │
                                                    │  (Timescale Cloud)        │
                                                    │  robot_history,           │
                                                    │  fleet_activity           │
                                                    │  (hypertables on          │
                                                    │   recorded_at, 24h        │
                                                    │   retention policy)       │
                                                    └──────────────────────────┘
                                                                   ▲
                                        GET /robots/history/:robotId (REST, polled by dashboard)
```

Two logically separate WebSocket servers (`robotWSS`, `dashboardWSS`) share one HTTP server
and one process — routed by URL path in a single `server.on("upgrade", ...)` handler, not two
separate deployed services. The simulator and the dashboard never talk to each other directly;
the server is the only thing either of them knows about.

## Walkthrough: a robot publishing an event → a pixel changing on the dashboard

1. **Inside the simulator**, each `SimRobot`'s `tick()` (called every `UPDATE_INTERVAL_MS`)
   updates its own status/position/battery, then calls `publish()`, which sends one JSON
   message over its own WebSocket connection to `/ws/robots`.
2. **The server's `robotWSS` "message" handler** receives it, tags the socket with
   `ws.robotId` (so a later disconnect knows which robot to mark offline), writes the update
   into the in-memory `fleet` Map (`fleet.set(robot_id, update)` — this is the single source
   of truth for "current state"), and immediately calls `broadcastToDashboards(update)`.
3. **`broadcastToDashboards`** sends `{ type: "update", robot: ... }` to every currently-open
   dashboard WebSocket connection — a simple loop over `dashboardWSS.clients`, no buffering,
   no batching.
4. **In the browser**, `useFleetSocket`'s `ws.onmessage` handler receives it, writes it into a
   `Map` ref (`fleetMapRef`), and sets a `dirty` flag — it does **not** call `setState`
   directly. A separate `setInterval` flushes the ref into real React state at most once every
   150ms, regardless of how many messages arrived in between.
5. **React re-renders** only the components whose props actually changed — each robot row is
   wrapped in `React.memo`, so a single robot's update only re-renders *that* row, not the
   whole list. The map itself is a `<canvas>`, redrawn imperatively in a `useEffect` keyed on
   the `robots` array reference.
6. **The pixel changes**: the canvas clears and redraws every robot's dot at its new
   `(x, y)`, colored by its current `status`.

Total path: one WebSocket message → one Map write → one broadcast loop → (throttled) one
React state update → one canvas redraw. No polling anywhere in this path — everything is
pushed.

**In parallel, the same update is buffered for history.** Step 2's handler also calls
`recordHistoryPoint(robot)`, which pushes the point into an in-memory array — it does **not**
write to Postgres on every message. A `setInterval` flushes that buffer as one batch `INSERT`
every 2 seconds, or immediately once the buffer hits 200 points, whichever comes first. This
keeps the live WebSocket path (steps 1–6 above) completely decoupled from database latency: a
slow or momentarily unreachable Postgres can only delay when history is durably written, it
can never block or slow down a robot's position reaching the dashboard. When the dashboard
later calls `GET /robots/history/:robotId`, that's a separate REST read straight from
`robot_history`, independent of the live WebSocket feed.

**Old history is dropped automatically, independently of any of the above.** The app only ever
queries the last hour (`HISTORY_WINDOW_MS` in `history.service.ts`), so a TimescaleDB native
retention policy (`add_retention_policy`, 24h on both `robot_history` and `fleet_activity`)
drops whole time-partitioned chunks once they age out — not a row-by-row `DELETE`, which
TimescaleDB's own docs note is slower and needs vacuuming afterward. This runs on TimescaleDB's
own background scheduler, independent of the server process entirely — it keeps running even if
the server is down, and needs no code, cron job, or app-level cleanup logic. It matters
specifically because Timescale Cloud's free tier caps storage at 1 GiB; without this, the
history tables would grow unbounded until writes started failing.

## What happens when things go wrong

### A robot dies mid-task (its connection just stops)

The server's heartbeat (`setInterval`, every 10s) pings every robot socket and tracks
`isAlive`. If a socket didn't `pong` back since the last check, `ws.terminate()` is called,
which fires the socket's `"close"` handler → `handleRobotOffline(robotId)` →
`markRobotOffline(fleet, robotId)`. This sets `status: "offline"` on that robot's entry
**without deleting it** (see FINDINGS.md for why), and broadcasts that single update to every
dashboard — so a robot that goes dark mid-task is shown as `offline`, with its last known
position and battery still visible, not silently removed from the map.

### Updates arrive late or out of order

Every message the server receives simply **overwrites** `fleet.get(robot_id)` with whatever
arrived, unconditionally — there's no sequence number or timestamp check. In the current
design (one WebSocket per robot, in-order TCP delivery, single-threaded Node event loop
processing messages one at a time), true out-of-order delivery *within* one robot's stream
isn't possible — TCP guarantees order on a single connection, and Node processes the "message"
event queue sequentially. What can happen is a message being processed *late* relative to wall
clock — during that heartbeat/broadcast loop, if event loop lag exists, a robot's dashboard
`update` could lag its `t` field's actual publish time. This is not currently corrected for
(no message carries a monotonic sequence number the client could use to discard a stale
update) — a real gap, and the honest fix would be attaching an incrementing sequence number
per robot and having the dashboard ignore any update older than what it already has.

### A dashboard client drops and reconnects

`useFleetSocket`'s `ws.onclose` handler schedules a reconnect after 1 second. On reconnecting,
`dashboardWSS`'s `"connection"` handler immediately sends a full `snapshot` (`{ type:
"snapshot", robots: [...all current state], history: [...] }`) — so a reconnecting dashboard
is never left showing stale data; it gets fully caught up in one message, then resumes
receiving incremental `update`/`history_point` messages as before. The `hasSnapshot` flag
(added specifically for this) distinguishes "still waiting for that first snapshot" from
"received it and the fleet is genuinely empty," so a slow reconnect shows an honest loading
state instead of a misleading empty dashboard.

### A robot's own connection drops (network blip, not death)

The simulator's own reconnect logic (`ws.on("close")`) retries with exponential backoff
(1s → 2s → 4s → ... capped at 15s), resetting to 1s on a successful reconnect. Deliberately
decommissioned robots (from a live scale-down) set a `removed` flag first, so their `close`
handler knows not to reconnect — the same event, two different meanings, disambiguated by
that flag.

### The history database is unreachable or slow

Because history writes are buffered and flushed on a timer (see the walkthrough above), a
Postgres outage never blocks the live WebSocket path — robots keep reporting, the dashboard
keeps updating, `GET /robots/history/:robotId` is the only thing that degrades. If
`flushHistoryBuffer`'s `INSERT` throws (connection drop, timeout), the error is caught and
logged, but the batch that failed to write is **not retried or requeued** — it's simply
dropped, and the buffer moves on to accumulating the next batch. This is a deliberate
trade-off for a dev/demo-scale system (no queue, no backpressure, no durability guarantee on
history specifically), and the honest fix for a system that needed to guarantee no history
loss would be a durable queue (or at least an on-disk retry buffer) in front of the batch
insert — not something currently in place.

## What I'd change first if the fleet grew another 10×

At the scale already tested (up to 20,000 robots locally, hitting a ~10,240 OS file-descriptor
ceiling — see FINDINGS.md), the very first thing to change is **the one-WebSocket-per-robot
model itself**. Ten times today's tested ceiling means well past what a single process's file
descriptors can hold regardless of tuning. The fix isn't a bigger instance — it's a different
transport shape: batch multiple robots' updates over fewer, multiplexed connections (e.g. one
connection per N robots, or a proper message queue as the producer side, which was
deliberately avoided at this scale for being unnecessary — see FINDINGS.md — but stops being
unnecessary once a single process can no longer hold one socket per producer). The in-memory
`fleet` Map itself would also need to move to something shared across multiple server
processes at that point, since a single Node process holding all state stops being viable once
ingestion itself needs to be split across machines.
