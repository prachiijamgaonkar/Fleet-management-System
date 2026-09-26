import { useEffect, useRef } from "react";
import { Chart, type ChartConfiguration } from "chart.js/auto";
import zoomPlugin from "chartjs-plugin-zoom";
import { Button, Stack, Typography } from "@mui/material";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import type { HistoryPoint } from "../types";

Chart.register(zoomPlugin);

interface Props {
  history: HistoryPoint[];
}

function pctActive(p: HistoryPoint) {
  return p.total ? (p.active / p.total) * 100 : 0;
}

export function ActivityChart({ history }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const config: ChartConfiguration<"line"> = {
      type: "line",
      data: { datasets: [{ label: "% active", data: [], borderColor: "#4caf50", tension: 0.2, pointRadius: 0 }] },
      options: {
        parsing: false,
        animation: false,
        scales: {
          x: {
            type: "linear",
            ticks: { color: "#aaa", callback: (val) => new Date(val as number).toLocaleTimeString() },
            grid: { color: "#333" },
          },
          y: { min: 0, max: 100, ticks: { color: "#aaa" }, grid: { color: "#333" } },
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
    chart.data.datasets[0].data = history.map((p) => ({ x: p.t, y: pctActive(p) }));
    chart.update("none");
  }, [history]);

  return (
    <>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
        <Typography variant="overline" color="text.secondary">Fleet Activity</Typography>
        <Button
          size="small"
          startIcon={<RestartAltIcon fontSize="small" />}
          onClick={() => chartRef.current?.resetZoom()}
          sx={{ fontSize: 12 }}
        >
          Reset zoom
        </Button>
      </Stack>
      <canvas ref={canvasRef} id="trend" width={900} height={200} />
      <div id="trend-hint">scroll/pinch to zoom, drag to pan</div>
    </>
  );
}
