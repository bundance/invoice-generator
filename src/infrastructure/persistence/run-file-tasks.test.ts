import { describe, expect, it } from "vite-plus/test";

import { runFileTasks } from "./run-file-tasks.js";

describe("file task runner", () => {
  it("keeps no more than four file operations active", async () => {
    let activeTasks = 0;
    let peakTasks = 0;

    await runFileTasks(
      Array.from({ length: 20 }, (_, index) => index),
      async () => {
        activeTasks += 1;
        peakTasks = Math.max(peakTasks, activeTasks);
        await new Promise((resolve) => setTimeout(resolve, 1));
        activeTasks -= 1;
      },
    );

    expect(peakTasks).toBe(4);
  });

  it("waits for every file task before reporting the first failure", async () => {
    const visitedItems = new Set<number>();

    await expect(
      runFileTasks(
        Array.from({ length: 8 }, (_, index) => index),
        async (index) => {
          visitedItems.add(index);
          await Promise.resolve();
          if (index === 1) throw new Error("planned failure");
        },
      ),
    ).rejects.toThrow("planned failure");
    expect(visitedItems).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7]));
  });
});
