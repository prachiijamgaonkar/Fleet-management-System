import type { SvgIconComponent } from "@mui/icons-material";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import NavigationIcon from "@mui/icons-material/Navigation";
import BatteryChargingFullIcon from "@mui/icons-material/BatteryChargingFull";
import BlockIcon from "@mui/icons-material/Block";
import ErrorIcon from "@mui/icons-material/Error";
import BuildIcon from "@mui/icons-material/Build";
import CloudOffIcon from "@mui/icons-material/CloudOff";
import type { RobotStatus } from "../types";

export const STATUS_ICONS: Record<RobotStatus, SvgIconComponent> = {
  idle: RadioButtonUncheckedIcon,
  active: PlayCircleIcon,
  on_mission: NavigationIcon,
  charging: BatteryChargingFullIcon,
  blocked: BlockIcon,
  error: ErrorIcon,
  maintenance: BuildIcon,
  offline: CloudOffIcon,
};

interface Props {
  status: RobotStatus;
  color: string;
  size?: number;
}

export function StatusIcon({ status, color, size = 14 }: Props) {
  const Icon = STATUS_ICONS[status];
  return <Icon sx={{ fontSize: size, color }} />;
}
