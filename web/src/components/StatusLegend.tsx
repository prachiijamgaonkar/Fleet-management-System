import { Stack, Box, Typography, Divider } from "@mui/material";
import { STATUS_COLORS } from "../utils";

const LABELS: Record<string, string> = {
  idle: "Idle",
  active: "Active",
  on_mission: "On mission",
  charging: "Charging",
  blocked: "Blocked",
  error: "Error",
  maintenance: "Maintenance",
  offline: "Offline",
};

export function StatusLegend() {
  return (
    <>
      <Divider sx={{ mt: 2, mb: 1.5 }} />
      <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2 }}>
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <Stack direction="row" spacing={0.7} sx={{ alignItems: "center" }} key={status}>
            <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: color, flexShrink: 0 }} />
            <Typography variant="caption" color="text.secondary">{LABELS[status]}</Typography>
          </Stack>
        ))}
      </Stack>
    </>
  );
}
