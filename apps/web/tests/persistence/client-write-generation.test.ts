import { KITCHEN_L_DESIGN, type Design } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { paletteFinish, type Finish } from "@lemnaria/configurator-domain";

/** **Four distinct PAL decors, one per edit in a sequence.** These fixtures carry no settings, so
 *  every design here is a PAL kitchen, and since wave 6Q-a a finish PAL does not offer is refused at
 *  the command (ADR 0078 decision 1) — the legacy *Lut* and *Salvie* values that used to stand here
 *  are free colours, so they would now schedule no write at all, which is not what any test below
 *  is about. **Which** colour each edit is has never mattered; that each one differs from the last
 *  is the whole of it. */
const FIRST_EDIT = paletteFinish("pal.stejar-bardolino");
const SECOND_EDIT = paletteFinish("pal.antracit");
const THIRD_EDIT = paletteFinish("pal.alb");
const FOURTH_EDIT = paletteFinish("pal.gri-havanna");

/** The revision a hydrating loader reports. These tests are about identity and generation, not
 *  about concurrency, so one value throughout keeps them readable. */
const LOADED_REVISION = "1";

/** The revision every scripted repository in this file reports and every queue therefore expects.
 *  These tests are about scheduling, identity and retry — the concurrency rule has its own tests —
 *  so one value throughout keeps them readable. */
const TEST_REVISION = "1";

const DESIGN_A_ID = "design-a";
const DESIGN_B_ID = "design-b";
const MINTED_A_ID = "minted-a";
const EDITABLE_PLACEMENT_ID = "p8";
const MIN_SAVE_INTERVAL_MS = 1000;

interface ControlledRequest {
  readonly url: string;
  readonly method: string;
  readonly body: string | undefined;
  readonly answer: (response: Response) => void;
}

class ControlledFetch {
  readonly requests: ControlledRequest[] = [];

  request(url: string, init: RequestInit): Promise<Response> {
    return new Promise<Response>((resolve) => {
      this.requests.push({
        url,
        method: init.method ?? "GET",
        body: typeof init.body === "string" ? init.body : undefined,
        answer: resolve,
      });
    });
  }

  async answer(
    index: number,
    options: { readonly status: number; readonly id?: string },
  ): Promise<void> {
    const request = this.requests[index];
    if (!request)
      throw new Error(`No controlled request at index ${String(index)}`);
    request.answer(
      new Response(
        JSON.stringify({ id: options.id, revision: TEST_REVISION }),
        {
          status: options.status,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    await vi.advanceTimersByTimeAsync(0);
  }
}

function withPreset(presetId: string): Design {
  return { ...KITCHEN_L_DESIGN, presetId };
}

function requestDesign(request: ControlledRequest | undefined): Design {
  if (request?.body === undefined)
    throw new Error("Expected a request carrying a design body");
  return JSON.parse(request.body) as Design;
}

function requestedFinish(
  request: ControlledRequest | undefined,
): Finish | "(none)" {
  const placement = requestDesign(request).placements.find(
    (candidate) => candidate.id === EDITABLE_PLACEMENT_ID,
  );
  if (!placement)
    throw new Error("Expected the editable placement in the request");
  return placement.body.finish ?? "(none)";
}

async function loadFreshStore() {
  vi.resetModules();
  const module = await import("../../src/store/configurator-store");
  return module.useConfiguratorStore;
}

describe("the singleton write path scopes jobs and callbacks to hydration generations", () => {
  let controlledFetch: ControlledFetch;

  beforeEach(() => {
    vi.useFakeTimers();
    controlledFetch = new ControlledFetch();
    vi.stubGlobal("fetch", (url: string, init: RequestInit) =>
      controlledFetch.request(url, init),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("starts interval-delayed A with A's id after B hydrates and ignores stale saving, idle, and onSaved", async () => {
    const store = await loadFreshStore();
    store.getState().hydrate({
      design: withPreset("a"),
      designId: DESIGN_A_ID,
      revision: LOADED_REVISION,
      canWrite: true,
    });
    store.getState().select({ kind: "placement", id: EDITABLE_PLACEMENT_ID });
    store.getState().setFinish(FIRST_EDIT);
    expect(store.getState().lastRejection).toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    expect(controlledFetch.requests).toHaveLength(1);
    await controlledFetch.answer(0, { status: 200, id: DESIGN_A_ID });

    store.getState().setFinish(THIRD_EDIT);
    store.getState().hydrate({
      design: withPreset("b"),
      designId: DESIGN_B_ID,
      revision: LOADED_REVISION,
      canWrite: false,
    });

    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS - 1);
    expect(controlledFetch.requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(controlledFetch.requests[1]?.url).toBe(
      `/api/designs/${DESIGN_A_ID}`,
    );
    expect(requestDesign(controlledFetch.requests[1]).presetId).toBe("a");
    expect(requestedFinish(controlledFetch.requests[1])).toEqual(THIRD_EDIT);
    expect(store.getState()).toMatchObject({
      designId: DESIGN_B_ID,
      saveStatus: "idle",
      canWrite: false,
      hasPersistedSuccessfully: true,
    });
    expect(store.getState().design.presetId).toBe("b");

    await controlledFetch.answer(1, { status: 200, id: DESIGN_A_ID });
    expect(store.getState()).toMatchObject({
      designId: DESIGN_B_ID,
      saveStatus: "idle",
      canWrite: false,
      hasPersistedSuccessfully: true,
    });
    expect(store.getState().design.presetId).toBe("b");
  });

  it("serializes an in-flight A before B while preserving both id/content pairs", async () => {
    const store = await loadFreshStore();
    store.getState().hydrate({
      design: withPreset("a"),
      designId: DESIGN_A_ID,
      revision: LOADED_REVISION,
      canWrite: true,
    });
    store.getState().select({ kind: "placement", id: EDITABLE_PLACEMENT_ID });
    store.getState().setFinish(FIRST_EDIT);
    await vi.advanceTimersByTimeAsync(0);

    store.getState().hydrate({
      design: withPreset("b"),
      designId: DESIGN_B_ID,
      revision: LOADED_REVISION,
      canWrite: true,
    });
    store.getState().select({ kind: "placement", id: EDITABLE_PLACEMENT_ID });
    store.getState().setFinish(SECOND_EDIT);

    await controlledFetch.answer(0, { status: 200, id: DESIGN_A_ID });
    expect(store.getState().designId).toBe(DESIGN_B_ID);
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS);

    expect(controlledFetch.requests.map((request) => request.url)).toEqual([
      `/api/designs/${DESIGN_A_ID}`,
      `/api/designs/${DESIGN_B_ID}`,
    ]);
    expect(requestDesign(controlledFetch.requests[0]).presetId).toBe("a");
    expect(requestDesign(controlledFetch.requests[1]).presetId).toBe("b");
    expect(requestedFinish(controlledFetch.requests[0])).toEqual(FIRST_EDIT);
    expect(requestedFinish(controlledFetch.requests[1])).toEqual(SECOND_EDIT);
    expect(store.getState().saveStatus).toBe("saving");

    await controlledFetch.answer(1, { status: 200, id: DESIGN_B_ID });
    expect(store.getState()).toMatchObject({
      designId: DESIGN_B_ID,
      saveStatus: "idle",
      hasPersistedSuccessfully: true,
    });
  });

  it("writes current A after stale in-flight A succeeds across a real A to B to A hydration", async () => {
    const store = await loadFreshStore();
    store.getState().hydrate({
      design: withPreset("a-old"),
      designId: DESIGN_A_ID,
      revision: LOADED_REVISION,
      canWrite: true,
    });
    store.getState().select({ kind: "placement", id: EDITABLE_PLACEMENT_ID });
    store.getState().setFinish(FIRST_EDIT);
    await vi.advanceTimersByTimeAsync(0);

    store.getState().hydrate({
      design: withPreset("b"),
      designId: DESIGN_B_ID,
      revision: LOADED_REVISION,
      canWrite: true,
    });
    store.getState().select({ kind: "placement", id: EDITABLE_PLACEMENT_ID });
    store.getState().setFinish(SECOND_EDIT);
    store.getState().hydrate({
      design: withPreset("a-current"),
      designId: DESIGN_A_ID,
      revision: LOADED_REVISION,
      canWrite: true,
    });
    store.getState().select({ kind: "placement", id: EDITABLE_PLACEMENT_ID });
    store.getState().setFinish(THIRD_EDIT);

    await controlledFetch.answer(0, { status: 200, id: DESIGN_A_ID });
    expect(store.getState()).toMatchObject({
      designId: DESIGN_A_ID,
      saveStatus: "idle",
    });
    expect(store.getState().design.presetId).toBe("a-current");

    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS);
    expect(controlledFetch.requests[1]?.url).toBe(
      `/api/designs/${DESIGN_B_ID}`,
    );
    await controlledFetch.answer(1, { status: 200, id: DESIGN_B_ID });
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS);

    expect(controlledFetch.requests[2]?.url).toBe(
      `/api/designs/${DESIGN_A_ID}`,
    );
    expect(requestDesign(controlledFetch.requests[2]).presetId).toBe(
      "a-current",
    );
    expect(requestedFinish(controlledFetch.requests[2])).toEqual(THIRD_EDIT);
    await controlledFetch.answer(2, { status: 200, id: DESIGN_A_ID });
    expect(store.getState()).toMatchObject({
      designId: DESIGN_A_ID,
      saveStatus: "idle",
      hasPersistedSuccessfully: true,
    });
  });

  it("saves B during A's retry delay, then retries A against A without touching B", async () => {
    const store = await loadFreshStore();
    store.getState().hydrate({
      design: withPreset("a"),
      designId: DESIGN_A_ID,
      revision: LOADED_REVISION,
      canWrite: true,
    });
    store.getState().select({ kind: "placement", id: EDITABLE_PLACEMENT_ID });
    store.getState().setFinish(FIRST_EDIT);
    await vi.advanceTimersByTimeAsync(0);
    await controlledFetch.answer(0, { status: 500 });
    expect(store.getState().saveStatus).toBe("error");

    store.getState().hydrate({
      design: withPreset("b"),
      designId: DESIGN_B_ID,
      revision: LOADED_REVISION,
      canWrite: true,
    });
    store.getState().select({ kind: "placement", id: EDITABLE_PLACEMENT_ID });
    store.getState().setFinish(SECOND_EDIT);
    await vi.advanceTimersByTimeAsync(0);
    expect(controlledFetch.requests[1]?.url).toBe(
      `/api/designs/${DESIGN_B_ID}`,
    );
    await controlledFetch.answer(1, { status: 200, id: DESIGN_B_ID });

    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS - 1);
    expect(controlledFetch.requests).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(controlledFetch.requests[2]?.url).toBe(
      `/api/designs/${DESIGN_A_ID}`,
    );
    expect(requestDesign(controlledFetch.requests[2]).presetId).toBe("a");
    expect(requestedFinish(controlledFetch.requests[2])).toEqual(FIRST_EDIT);
    expect(store.getState()).toMatchObject({
      designId: DESIGN_B_ID,
      saveStatus: "idle",
      canWrite: true,
    });

    await controlledFetch.answer(2, { status: 200, id: DESIGN_A_ID });
    expect(store.getState()).toMatchObject({
      designId: DESIGN_B_ID,
      saveStatus: "idle",
      canWrite: true,
    });
  });

  it("keeps a null-id mint and its pending A content on minted A after B hydrates", async () => {
    const store = await loadFreshStore();
    store.getState().select({ kind: "placement", id: EDITABLE_PLACEMENT_ID });
    store.getState().setFinish(FIRST_EDIT);
    store.getState().setFinish(THIRD_EDIT);

    store.getState().hydrate({
      design: withPreset("b"),
      designId: DESIGN_B_ID,
      revision: LOADED_REVISION,
      canWrite: true,
    });
    store.getState().select({ kind: "placement", id: EDITABLE_PLACEMENT_ID });
    store.getState().setFinish(SECOND_EDIT);

    expect(controlledFetch.requests[0]).toMatchObject({
      url: "/api/designs",
      method: "POST",
    });
    await controlledFetch.answer(0, { status: 201, id: MINTED_A_ID });
    expect(controlledFetch.requests[1]?.url).toBe(
      `/api/designs/${MINTED_A_ID}`,
    );
    expect(requestDesign(controlledFetch.requests[1]).presetId).not.toBe("b");
    expect(requestedFinish(controlledFetch.requests[1])).toEqual(FIRST_EDIT);

    await controlledFetch.answer(1, { status: 200, id: MINTED_A_ID });
    expect(store.getState().designId).toBe(DESIGN_B_ID);
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS);
    expect(controlledFetch.requests[2]?.url).toBe(
      `/api/designs/${MINTED_A_ID}`,
    );
    expect(requestDesign(controlledFetch.requests[2]).presetId).not.toBe("b");
    expect(requestedFinish(controlledFetch.requests[2])).toEqual(THIRD_EDIT);

    await controlledFetch.answer(2, { status: 200, id: MINTED_A_ID });
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS);
    expect(controlledFetch.requests[3]?.url).toBe(
      `/api/designs/${DESIGN_B_ID}`,
    );
    expect(requestDesign(controlledFetch.requests[3]).presetId).toBe("b");
    expect(requestedFinish(controlledFetch.requests[3])).toEqual(SECOND_EDIT);
    expect(
      controlledFetch.requests.filter((request) => request.method === "POST"),
    ).toHaveLength(1);
    expect(store.getState()).toMatchObject({
      designId: DESIGN_B_ID,
      canWrite: true,
      hasPersistedSuccessfully: true,
    });
  });

  it("gives two null generations distinct real repository mints", async () => {
    const [{ createSaveCoalescer }, { FetchConfigurationRepository }] =
      await Promise.all([
        import("../../src/persistence/save-coalescer"),
        import("../../src/persistence/fetch-configuration-repository"),
      ]);
    let generation = 0;
    const saved: { readonly id: string; readonly generation: number }[] = [];
    const coalescer = createSaveCoalescer({
      repository: new FetchConfigurationRepository(),
      getDesignId: () => null,
      getGeneration: () => generation,
      onSaved: ({ id }, savedGeneration) => {
        saved.push({ id, generation: savedGeneration });
      },
      onSaveStatusChange: () => undefined,
      getRevision: () => TEST_REVISION,
      readCurrentRevision: () => Promise.resolve(TEST_REVISION),
    });

    coalescer.scheduleSave(withPreset("null-a"));
    generation = 1;
    coalescer.scheduleSave(withPreset("null-b"));

    await controlledFetch.answer(0, { status: 201, id: "minted-a" });
    expect(controlledFetch.requests[1]?.url).toBe("/api/designs/minted-a");
    await controlledFetch.answer(1, { status: 200, id: "minted-a" });
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS);
    expect(controlledFetch.requests[2]).toMatchObject({
      url: "/api/designs",
      method: "POST",
    });
    await controlledFetch.answer(2, { status: 201, id: "minted-b" });
    expect(controlledFetch.requests[3]?.url).toBe("/api/designs/minted-b");
    await controlledFetch.answer(3, { status: 200, id: "minted-b" });

    expect(
      controlledFetch.requests.filter((request) => request.method === "POST"),
    ).toHaveLength(2);
    expect(saved).toEqual([
      { id: "minted-a", generation: 0 },
      { id: "minted-b", generation: 1 },
    ]);
  });

  it.each([
    { status: 500, staleStatus: "error" },
    { status: 400, staleStatus: "stopped" },
    { status: 403, staleStatus: "unauthorized" },
  ])(
    "ignores stale $staleStatus after A resolves with HTTP $status",
    async ({ status }) => {
      const store = await loadFreshStore();
      store.getState().hydrate({
        design: withPreset("a"),
        designId: DESIGN_A_ID,
        revision: LOADED_REVISION,
        canWrite: true,
      });
      store.getState().select({ kind: "placement", id: EDITABLE_PLACEMENT_ID });
      store.getState().setFinish(FIRST_EDIT);
      await vi.advanceTimersByTimeAsync(0);

      store.getState().hydrate({
        design: withPreset("b"),
        designId: DESIGN_B_ID,
        revision: LOADED_REVISION,
        canWrite: true,
      });
      await controlledFetch.answer(0, { status });

      expect(store.getState()).toMatchObject({
        designId: DESIGN_B_ID,
        saveStatus: "idle",
        canWrite: true,
        hasPersistedSuccessfully: true,
      });
      expect(store.getState().design.presetId).toBe("b");
    },
  );

  it.each([
    { status: 400, expectedStatus: "stopped" },
    { status: 403, expectedStatus: "unauthorized" },
  ] as const)(
    "surfaces stale HTTP $status refusal to current A after A to B to A and keeps it surfaced",
    async ({ status, expectedStatus }) => {
      const store = await loadFreshStore();
      store.getState().hydrate({
        design: withPreset("a-old"),
        designId: DESIGN_A_ID,
        revision: LOADED_REVISION,
        canWrite: true,
      });
      store.getState().select({ kind: "placement", id: EDITABLE_PLACEMENT_ID });
      store.getState().setFinish(FIRST_EDIT);
      await vi.advanceTimersByTimeAsync(0);

      store.getState().hydrate({
        design: withPreset("b"),
        designId: DESIGN_B_ID,
        revision: LOADED_REVISION,
        canWrite: true,
      });
      store.getState().select({ kind: "placement", id: EDITABLE_PLACEMENT_ID });
      store.getState().setFinish(SECOND_EDIT);
      store.getState().hydrate({
        design: withPreset("a-current"),
        designId: DESIGN_A_ID,
        revision: LOADED_REVISION,
        canWrite: true,
      });
      store.getState().select({ kind: "placement", id: EDITABLE_PLACEMENT_ID });
      store.getState().setFinish(THIRD_EDIT);

      await controlledFetch.answer(0, { status });
      expect(store.getState()).toMatchObject({
        designId: DESIGN_A_ID,
        saveStatus: expectedStatus,
      });
      expect(controlledFetch.requests[1]?.url).toBe(
        `/api/designs/${DESIGN_B_ID}`,
      );
      await controlledFetch.answer(1, { status: 200, id: DESIGN_B_ID });
      await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS * 2);
      expect(controlledFetch.requests).toHaveLength(2);
      expect(store.getState().saveStatus).toBe(expectedStatus);

      store.getState().setFinish(FOURTH_EDIT);
      expect(store.getState().saveStatus).toBe(expectedStatus);
      await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS * 2);
      expect(controlledFetch.requests).toHaveLength(2);
    },
  );
});
