import { useEffect, useRef, useState } from "react";
import type { Robot, RobotHistoryEntry } from "../types";
import { STATUS_COLORS } from "../utils";

interface Props {
  robots: Robot[];
  selectedId: string | null;
}

interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2);
}

// Labels default to the dot's top-right, but with enough robots that puts
// two nearby robots' ID text directly on top of each other. This tries a
// handful of fallback offsets, in increasing distance from the dot, and
// picks the first one that doesn't collide with an already-placed label.
const LABEL_OFFSETS = [
  { dx: 10, dy: -10 },
  { dx: 10, dy: 16 },
  { dx: -10, dy: -10, align: "right" as const },
  { dx: -10, dy: 16, align: "right" as const },
  { dx: 10, dy: -24 },
  { dx: 10, dy: 32 },
];

export function SiteMap({ robots, selectedId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [trail, setTrail] = useState<RobotHistoryEntry[]>([]);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (trail.length > 1) {
      ctx.beginPath();
      // trail is newest-first (same ordering the history endpoint returns for the chart)
      for (let i = trail.length - 1; i >= 0; i--) {
        const p = trail[i];
        if (i === trail.length - 1) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = "rgba(34, 211, 238, 0.45)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const r of robots) {
      ctx.beginPath();
      ctx.arc(r.x, r.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = STATUS_COLORS[r.status] || "#fff";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.stroke();

      if (r.robot_id === selectedId) {
        ctx.beginPath();
        ctx.arc(r.x, r.y, 13, 0, Math.PI * 2);
        ctx.strokeStyle = "#22d3ee";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    ctx.font = "bold 11px sans-serif";
    const textHeight = 11;
    const placed: Rect[] = [];

    for (const r of robots) {
      const textWidth = ctx.measureText(r.robot_id).width;
      let chosen = LABEL_OFFSETS[0];
      let rect: Rect | null = null;

      for (const offset of LABEL_OFFSETS) {
        const x = r.x + offset.dx - (offset.align === "right" ? textWidth : 0);
        const y = r.y + offset.dy;
        const candidate: Rect = { x1: x, y1: y - textHeight, x2: x + textWidth, y2: y + 2 };
        if (!placed.some((p) => rectsOverlap(candidate, p))) {
          chosen = offset;
          rect = candidate;
          break;
        }
      }
      // every offset collided — fall back to the default position anyway,
      // rather than silently not drawing the label at all
      if (!rect) {
        const x = r.x + chosen.dx - (chosen.align === "right" ? textWidth : 0);
        const y = r.y + chosen.dy;
        rect = { x1: x, y1: y - textHeight, x2: x + textWidth, y2: y + 2 };
      }
      placed.push(rect);

      const labelX = rect.x1;
      const labelY = rect.y2 - 2;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#fff";
      ctx.strokeText(r.robot_id, labelX, labelY);
      ctx.fillStyle = "#111";
      ctx.fillText(r.robot_id, labelX, labelY);
    }
  }, [robots, selectedId, trail]);

  return (
    <div id="stage">
      <img src="/layout.png" alt="site" />
      <canvas ref={canvasRef} id="overlay" width={900} height={560} />
    </div>
  );
}
