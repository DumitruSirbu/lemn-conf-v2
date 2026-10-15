// The question the review asks before it offers a request for an offer: is the design on screen the one the server
// holds? Driven through the app's own store with only `fetch` stubbed, as `client-write-path.test.ts` does, so the
// answer is the shipped wiring's: a command makes the held design differ from the saved one, and the save that
// writes that design (not an older one) makes them the same again.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MINTED_ID = "design-under-test";
const REMOVABLE_PLACEMENT_ID = "p7";
const SECOND_REMOVABLE_PLACEMENT_ID = "p24";

let failuresRemaining: number;

function stubFetch() {
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
    if (failuresRemaining > 0) {
      failuresRemaining -= 1;
      return Promise.resolve(new Response("{}", { status: 500 }));
    }
    return Promise.resolve(
      new Response(JSON.stringify({ id: MINTED_ID, revision: "1" }), {
        status: init.method === "POST" ? 201 : 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });
}

async function loadFreshStore() {
  vi.resetModules();
  const module = await import("../../src/store/configurator-store");
  return module.useConfiguratorStore;
}

function isSaved(store: Awaited<ReturnType<typeof loadFreshStore>>): boolean {
  const { design, savedDesign } = store.getState();
  return design === savedDesign;
}

describe("is the design on screen the one the server holds", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    failuresRemaining = 0;
    stubFetch();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("is, before anything has been edited", async () => {
    const store = await loadFreshStore();

    expect(isSaved(store)).toBe(true);
  });

  it("is not, from the moment a command is applied until the save that writes it lands", async () => {
    const store = await loadFreshStore();

    store.getState().select({ kind: "placement", id: REMOVABLE_PLACEMENT_ID });
    store.getState().remove();
    expect(isSaved(store)).toBe(false);

    await vi.runAllTimersAsync();

    expect(isSaved(store)).toBe(true);
  });

  it("is not again for a second edit, and is once that one is written too", async () => {
    const store = await loadFreshStore();
    store.getState().select({ kind: "placement", id: REMOVABLE_PLACEMENT_ID });
    store.getState().remove();
    await vi.runAllTimersAsync();

    store.getState().select({
      kind: "placement",
      id: SECOND_REMOVABLE_PLACEMENT_ID,
    });
    store.getState().remove();
    expect(isSaved(store)).toBe(false);
    await vi.runAllTimersAsync();

    expect(isSaved(store)).toBe(true);
  });

  it("stays not saved while the save is failing and being retried", async () => {
    const store = await loadFreshStore();
    failuresRemaining = Number.POSITIVE_INFINITY;

    store.getState().select({ kind: "placement", id: REMOVABLE_PLACEMENT_ID });
    store.getState().remove();
    await vi.advanceTimersByTimeAsync(3000);

    expect(store.getState().saveStatus).toBe("error");
    expect(isSaved(store)).toBe(false);
  });

  it("is the loaded design, for a design the server has just handed over", async () => {
    const store = await loadFreshStore();
    const loaded = { ...store.getState().design, presetId: "loaded" };

    store.getState().hydrate({
      design: loaded,
      designId: MINTED_ID,
      revision: "1",
      canWrite: true,
    });

    expect(store.getState().savedDesign).toBe(loaded);
    expect(isSaved(store)).toBe(true);
  });
});
