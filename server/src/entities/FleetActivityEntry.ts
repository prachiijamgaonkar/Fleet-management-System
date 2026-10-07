import { Entity, PrimaryGeneratedColumn, PrimaryColumn, Column } from "typeorm";

// recorded_at is part of the primary key for the same reason as in RobotHistoryEntry:
// TimescaleDB hypertables require the time partitioning column to be part of any
// unique/primary key on the table.
@Entity({ name: "fleet_activity" })
export class FleetActivityEntry {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column("int")
  active!: number;

  @Column("int")
  total!: number;

  @PrimaryColumn({ type: "timestamptz", default: () => "now()" })
  recorded_at!: Date;
}
