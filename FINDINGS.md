# Findings

## 1. The real tradeoffs I made

**Transport: plain WebSocket, both legs (robot→backend, backend→dashboard) — not a message queue.**
A message queue (Kafka/RabbitMQ/MQTT broker) buys durability and decoupling, but this system only ever needs *current* state — robots re-report every ~5 seconds, so nothing is lost if a message is dropped and superseded seconds later. A queue would have meant an extra service to run, configure, and explain if it disappeared, for a durability guarantee this system doesn't use. Cost of this choice: I own reconnect/backpressure logic myself, by hand, rather than getting it for free from a broker — which is also exactly why it's demonstrable and explainable, not a black box.

**In-memory fleet state — no database for current state.**
The fleet `Map` lives in process memory. It's wiped on every server restart, and every robot simply re-reports and refills it within one update cycle. Cost: a server restart mid-operation loses "current state" for a few seconds until robots reconnect — acceptable, since nothing here claims durability. (The *optional* history-persistence stretch goal, which genuinely needs a database, was skipped — see "what I cut" below.)

**React + TypeScript + MUI for the frontend — built vanilla first, migrated deliberately.**
The dashboard started as vanilla JS/HTML, which is genuinely sufficient for the PDF's stated requirements. It was rewritten to React+TS+MUI at explicit request mid-build. This is worth being honest about: the rewrite was not driven by a functional gap — plain JS was working correctly and was load-tested successfully before the switch. The concrete technical benefit it did deliver: `React.memo` on each list row, combined with throttling state updates to at most once per 150ms, reduced the per-incoming-message rendering cost from **5.6ms to under 1ms** at scale (measured directly, both versions, same hardware — see §2). Cost: bundle size grew from ~464KB to ~701KB (226KB gzipped) with MUI included.

**A single shared admin token, not full authentication.**
There's exactly one operator role in this system, not multiple identities to distinguish — a shared secret in an `x-admin-token` header solves "stop an anonymous visitor from resizing the live fleet," which is the actual risk, without building session/account infrastructure this system has no other use for. The token is **not** persisted in `localStorage` (that would make it plaintext and readable by any page JavaScript); the control-password field instead relies on the browser's own password manager (`autoComplete="current-password"` inside a real `<form>`), which is encrypted at rest and not readable by our own code.

**Free hosting tier (Render), two services from one repo — cost: real, observed limitations, documented below rather than hidden.**

## 2. Where the system degrades, with numbers I actually observed

### Local hardware (unconstrained CPU/RAM) — the file-descriptor ceiling

Pushed the fleet size in steps: 2,000 → 5,000 → 8,000 → 20,000, watching both processes' resource usage directly (`lsof`, `ps`).

| Fleet size | Result |
|---|---|
| 2,000 | Clean, negligible CPU/memory |
| 5,000 | Clean |
| 8,000 | Clean |
| 20,000 | **Failure** — both processes hit ~10,240 open file descriptors (confirmed via `sysctl kern.maxfilesperproc` = 10240 on the test machine) and started throwing connection failures; one process entered an uninterruptible I/O wait and had to be force-killed |

**What limits it first, locally: the OS's per-process file-descriptor limit**, not CPU, not memory, not our own code — each simulated robot is a real TCP socket, and the OS caps how many one process can hold open. The safety cap we built into the live-config endpoint (`fleetSize ≤ 5000`) sits at roughly half that observed ceiling — a real, evidence-based margin, not an arbitrary round number.

### Frontend rendering cost — vanilla JS vs. React, same hardware, same test

| Version | Per-message render cost at scale | Responsive ceiling (5s update interval) |
|---|---|---|
| Vanilla JS (original) | 5.6ms per message (full list rebuilt every time) | ~890 robots (math: n × 5.6ms > 5000ms interval) |
| React + `memo` + throttled flush | <1ms per message | Confirmed responsive at ~1,900 rendered rows, never found a ceiling before the fd-limit test superseded it |

Confirmed live: the vanilla version's UI froze/stopped responding to clicks at ~1000 robots; the React version handled the same load and beyond with a 0.10-0.20ms click-handler cost.

### Render's free tier — a different, lower ceiling than local hardware

Same stepped approach, this time against the live deployment (0.1 CPU / 512MB RAM per service):

| Fleet size | Result |
|---|---|
| 8 – 100 | Clean |
| ~2,000-5,000 (exact boundary not pinned down) | **OOM crash** — logs showed a burst of simultaneous `ECONNRESET` errors followed by `"==> Running 'npm run simulator'"` (Render force-restarting the process), consistent with an out-of-memory kill, not a code exception |

**What limits it first on this specific host: RAM (512MB), not file descriptors.** The free tier's ceiling is reached well before the ~10,240-fd limit found locally — the binding constraint depends entirely on the hosting environment, not just the application.

### A second, separate free-tier limitation — unrelated to fleet size

Independently of scale, Render **sleeps any service after ~15 minutes with no incoming HTTP traffic**. The simulator only ever makes *outbound* connections (to the backend) — it never receives direct incoming traffic — so it goes idle on its own regardless of fleet size, silently dropping every robot at once. Observed directly in production logs: robots connected at `10:41:14`, all disconnected simultaneously at `10:56:26` — almost exactly 15 minutes, with no restart signature (unlike the OOM case above), confirming a deliberate sleep rather than a crash. It stayed down for 20+ minutes until manually redeployed.

**Mitigation:** the backend now pings the simulator's own URL once on its own startup and every 10 minutes after. Since Render always wakes the backend on a real visitor's request, that wake-up now cascades to the simulator too, rather than requiring a second, unrelated visitor to hit the simulator's URL directly.

## 3. What I cut, and what I'd build next

**Cut:**
- **Obstacle avoidance / pathfinding.** Robots stay within the overall 900×560 site boundary but don't route around the shelf rectangles drawn on `layout.png` — a robot's dot can visually cross a shelf. This was never an explicit PDF requirement ("stay on the site" refers to the outer boundary), and real pathfinding is a meaningfully larger problem than anything else in scope.
- **Optional history persistence** (`GET /robots/history/{robot_id}`) — explicitly marked optional in the brief; skipped to prioritize the required deliverables given the time budget.
- **An external uptime-monitor as a second layer of keep-alive protection** — the backend-to-simulator ping only works once *something* wakes the backend first; a fully redundant setup would add an external monitor pinging both services independently.
- **Broadcast batching.** Every robot update is sent to dashboards as its own WebSocket message; at far higher fleet sizes than tested here, batching updates server-side (e.g. one message per 150ms containing all changes, mirroring the frontend's own throttle) would reduce message-count overhead.

**What I'd build next, in priority order:**
1. Move off the free tier for any real deployment — eliminates the idle-sleep problem entirely, and raises the RAM ceiling well past what caused the OOM crash.
2. If staying resource-constrained, shard robots across multiple simulator processes instead of one process holding thousands of sockets, avoiding both the fd-limit and memory ceilings.
3. Virtualize the sidebar's robot list (e.g. windowing) for fleets large enough that even the throttled/memoized render starts to cost meaningfully more than a fixed number of visible rows.
4. Add real obstacle-aware movement for the shelf rectangles.
5. Persist history (optional stretch goal) — SQLite, given the scale and single-file simplicity fit this project better than running a separate database service.
