import { describe, expect, test } from "@jest/globals";
import { LookupQueueService } from "../src/services/lookup-queue.service.js";

describe("LookupQueueService", () => {
  test("limita a execucao paralela ao maximo configurado", async () => {
    const queue = new LookupQueueService({ maxConcurrent: 3 });
    let active = 0;
    let maxSeen = 0;

    const jobs = Array.from({ length: 8 }, (_value, index) => queue.enqueue({
      lookupKey: `ean-${index}`,
      handler: async () => {
        active += 1;
        maxSeen = Math.max(maxSeen, active);
        await new Promise((resolve) => setTimeout(resolve, 20));
        active -= 1;
        return index;
      },
    }));

    const results = await Promise.all(jobs);

    expect(maxSeen).toBe(3);
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});
