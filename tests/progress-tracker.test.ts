import { ProgressTracker } from "../src/progress-tracker";

describe("ProgressTracker", () => {
  it("should track progress and notify subscribers", () => {
    const tracker = new ProgressTracker(2);
    const updates: any[] = [];
    tracker.subscribe((p) => updates.push(p));
    tracker.updateStage(0, "success");
    tracker.updateStage(1, "error");
    expect(updates.length).toBeGreaterThan(0);
    expect(tracker.getProgress().stageStatuses).toEqual(["success", "error"]);
  });
});
