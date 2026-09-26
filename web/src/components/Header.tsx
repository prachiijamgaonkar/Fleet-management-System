import { AppBar, Toolbar, Typography, Chip, Stack } from "@mui/material";
import CircleIcon from "@mui/icons-material/Circle";
import PrecisionManufacturingIcon from "@mui/icons-material/PrecisionManufacturing";
import { fontSizes } from "../theme";

interface Props {
  connected: boolean;
}

export function Header({ connected }: Props) {
  return (
    <AppBar position="static" color="default" elevation={0}>
      <Toolbar sx={{ justifyContent: "space-between" }}>
        <Stack direction="row" spacing={1.2} sx={{ alignItems: "center" }}>
          <PrecisionManufacturingIcon color="primary" fontSize="small" />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
             Fleet Control System
          </Typography>
        </Stack>
        <Chip
          size="small"
          icon={<CircleIcon sx={{ fontSize: `${fontSizes.iconDot}px !important` }} />}
          label={connected ? "Live" : "Reconnecting…"}
          color={connected ? "success" : "error"}
          variant="outlined"
          sx={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}
        />
      </Toolbar>
    </AppBar>
  );
}
