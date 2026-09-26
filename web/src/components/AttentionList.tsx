import { useMemo } from "react";
import { List, Typography, Box } from "@mui/material";
import type { Robot } from "../types";
import { needsAttention } from "../utils";
import { RobotRow } from "./RobotRow";

interface Props {
  robots: Robot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function AttentionList({ robots, selectedId, onSelect }: Props) {
  const attention = useMemo(() => robots.filter(needsAttention), [robots]);

  return (
    <>
      <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
        Needs Attention
      </Typography>
      {attention.length === 0 ? (
        <Box sx={{ px: 1, py: 0.5 }}>
          <Typography variant="body2" color="text.disabled">
            none — fleet healthy
          </Typography>
        </Box>
      ) : (
        <List dense disablePadding>
          {attention.map((r) => (
            <RobotRow key={r.robot_id} robot={r} selected={r.robot_id === selectedId} onSelect={onSelect} />
          ))}
        </List>
      )}
    </>
  );
}
