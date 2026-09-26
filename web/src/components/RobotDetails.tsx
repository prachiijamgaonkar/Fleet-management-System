import type { ReactNode } from "react";
import { Box, Paper, Stack, Typography, Chip, Divider } from "@mui/material";
import type { Robot } from "../types";
import { STATUS_COLORS } from "../utils";
import { monoFont, fontSizes } from "../theme";

interface Props {
  robot: Robot | null;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", py: 0.7 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      {children}
    </Stack>
  );
}

export function RobotDetails({ robot }: Props) {
  return (
    <>
      <Typography variant="overline" color="text.secondary" sx={{ display: "block", mt: 2, mb: 0.5 }}>
        Selected
      </Typography>
      <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "background.default" }}>
        {robot ? (
          <Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", mb: 0.5 }}>
              <Typography sx={{ fontFamily: monoFont, fontWeight: 700, fontSize: fontSizes.dataLg }}>{robot.robot_id}</Typography>
              <Typography variant="caption" color="text.secondary">{robot.robot_type}</Typography>
            </Stack>
            <Divider sx={{ my: 0.5 }} />
            <Row label="Status">
              <Chip
                label={robot.status}
                size="small"
                sx={{
                  bgcolor: `${STATUS_COLORS[robot.status]}26`,
                  color: STATUS_COLORS[robot.status],
                  fontWeight: 600,
                  fontSize: fontSizes.badge,
                  height: 20,
                  textTransform: "uppercase",
                }}
              />
            </Row>
            <Divider />
            <Row label="Battery"><Typography sx={{ fontFamily: monoFont, fontSize: fontSizes.dataMd }}>{robot.battery.toFixed(1)}%</Typography></Row>
            <Divider />
            <Row label="Position"><Typography sx={{ fontFamily: monoFont, fontSize: fontSizes.dataMd }}>({robot.x.toFixed(0)}, {robot.y.toFixed(0)})</Typography></Row>
          </Box>
        ) : (
          <Typography variant="body2" color="text.disabled">Click a robot to see details</Typography>
        )}
      </Paper>
    </>
  );
}
