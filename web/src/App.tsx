import { useState } from "react";
import { Box, Paper, Stack, CircularProgress, Typography, Tabs, Tab } from "@mui/material";
import { useFleetSocket } from "./hooks/useFleetSocket";
import { Header } from "./components/Header";
import { SiteMap } from "./components/SiteMap";
import { StatusLegend } from "./components/StatusLegend";
import { FleetStats } from "./components/FleetStats";
import { RobotList } from "./components/RobotList";
import { AttentionList } from "./components/AttentionList";
import { ActivityChart } from "./components/ActivityChart";
import { LiveConfig } from "./components/LiveConfig";

export function App() {
  const { robots, history, connected, hasSnapshot, applyConfig } = useFleetSocket();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState(0);

  // clicking an already-selected robot closes its expanded details again
  function handleSelect(id: string) {
    setSelectedId((current) => (current === id ? null : id));
  }

  return (
    <>
      <Header connected={connected} />
      <FleetStats robots={robots} />
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2.5}
        sx={{ maxWidth: 1240, mx: "auto", px: 2.5, pb: 4, alignItems: "stretch" }}
      >
        <Stack
          spacing={2.5}
          sx={{
            flex: { xs: "1 1 auto", md: "2 1 620px" },
            width: "100%",
            minWidth: 0,
            maxHeight: { xs: "none", md: 840 },
            overflowY: { xs: "visible", md: "auto" },
          }}
        >
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              // the map is the primary content on the page — a bit more
              // visual weight than the secondary panels (chart, sidebar)
              // which stay plain flat outlines, so there's a clear "this
              // is the main thing" signal instead of everything looking
              // the same weight
              borderColor: "primary.main",
              boxShadow: "0 0 0 1px rgba(34, 211, 238, 0.15), 0 8px 24px rgba(0,0,0,0.35)",
            }}
          >
            <Box sx={{ position: "relative" }}>
              <SiteMap robots={robots} selectedId={selectedId} />
              {!hasSnapshot && (
                <Box
                  sx={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 1.5,
                    bgcolor: "rgba(13, 17, 23, 0.85)",
                    borderRadius: 1,
                  }}
                >
                  <CircularProgress size={28} />
                  <Typography variant="body2" color="text.secondary">
                    Connecting to fleet…
                  </Typography>
                </Box>
              )}
            </Box>
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
            maxHeight: { xs: "none", md: 840 },
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            variant="fullWidth"
            sx={{ minHeight: 40, flexShrink: 0, borderBottom: 1, borderColor: "divider" }}
          >
            <Tab label="Fleet" sx={{ minHeight: 40, py: 1 }} />
            <Tab label="Settings" sx={{ minHeight: 40, py: 1 }} />
          </Tabs>
          <Box sx={{ p: 2, overflowY: "auto", flex: 1, minHeight: 0 }}>
            {tab === 0 ? (
              <>
                <AttentionList robots={robots} selectedId={selectedId} onSelect={handleSelect} hasSnapshot={hasSnapshot} />
                <Box sx={{ mt: 2 }}>
                  <RobotList robots={robots} selectedId={selectedId} onSelect={handleSelect} />
                </Box>
              </>
            ) : (
              <LiveConfig applyConfig={applyConfig} />
            )}
          </Box>
        </Paper>
      </Stack>
    </>
  );
}
