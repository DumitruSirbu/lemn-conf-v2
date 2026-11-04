// What the dashboard's screens share in reaching a client: a call that cannot leave a screen waiting, and a load that
// happens once and is tried again after it fails.
import { describe, expect, it, vi } from "vitest";

import { memoizeAsync, orFailed } from "@/price-dashboard/async-seams";

describe("memoizeAsync", () => {
  it("loads once and answers the same value to every call", async () => {
    const load = vi.fn(() => Promise.resolve({ loaded: true }));
    const loader = memoizeAsync(load);

    const [first, second] = await Promise.all([loader(), loader()]);

    expect(first).toBe(second);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("tries again on the next call after a load that rejected, and remembers the one that works", async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue("ready");
    const loader = memoizeAsync(load);

    await expect(loader()).rejects.toThrow("offline");
    expect(await loader()).toBe("ready");
    expect(await loader()).toBe("ready");

    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("orFailed", () => {
  it("answers the fallback when the call rejects, and the call's answer otherwise", async () => {
    expect(await orFailed(() => Promise.reject(new Error("x")), "failed")).toBe(
      "failed",
    );
    expect(await orFailed(() => Promise.resolve("done"), "failed")).toBe(
      "done",
    );
  });
});
