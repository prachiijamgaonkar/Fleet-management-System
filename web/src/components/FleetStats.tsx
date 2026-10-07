import { useMemo } from "react";
import { Stack, Card, Typography } from "@mui/material";
import type { Robot } from "../types";
import { needsAttention } from "../utils";
import { monoFont } from "../theme";

interface Props {
  robots: Robot[];
}

function StatTile({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <Card variant="outlined" sx={{ px: 2.5, py: 1.2, flex: 1, minWidth: 0 }}>
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4 }}>
        {label}
      </Typography>
      <Typography variant="h5" sx={{ fontFamily: monoFont, fontWeight: 600, color: color ?? "text.primary" }}>
        {value}
      </Typography>
    </Card>
  );
}

export function FleetStats({ robots }: Props) {
  const stats = useMemo(() => {
    const total = robots.length;
    const active = robots.filter((r) => r.status === "active" || r.status === "on_mission").length;
    const charging = robots.filter((r) => r.status === "charging").length;
    const attention = robots.filter(needsAttention).length;
    return { total, active, charging, attention };
  }, [robots]);

  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1.5}
      sx={{ maxWidth: 1240, mx: "auto", px: 2.5, py: 2.5 }}
    >
      <StatTile label="Total" value={stats.total} />
      <StatTile label="Active" value={stats.active} color="success.main" />
      <StatTile label="Charging" value={stats.charging} color="warning.main" />
      <StatTile label="⚠ Attention" value={stats.attention} color={stats.attention > 0 ? "error.main" : undefined} />
    </Stack>
  );
}
