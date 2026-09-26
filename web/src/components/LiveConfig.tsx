import { useState } from "react";
import { Typography, TextField, Button, Stack, Paper, Snackbar, Alert } from "@mui/material";
import TuneIcon from "@mui/icons-material/Tune";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { fontSizes } from "../theme";

interface Props {
  applyConfig: (token: string, body: { fleetSize?: number; updateIntervalMs?: number }) => Promise<{ ok: boolean; data: any }>;
  fetchConfig: () => Promise<{ defaults: { fleetSize: number; updateIntervalMs: number } }>;
}

export function LiveConfig({ applyConfig, fetchConfig }: Props) {
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem("adminToken") || "";
    } catch {
      return "";
    }
  });
  const [fleetSize, setFleetSize] = useState("");
  const [updateIntervalMs, setUpdateIntervalMs] = useState("");
  const [toast, setToast] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });

  function showToast(message: string, severity: "success" | "error") {
    setToast({ open: true, message, severity });
  }

  async function handleApply() {
    // only send fields the user actually typed something into
    const body: { fleetSize?: number; updateIntervalMs?: number } = {};
    if (fleetSize.trim() !== "") body.fleetSize = parseInt(fleetSize, 10);
    if (updateIntervalMs.trim() !== "") body.updateIntervalMs = parseInt(updateIntervalMs, 10);

    const { ok, data } = await applyConfig(token, body);

    if (!ok) {
      showToast(data.error === "unauthorized" ? "Wrong control password." : "Something went wrong — please try again.", "error");
      return;
    }

    const rejected: string[] = data.rejected || [];
    if (rejected.length > 0) {
      const friendly = rejected.map((r: string) =>
        r.startsWith("fleetSize")
          ? "Fleet size must be a whole number between 1 and 5000."
          : r.startsWith("updateIntervalMs")
          ? "Update interval must be a whole number of at least 200ms."
          : r
      );
      showToast(friendly.join(" "), "error");
    } else if (Object.keys(body).length === 0) {
      showToast("Enter a fleet size or interval to change first.", "error");
    } else {
      showToast(`Updated — fleet size ${data.fleetSize}, updating every ${data.updateIntervalMs}ms.`, "success");
    }

    try {
      localStorage.setItem("adminToken", token);
    } catch {
      // ignore — browser storage unavailable, not critical
    }
  }

  async function handleReset() {
    if (!token.trim()) {
      showToast("Enter the control password first.", "error");
      return;
    }
    const { defaults } = await fetchConfig();
    const { ok, data } = await applyConfig(token, defaults);
    if (!ok) {
      showToast(data.error === "unauthorized" ? "Wrong control password." : "Something went wrong — please try again.", "error");
      return;
    }
    setFleetSize("");
    setUpdateIntervalMs("");
    showToast(`Reset to defaults — fleet size ${data.fleetSize}, updating every ${data.updateIntervalMs}ms.`, "success");
  }

  return (
    <>
      <Stack direction="row" spacing={0.6} sx={{ alignItems: "center", mt: 2, mb: 0.5 }}>
        <TuneIcon sx={{ fontSize: fontSizes.icon, color: "primary.main" }} />
        <Typography variant="overline" color="primary.main">Live Config</Typography>
      </Stack>
      <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "background.default" }}>
        <Stack spacing={1}>
          <TextField
            size="small"
            type="password"
            label="Control password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              type="number"
              label="Fleet size"
              value={fleetSize}
              onChange={(e) => setFleetSize(e.target.value)}
              fullWidth
            />
            <TextField
              size="small"
              type="number"
              label="Interval ms"
              value={updateIntervalMs}
              onChange={(e) => setUpdateIntervalMs(e.target.value)}
              fullWidth
            />
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={handleApply} fullWidth>Apply</Button>
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<RestartAltIcon fontSize="small" />}
              onClick={handleReset}
              sx={{ whiteSpace: "nowrap" }}
            >
              Reset
            </Button>
          </Stack>
        </Stack>
      </Paper>
      <Snackbar
        open={toast.open}
        autoHideDuration={5000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={toast.severity}
          variant="filled"
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          sx={{ width: "100%" }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </>
  );
}
