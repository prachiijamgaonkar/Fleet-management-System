import { useMemo, useState } from "react";
import { TextField, List, Typography, InputAdornment } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import type { Robot } from "../types";
import { RobotRow } from "./RobotRow";

interface Props {
  robots: Robot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function RobotList({ robots, selectedId, onSelect }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q ? robots.filter((r) => r.robot_id.toLowerCase().includes(q)) : robots;
    // robot_id is "r" + a number, so a plain string sort would put r10 before
    // r2 — compare the numeric part instead so the list reads in a stable,
    // predictable order regardless of the (network-timing-dependent) order
    // updates actually arrived in.
    return [...matched].sort(
      (a, b) => parseInt(a.robot_id.slice(1), 10) - parseInt(b.robot_id.slice(1), 10)
    );
  }, [robots, query]);

  return (
    <>
      <TextField
        fullWidth
        size="small"
        placeholder="Find robot (e.g. r3)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          },
        }}
      />
      <Typography variant="overline" color="text.secondary" sx={{ display: "block", mt: 2, mb: 0.5 }}>
        All Robots
      </Typography>
      <List dense disablePadding>
        {filtered.map((r) => (
          <RobotRow key={r.robot_id} robot={r} selected={r.robot_id === selectedId} onSelect={onSelect} />
        ))}
      </List>
    </>
  );
}
