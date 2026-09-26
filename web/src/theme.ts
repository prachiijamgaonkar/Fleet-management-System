import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "dark",
    background: { default: "#0d1117", paper: "#151b23" },
    primary: { main: "#22d3ee" },
    error: { main: "#f85149" },
    success: { main: "#3fb950" },
    warning: { main: "#eab308" },
    text: { primary: "#e6edf3", secondary: "#8b949e" },
    divider: "#2a3341",
  },
  typography: {
    fontFamily: "'Inter', system-ui, sans-serif",
    button: { textTransform: "none", fontWeight: 600 },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none", border: "1px solid #2a3341" },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: { backgroundImage: "none", borderBottom: "1px solid #2a3341" },
      },
    },
  },
});

export const monoFont = "'JetBrains Mono', ui-monospace, monospace";

// Single source of truth for the few sizes that fall outside MUI's built-in
// Typography variants (h5/subtitle1/overline/caption/body2 etc. already come
// from the theme automatically). These are for the data readouts — robot IDs,
// battery %, status chips — which needed sizes MUI's default scale doesn't have.
export const fontSizes = {
  dataLg: 16, // detail panel's robot id heading
  dataMd: 13, // row-level robot id, detail row values
  dataSm: 12, // secondary numbers (battery % in list rows)
  badge: 10.5, // status chip label
  icon: 14, // small inline icons
  iconDot: 10, // the tiny dot inside the connection status chip
};

export const STATUS_PALETTE: Record<string, string> = {
  idle: "#8b949e",
  active: "#3fb950",
  on_mission: "#2f81f7",
  charging: "#eab308",
  blocked: "#f97316",
  error: "#f85149",
  maintenance: "#a855f7",
  offline: "#4b5563",
};
