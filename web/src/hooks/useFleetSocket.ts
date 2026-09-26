import { useCallback, useEffect, useRef, useState } from "react";
import type { HistoryPoint, Robot, ServerMessage } from "../types";

// Only push fleet state into React at most this often, regardless of how many
// WebSocket messages arrive in between. Without this, a burst of hundreds of
// robot updates arriving at once (e.g. all robots ticking on the same simulator
// timer) each trigger a full React re-render — this throttle is what keeps the
// UI responsive under that load, independent of how cheap any single render is.
const FLUSH_INTERVAL_MS = 150;

export function useFleetSocket() {
  const fleetMapRef = useRef<Map<string, Robot>>(new Map());
  const dirtyRef = useRef(false);
  const [robots, setRobots] = useState<Robot[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      ws = new WebSocket(`ws://${location.host}/ws/dashboard`);

      ws.onopen = () => setConnected(true);

      ws.onmessage = (event) => {
        const msg: ServerMessage = JSON.parse(event.data);
        if (msg.type === "snapshot") {
          fleetMapRef.current = new Map(msg.robots.map((r) => [r.robot_id, r]));
          setHistory(msg.history);
          dirtyRef.current = true;
        } else if (msg.type === "update") {
          fleetMapRef.current.set(msg.robot.robot_id, msg.robot);
          dirtyRef.current = true;
        } else if (msg.type === "history_point") {
          setHistory((h) => [...h, msg.point]);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        reconnectTimer = setTimeout(connect, 1000);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    const flushTimer = setInterval(() => {
      if (dirtyRef.current) {
        setRobots(Array.from(fleetMapRef.current.values()));
        dirtyRef.current = false;
      }
    }, FLUSH_INTERVAL_MS);

    return () => {
      clearTimeout(reconnectTimer);
      clearInterval(flushTimer);
      ws?.close();
    };
  }, []);

  const applyConfig = useCallback(
    async (token: string, body: { fleetSize?: number; updateIntervalMs?: number }) => {
      const res = await fetch("/config", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": token },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      return { ok: res.ok, data };
    },
    []
  );

  return { robots, history, connected, applyConfig };
}
