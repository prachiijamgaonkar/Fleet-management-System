import { useMemo, useState } from "react";
import { Box, Paper, Stack } from "@mui/material";
import { useFleetSocket } from "./hooks/useFleetSocket";
import { Header } from "./components/Header";
import { SiteMap } from "./components/SiteMap";
import { StatusLegend } from "./components/StatusLegend";
import { FleetStats } from "./components/FleetStats";
import { RobotList } from "./components/RobotList";
import { AttentionList } from "./components/AttentionList";
import { RobotDetails } from "./components/RobotDetails";
import { ActivityChart } from "./components/ActivityChart";
import { LiveConfig } from "./components/LiveConfig";

export function App() {
  const { robots, history, connected, applyConfig, fetchConfig } = useFleetSocket();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedRobot = useMemo(
    () => robots.find((r) => r.robot_id === selectedId) ?? null,
    [robots, selectedId]
  );

  return (
    <>
      <Header connected={connected} />
      <FleetStats robots={robots} />
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2.5}
        sx={{ maxWidth: 1240, mx: "auto", px: 2.5, pb: 4, alignItems: "flex-start" }}
      >
        <Stack
          spacing={2.5}
          sx={{ flex: { xs: "1 1 auto", md: "2 1 620px" }, width: "100%", minWidth: 0 }}
        >
          <Paper variant="outlined" sx={{ p: 2 }}>
            <SiteMap robots={robots} selectedId={selectedId} />
            <StatusLegend />
          </Paper>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <ActivityChart history={history} />
          </Paper>
        </Stack>

        <Paper
          variant="outlined"
          sx={{
            flex: { xs: "1 1 auto", md: "1 1 300px" },
            width: "100%",
            minWidth: 0,
            p: 2,
            maxHeight: { xs: "none", md: 840 },
            overflowY: "auto",
          }}
        >
          <AttentionList robots={robots} selectedId={selectedId} onSelect={setSelectedId} />
          <Box sx={{ mt: 2 }}>
            <RobotList robots={robots} selectedId={selectedId} onSelect={setSelectedId} />
          </Box>
          <RobotDetails robot={selectedRobot} />
          <LiveConfig applyConfig={applyConfig} fetchConfig={fetchConfig} />
        </Paper>
      </Stack>
    </>
  );
}
