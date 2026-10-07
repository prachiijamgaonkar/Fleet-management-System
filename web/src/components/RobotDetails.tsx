import type { ReactNode } from "react";
import { Stack, Typography, Chip } from "@mui/material";
import type { Robot } from "../types";
import { STATUS_COLORS } from "../utils";
import { monoFont, fontSizes } from "../theme";
import { StatusIcon } from "./StatusIcon";

interface Props {
  robot: Robot;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      {children}
    </Stack>
  );
}

// Content only, no outer card/border — the parent renders one shared card
// around this plus the battery history chart, so they read as a single unit.
export function RobotDetails({ robot }: Props) {
  return (
    <Stack spacing={0.7}>
      <Row label="Status">
        <Chip
          icon={<StatusIcon status={robot.status} color={STATUS_COLORS[robot.status]} size={12} />}
          label={robot.status}
          size="small"
          sx={{
            bgcolor: `${STATUS_COLORS[robot.status]}26`,
            color: STATUS_COLORS[robot.status],
            fontWeight: 600,
            fontSize: fontSizes.badge,
            height: 20,
            textTransform: "uppercase",
            "& .MuiChip-icon": { ml: "6px" },
          }}
        />
      </Row>
      <Row label="Battery"><Typography sx={{ fontFamily: monoFont, fontSize: fontSizes.dataMd }}>{robot.battery.toFixed(1)}%</Typography></Row>
      <Row label="Position"><Typography sx={{ fontFamily: monoFont, fontSize: fontSizes.dataMd }}>({robot.x.toFixed(0)}, {robot.y.toFixed(0)})</Typography></Row>
    </Stack>
  );
}
