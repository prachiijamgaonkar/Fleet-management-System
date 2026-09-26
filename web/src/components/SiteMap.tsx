import { useEffect, useRef } from "react";
import type { Robot } from "../types";
import { STATUS_COLORS } from "../utils";

interface Props {
  robots: Robot[];
  selectedId: string | null;
}

export function SiteMap({ robots, selectedId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

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

      ctx.font = "bold 11px sans-serif";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#fff";
      ctx.strokeText(r.robot_id, r.x + 10, r.y - 10);
      ctx.fillStyle = "#111";
      ctx.fillText(r.robot_id, r.x + 10, r.y - 10);
    }
  }, [robots, selectedId]);

  return (
    <div id="stage">
      <img src="/layout.png" alt="site" />
      <canvas ref={canvasRef} id="overlay" width={900} height={560} />
    </div>
  );
}
