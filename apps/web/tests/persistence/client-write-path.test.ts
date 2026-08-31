// M3 work item 10, end to end: the shipped wiring, not a re-composition of it.
//
// Every test here drives the real `useConfiguratorStore` singleton — the one the app mounts — with
// only `fetch` stubbed, so what is asserted is the path a command actually takes: store command →
// `onDesignChanged` → the save coalescer → `FetchConfigurationRepository` → HTTP. The module is
// re-imported per test because the coalescer and the minted id are session state by design.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Every scripted response reports this revision, and the store therefore states it on the next
 *  save. These tests attack the write path's scheduling, not its concurrency rule. */
const TEST_REVISION = "1";

const MINTED_ID = "design-under-test";
/** The fridge of the §10 signature flow: removing it succeeds and leaves a void selected, so the
 *  next command against that selection is a refusal. */
const REMOVABLE_PLACEMENT_ID = "p7";
const SECOND_REMOVABLE_PLACEMENT_ID = "p24";

interface RecordedRequest {
  readonly url: string;
  readonly method: string;
}

let requests: RecordedRequest[];
let failuresRemaining: number;
let refuseWritesAsUnauthorized: boolean;

function stubFetch() {
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    requests.push({ url, method });

    if (refuseWritesAsUnauthorized && method === "PUT") {
      return Promise.resolve(new Response("{}", { status: 403 }));
    }
    if (failuresRemaining > 0) {
      failuresRemaining -= 1;
      return Promise.resolve(new Response("{}", { status: 500 }));
    }
    const status = method === "POST" ? 201 : 200;
    return Promise.resolve(
      new Response(JSON.stringify({ id: MINTED_ID, revision: TEST_REVISION }), {
        status,
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

function methodsOf(): string[] {
  return requests.map((request) => request.method);
}

describe("the client write path, driven through the app's own store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    requests = [];
    failuresRemaining = 0;
    refuseWritesAsUnauthorized = false;
    stubFetch();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("mints on the first successful command and writes the edited design to it", async () => {
    const store = await loadFreshStore();

    store.getState().select({ kind: "placement", id: REMOVABLE_PLACEMENT_ID });
    store.getState().remove();
    await vi.runAllTimersAsync();

    expect(requests).toEqual([
      { url: "/api/designs", method: "POST" },
      { url: `/api/designs/${MINTED_ID}`, method: "PUT" },
    ]);
    expect(store.getState().designId).toBe(MINTED_ID);
    expect(store.getState().hasPersistedSuccessfully).toBe(true);
    expect(store.getState().saveStatus).toBe("idle");
  });

  it("mints exactly one row for a burst of commands issued before the mint resolves", async () => {
    const store = await loadFreshStore();

    store.getState().select({ kind: "placement", id: REMOVABLE_PLACEMENT_ID });
    store.getState().remove();
    store
      .getState()
      .select({ kind: "placement", id: SECOND_REMOVABLE_PLACEMENT_ID });
    store.getState().remove();
    await vi.runAllTimersAsync();

    expect(methodsOf().filter((method) => method === "POST")).toHaveLength(1);
    expect(store.getState().designId).toBe(MINTED_ID);
  });

  it("issues no request at all for a refused command", async () => {
    const store = await loadFreshStore();

    store.getState().select({ kind: "placement", id: REMOVABLE_PLACEMENT_ID });
    store.getState().remove();
    await vi.runAllTimersAsync();
    const afterOneSuccess = requests.length;

    // The removal left the vacated void selected, and a void refuses every command.
    store.getState().remove();
    store.getState().setFinish("oak");
    store.getState().setHandle("push");
    await vi.runAllTimersAsync();

    expect(store.getState().lastRejection?.code).toBe("VOID_SELECTED");
    expect(requests).toHaveLength(afterOneSuccess);
  });

  it("surfaces a failed write as 'error', keeps the edit, and retries it to success", async () => {
    const store = await loadFreshStore();
    failuresRemaining = 1;
    const statuses: string[] = [];
    store.subscribe((state) => statuses.push(state.saveStatus));

    store.getState().select({ kind: "placement", id: REMOVABLE_PLACEMENT_ID });
    const placementCountBefore = store.getState().design.placements.length;
    store.getState().remove();
    await vi.runAllTimersAsync();

    expect(statuses).toContain("error");
    // The edit is never reverted by a failed write, and nothing is shareable until one succeeds.
    expect(store.getState().design.placements.length).toBeLessThan(
      placementCountBefore,
    );
    expect(store.getState().saveStatus).toBe("idle");
    expect(store.getState().hasPersistedSuccessfully).toBe(true);
  });

  it("goes read-only rather than retrying forever when this browser holds no write credential", async () => {
    const store = await loadFreshStore();
    refuseWritesAsUnauthorized = true;

    store.getState().select({ kind: "placement", id: REMOVABLE_PLACEMENT_ID });
    const placementCountBefore = store.getState().design.placements.length;
    store.getState().remove();
    await vi.advanceTimersByTimeAsync(60_000);
    const afterRefusal = requests.length;
    await vi.advanceTimersByTimeAsync(60_000);

    expect(store.getState().saveStatus).toBe("unauthorized");
    // The edit stands, and nothing further is attempted for a credential no retry can obtain.
    expect(store.getState().design.placements.length).toBeLessThan(
      placementCountBefore,
    );
    expect(requests).toHaveLength(afterRefusal);
    expect(store.getState().hasPersistedSuccessfully).toBe(false);
  });

  it("presents nothing shareable while every write is still failing", async () => {
    const store = await loadFreshStore();
    failuresRemaining = Number.MAX_SAFE_INTEGER;

    store.getState().select({ kind: "placement", id: REMOVABLE_PLACEMENT_ID });
    store.getState().remove();
    await vi.advanceTimersByTimeAsync(5000);

    expect(store.getState().saveStatus).toBe("error");
    expect(store.getState().designId).toBeNull();
    expect(store.getState().hasPersistedSuccessfully).toBe(false);
  });
});
