import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { applyConfigUpdate, markRobotOffline, computeStats, type Robot, type FleetConfig } from "./fleetLogic.ts";

describe("applyConfigUpdate — live config validation", () => {
  const base: FleetConfig = { fleetSize: 8, updateIntervalMs: 5000 };

  test("applies a valid fleetSize and updateIntervalMs", () => {
    const { next, rejected } = applyConfigUpdate(base, { fleetSize: 100, updateIntervalMs: 2000 });
    assert.equal(next.fleetSize, 100);
    assert.equal(next.updateIntervalMs, 2000);
    assert.deepEqual(rejected, []);
  });

  test("rejects fleetSize above the 5000 cap, leaves it unchanged", () => {
    const { next, rejected } = applyConfigUpdate(base, { fleetSize: 100000 });
    assert.equal(next.fleetSize, 8); // unchanged
    assert.equal(rejected.length, 1);
    assert.match(rejected[0], /fleetSize/);
  });

  test("rejects a negative fleetSize", () => {
    const { next, rejected } = applyConfigUpdate(base, { fleetSize: -5 });
    assert.equal(next.fleetSize, 8);
    assert.equal(rejected.length, 1);
  });

  test("rejects a non-integer fleetSize", () => {
    const { rejected } = applyConfigUpdate(base, { fleetSize: 3.5 });
    assert.equal(rejected.length, 1);
  });

  test("rejects updateIntervalMs below the 200ms floor", () => {
    const { next, rejected } = applyConfigUpdate(base, { updateIntervalMs: 50 });
    assert.equal(next.updateIntervalMs, 5000); // unchanged
    assert.equal(rejected.length, 1);
    assert.match(rejected[0], /updateIntervalMs/);
  });

  test("a bad fleetSize does not block a valid updateIntervalMs in the same request", () => {
    const { next, rejected } = applyConfigUpdate(base, { fleetSize: -1, updateIntervalMs: 1000 });
    assert.equal(next.fleetSize, 8); // rejected, unchanged
    assert.equal(next.updateIntervalMs, 1000); // still applied
    assert.equal(rejected.length, 1);
  });

  test("omitted fields are left untouched and not reported as rejected", () => {
    const { next, rejected } = applyConfigUpdate(base, {});
    assert.deepEqual(next, base);
    assert.deepEqual(rejected, []);
  });

  test("boundary: fleetSize of exactly 5000 is accepted", () => {
    const { next, rejected } = applyConfigUpdate(base, { fleetSize: 5000 });
    assert.equal(next.fleetSize, 5000);
    assert.deepEqual(rejected, []);
  });

  test("boundary: updateIntervalMs of exactly 200 is accepted", () => {
    const { next, rejected } = applyConfigUpdate(base, { updateIntervalMs: 200 });
    assert.equal(next.updateIntervalMs, 200);
    assert.deepEqual(rejected, []);
  });
});

describe("markRobotOffline — flaky-connection handling", () => {
  function makeRobot(overrides: Partial<Robot> = {}): Robot {
    return { robot_id: "r1", robot_type: "picker", x: 10, y: 20, status: "active", battery: 80, ...overrides };
  }

  test("marks a known, non-offline robot as offline and returns it", () => {
    const fleet = new Map<string, Robot>([["r1", makeRobot()]]);
    const result = markRobotOffline(fleet, "r1");
    assert.ok(result);
    assert.equal(result?.status, "offline");
    assert.equal(fleet.get("r1")?.status, "offline");
  });

  test("preserves the robot's other fields (position, battery) when marking offline", () => {
    const fleet = new Map<string, Robot>([["r1", makeRobot({ x: 123.4, y: 56.7, battery: 42.1 })]]);
    const result = markRobotOffline(fleet, "r1");
    assert.equal(result?.x, 123.4);
    assert.equal(result?.y, 56.7);
    assert.equal(result?.battery, 42.1);
  });

  test("returns null for an unknown robot id — no crash, nothing to broadcast", () => {
    const fleet = new Map<string, Robot>();
    const result = markRobotOffline(fleet, "does-not-exist");
    assert.equal(result, null);
  });

  test("returns null if the robot is already offline — avoids a duplicate broadcast", () => {
    const fleet = new Map<string, Robot>([["r1", makeRobot({ status: "offline" })]]);
    const result = markRobotOffline(fleet, "r1");
    assert.equal(result, null);
  });

  test("a second close event on the same dead connection is a no-op the second time", () => {
    // simulates the real bug class this function exists to prevent: the ws
    // heartbeat's terminate() and the socket's own "close" event can both fire
    // for the same disconnect — this must not double-broadcast an offline update
    const fleet = new Map<string, Robot>([["r1", makeRobot()]]);
    const first = markRobotOffline(fleet, "r1");
    const second = markRobotOffline(fleet, "r1");
    assert.ok(first, "first call marks it offline");
    assert.equal(second, null, "second call is a no-op");
  });
});

describe("computeStats — fleet activity snapshot for the trend chart", () => {
  function makeRobot(id: string, status: Robot["status"]): Robot {
    return { robot_id: id, x: 0, y: 0, status, battery: 50 };
  }

  test("counts active and on_mission as active; everything else is not", () => {
    const fleet = new Map<string, Robot>([
      ["r1", makeRobot("r1", "active")],
      ["r2", makeRobot("r2", "on_mission")],
      ["r3", makeRobot("r3", "idle")],
      ["r4", makeRobot("r4", "charging")],
      ["r5", makeRobot("r5", "offline")],
    ]);
    const stats = computeStats(fleet);
    assert.equal(stats.total, 5);
    assert.equal(stats.active, 2);
  });

  test("an empty fleet reports zero total and zero active, not a crash", () => {
    const stats = computeStats(new Map());
    assert.equal(stats.total, 0);
    assert.equal(stats.active, 0);
  });
});
