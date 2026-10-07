import { useEffect, useRef, useState } from "react";
import { Chart, type ChartConfiguration } from "chart.js/auto";
import zoomPlugin from "chartjs-plugin-zoom";
import { Stack, Button, Typography } from "@mui/material";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import type { RobotHistoryEntry } from "../types";

Chart.register(zoomPlugin);

interface Props {
  robotId: string | null;
}

export function RobotHistoryChart({ robotId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const [points, setPoints] = useState<RobotHistoryEntry[]>([]);

  useEffect(() => {
    if (!robotId) {
      setPoints([]);
      return;
    }
    fetch(`/robots/history/${robotId}`)
      .then((res) => res.json())
      .then((data: RobotHistoryEntry[]) => {
        setPoints([...data].reverse());
      })
      .catch(() => setPoints([]));
  }, [robotId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const config: ChartConfiguration<"line"> = {
      type: "line",
      data: { datasets: [{ label: "battery %", data: [], borderColor: "#42a5f5", tension: 0.2, pointRadius: 0 }] },
      options: {
        parsing: false,
        animation: false,
        scales: {
          x: {
            type: "linear",
            ticks: {
              color: "#aaa",
              font: { size: 10 },
              maxTicksLimit: 4,
              callback: (val) => new Date(val as number).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            },
            grid: { color: "#333" },
          },
          y: {
            min: 0,
            max: 100,
            ticks: { color: "#aaa", stepSize: 50, font: { size: 10 } },
            grid: { color: "#333" },
          },
        },
        plugins: {
          legend: { labels: { color: "#eee" } },
          zoom: {
            zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: "x" },
            pan: { enabled: true, mode: "x" },
          },
        },
      },
    };

    chartRef.current = new Chart(canvas, config);
    return () => chartRef.current?.destroy();
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.data.datasets[0].data = points.map((p) => ({ x: new Date(p.recorded_at).getTime(), y: p.battery }));
    chart.update("none");
  }, [points]);

  const hasData = Boolean(robotId) && points.length > 0;

  return (
    <>
      {robotId && points.length === 0 && (
        <Typography variant="body2" color="text.disabled">No history recorded yet for this robot.</Typography>
      )}
      {hasData && (
        <Stack direction="row" sx={{ justifyContent: "flex-end", mb: 0.5 }}>
          <Button
            size="small"
            startIcon={<RestartAltIcon fontSize="small" />}
            onClick={() => chartRef.current?.resetZoom()}
            sx={{ fontSize: 12 }}
          >
            Reset
          </Button>
        </Stack>
      )}
      <canvas ref={canvasRef} width={300} height={140} style={{ display: hasData ? "block" : "none" }} />
      {hasData && (
        <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.5 }}>
          scroll/pinch to zoom, drag to pan
        </Typography>
      )}
    </>
  );
}
