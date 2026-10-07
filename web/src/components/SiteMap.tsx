import { useEffect, useRef, useState } from "react";
import type { Robot, RobotHistoryEntry } from "../types";
import { STATUS_COLORS, needsAttention } from "../utils";

interface Props {
  robots: Robot[];
  selectedId: string | null;
}

interface View {
  scale: number;
  offsetX: number;
  offsetY: number;
}

const SITE_WIDTH = 900;
const SITE_HEIGHT = 560;
const MIN_SCALE = 1;
const MAX_SCALE = 12;

// Robots whose screen distance is below this many pixels (at the current
// zoom level) are merged into one cluster marker instead of drawn
// individually. Zooming in shrinks the *site-unit* cell size this maps to,
// so clusters progressively break apart into individual robots as the
// operator zooms in — this is the actual fix for "unreadable at high fleet
// size": individual markers and per-robot ID labels were never going to fit
// on screen at once past a few hundred robots, no matter how clever the
// label-placement logic was.
const CLUSTER_PIXEL_THRESHOLD = 26;
const CLUSTER_MIN_COUNT = 4;

// Worst-first, used to pick a cluster's marker color from its members.
const STATUS_PRIORITY: Robot["status"][] = [
  "error",
  "blocked",
  "offline",
  "maintenance",
  "charging",
  "on_mission",
  "active",
  "idle",
];

function dominantStatus(members: Robot[]): Robot["status"] {
  for (const s of STATUS_PRIORITY) {
    if (members.some((r) => r.status === s)) return s;
  }
  return members[0].status;
}

export function SiteMap({ robots, selectedId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [trail, setTrail] = useState<RobotHistoryEntry[]>([]);
  const [view, setView] = useState<View>({ scale: 1, offsetX: 0, offsetY: 0 });
  const dragRef = useRef<{ startX: number; startY: number; origin: View } | null>(null);

  useEffect(() => {
    if (!selectedId) {
      setTrail([]);
      return;
    }
    fetch(`/robots/history/${selectedId}`)
      .then((res) => res.json())
      .then((data: RobotHistoryEntry[]) => setTrail(data))
      .catch(() => setTrail([]));
  }, [selectedId]);

  // Wheel-to-zoom, kept native (not React's onWheel) so preventDefault
  // reliably stops the page from scrolling while zooming the map.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function onWheel(e: WheelEvent): void {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const my = ((e.clientY - rect.top) / rect.height) * canvas.height;

      setView((v) => {
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
        // keep the point under the cursor fixed while zooming
        const siteX = (mx - v.offsetX) / v.scale;
        const siteY = (my - v.offsetY) / v.scale;
        return {
          scale: nextScale,
          offsetX: mx - siteX * nextScale,
          offsetY: my - siteY * nextScale,
        };
      });
    }

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>): void {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origin: view };
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>): void {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dx = ((e.clientX - drag.startX) / rect.width) * canvas.width;
    const dy = ((e.clientY - drag.startY) / rect.height) * canvas.height;
    setView({ ...drag.origin, offsetX: drag.origin.offsetX + dx, offsetY: drag.origin.offsetY + dy });
  }

  function onPointerUp(): void {
    dragRef.current = null;
  }

  function resetView(): void {
    setView({ scale: 1, offsetX: 0, offsetY: 0 });
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.offsetX, view.offsetY);

    if (trail.length > 1) {
      ctx.beginPath();
      // trail is newest-first (same ordering the history endpoint returns for the chart)
      for (let i = trail.length - 1; i >= 0; i--) {
        const p = trail[i];
        if (i === trail.length - 1) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = "rgba(34, 211, 238, 0.45)";
      ctx.lineWidth = 2 / view.scale;
      ctx.setLineDash([4 / view.scale, 4 / view.scale]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Grid-cell clustering: cell size shrinks as the operator zooms in, so
    // clusters progressively resolve into individual robots rather than
    // needing a separate "expand cluster" interaction.
    const cellSize = CLUSTER_PIXEL_THRESHOLD / view.scale;
    const cells = new Map<string, Robot[]>();
    for (const r of robots) {
      const key = `${Math.floor(r.x / cellSize)},${Math.floor(r.y / cellSize)}`;
      const bucket = cells.get(key);
      if (bucket) bucket.push(r);
      else cells.set(key, [r]);
    }

    const singles: Robot[] = [];

    for (const members of cells.values()) {
      if (members.length < CLUSTER_MIN_COUNT) {
        singles.push(...members);
        continue;
      }

      const cx = members.reduce((sum, r) => sum + r.x, 0) / members.length;
      const cy = members.reduce((sum, r) => sum + r.y, 0) / members.length;
      const status = dominantStatus(members);
      const attention = members.some(needsAttention);
      const radius = Math.min(26, 9 + Math.log2(members.length) * 4);

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = STATUS_COLORS[status] || "#fff";
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = (attention ? 3 : 1.5) / view.scale;
      ctx.strokeStyle = attention ? "#ef4444" : "#fff";
      ctx.stroke();

      const label = String(members.length);
      ctx.font = `bold ${13 / view.scale}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3 / view.scale;
      ctx.strokeStyle = "#111";
      ctx.strokeText(label, cx, cy);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, cx, cy);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }

    for (const r of singles) {
      ctx.beginPath();
      ctx.arc(r.x, r.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = STATUS_COLORS[r.status] || "#fff";
      ctx.fill();
      ctx.lineWidth = 1.5 / view.scale;
      ctx.strokeStyle = "#fff";
      ctx.stroke();

      if (r.robot_id === selectedId) {
        ctx.beginPath();
        ctx.arc(r.x, r.y, 13, 0, Math.PI * 2);
        ctx.lineWidth = 2 / view.scale;
        ctx.strokeStyle = "#22d3ee";
        ctx.stroke();
      }
    }

    // Only the selected robot ever gets a persistent ID label — drawing one
    // per robot is what made the map unreadable past a few hundred robots.
    if (selectedId) {
      const selected = robots.find((r) => r.robot_id === selectedId);
      if (selected) {
        ctx.font = `bold ${11 / view.scale}px sans-serif`;
        const labelX = selected.x + 10;
        const labelY = selected.y - 10;
        ctx.lineWidth = 3 / view.scale;
        ctx.strokeStyle = "#fff";
        ctx.strokeText(selected.robot_id, labelX, labelY);
        ctx.fillStyle = "#111";
        ctx.fillText(selected.robot_id, labelX, labelY);
      }
    }
  }, [robots, selectedId, trail, view]);

  const zoomed = view.scale > 1 || view.offsetX !== 0 || view.offsetY !== 0;

  return (
    <div id="stage">
      <img src="/layout.png" alt="site" />
      <canvas
        ref={canvasRef}
        id="overlay"
        width={SITE_WIDTH}
        height={SITE_HEIGHT}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{ cursor: "grab", touchAction: "none" }}
      />
      {zoomed && (
        <button
          onClick={resetView}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 1,
            background: "rgba(17,17,17,0.8)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.3)",
            borderRadius: 4,
            padding: "4px 10px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Reset view
        </button>
      )}
    </div>
  );
}
