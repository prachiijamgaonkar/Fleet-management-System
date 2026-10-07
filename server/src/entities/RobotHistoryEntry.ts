import { Entity, PrimaryGeneratedColumn, PrimaryColumn, Column } from "typeorm";

// recorded_at is part of the primary key (not just @PrimaryGeneratedColumn id) because
// TimescaleDB hypertables require the time partitioning column to be part of any
// unique/primary key on the table.
@Entity({ name: "robot_history" })
export class RobotHistoryEntry {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  robot_id!: string;

  @Column({ type: "varchar", nullable: true })
  robot_type!: string | null;

  @Column("float")
  x!: number;

  @Column("float")
  y!: number;

  @Column()
  status!: string;

  @Column("float")
  battery!: number;

  @PrimaryColumn({ type: "timestamptz", default: () => "now()" })
  recorded_at!: Date;
}
