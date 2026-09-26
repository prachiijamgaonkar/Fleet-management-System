import { memo } from "react";
import { ListItemButton, Stack, Typography, Chip } from "@mui/material";
import type { Robot } from "../types";
import { needsAttention, STATUS_COLORS } from "../utils";
import { monoFont, fontSizes } from "../theme";

interface Props {
  robot: Robot;
  selected: boolean;
  onSelect: (id: string) => void;
}

// memo() means React only re-renders THIS row if its own props changed —
// this is the concrete fix for the "full list rebuild on every message" bug
// we found in the vanilla version. Updating one robot no longer touches the
// other 999 rows' DOM nodes at all.
export const RobotRow = memo(function RobotRow({ robot, selected, onSelect }: Props) {
  const attention = needsAttention(robot);
  const color = STATUS_COLORS[robot.status];

  return (
    <ListItemButton
      selected={selected}
      onClick={() => onSelect(robot.robot_id)}
      sx={{
        borderRadius: "4px",
        mb: 0.4,
        borderLeft: "3px solid",
        borderLeftColor: attention ? "error.main" : "transparent",
      }}
    >
      <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center", width: "100%" }}>
        <Stack direction="row" spacing={0.6} sx={{ alignItems: "baseline", minWidth: 0 }}>
          <Typography noWrap sx={{ fontFamily: monoFont, fontWeight: 600, fontSize: fontSizes.dataMd }}>
            {robot.robot_id}
          </Typography>
          <Typography noWrap variant="caption" color="text.secondary">
            {robot.robot_type}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexShrink: 0 }}>
          <Chip
            label={robot.status}
            size="small"
            sx={{
              bgcolor: `${color}26`,
              color,
              fontWeight: 600,
              fontSize: fontSizes.badge,
              height: 20,
              textTransform: "uppercase",
            }}
          />
          <Typography color="text.secondary" sx={{ fontFamily: monoFont, fontSize: fontSizes.dataSm, width: 32, textAlign: "right" }}>
            {robot.battery.toFixed(0)}%
          </Typography>
        </Stack>
      </Stack>
    </ListItemButton>
  );
});
