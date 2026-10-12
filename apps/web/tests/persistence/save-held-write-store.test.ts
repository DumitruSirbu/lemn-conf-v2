// A design shown again while the writer holds a write for it that is not waiting for the limit, through the app's own
// store with only `fetch` stubbed: what the screen shows when it comes back, what is sent next and what is stored.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DESIGN_A = "design-a";
const DESIGN_B = "design-b";
const A_REVISION = "1";
const B_REVISION = "5";
const FIRST_REMOVED = "p7";
const SECOND_REMOVED = "p24";
const THIRD_REMOVED = "p23";
const SERVER_ERROR_STATUS = 500;
const BACKOFF_FIRST_STEP_MS = 500;
const MIN_SAVE_INTERVAL_MS = 1000;

interface Write {
  readonly designId: string;
  readonly expectedRevision: string | null;
  readonly body: string;
}

let writes: Write[];
let answers: (() => Response | Promise<Response>)[];

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const serverError = () => json({}, SERVER_ERROR_STATUS);

/** Every write is recorded with the design its address names; one with no scripted answer is stored. */
function stubFetch(): void {
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    const designId = url.split("/").at(-1) ?? "";
    writes.push({
      designId,
      expectedRevision: new Headers(init.headers).get("x-expected-revision"),
      body: typeof init.body === "string" ? init.body : "",
    });
    const scripted = answers.shift();
    const nextRevision = String(writes.length + 1);
    return Promise.resolve(
      scripted?.() ?? json({ id: designId, revision: nextRevision }),
    );
  });
}

async function loadFreshStore() {
  vi.resetModules();
  const module = await import("../../src/store/configurator-store");
  return module.useConfiguratorStore;
}

type Store = Awaited<ReturnType<typeof loadFreshStore>>;
type Design = ReturnType<Store["getState"]>["design"];

function removePlacement(store: Store, id: string): void {
  store.getState().select({ kind: "placement", id });
  store.getState().remove();
}

function placementIdsIn(body: string | undefined): string[] {
  const design = JSON.parse(body ?? "{}") as { placements?: { id: string }[] };
  return (design.placements ?? []).map(({ id }) => id);
}

const pass = (ms: number) => vi.advanceTimersByTimeAsync(ms);

function load(
  store: Store,
  loaded: { designId: string; design: Design; revision: string },
): void {
  store.getState().hydrate({ ...loaded, canWrite: "checking" });
}

interface Visit {
  readonly store: Store;
  readonly pageCopy: Design;
}

/** Design A on screen and one edit made whose save fails: the writer is backing off. */
async function editAndFail(): Promise<Visit> {
  const store = await loadFreshStore();
  const pageCopy = store.getState().design;
  load(store, { designId: DESIGN_A, design: pageCopy, revision: A_REVISION });
  answers.push(serverError);
  removePlacement(store, FIRST_REMOVED);
  await pass(0);
  return { store, pageCopy };
}

function leaveForBAndReturnToA({ store, pageCopy }: Visit): void {
  const designOfB = { ...pageCopy, presetId: "the other design" };
  load(store, { designId: DESIGN_B, design: designOfB, revision: B_REVISION });
  load(store, { designId: DESIGN_A, design: pageCopy, revision: A_REVISION });
}

beforeEach(() => {
  vi.useFakeTimers();
  writes = [];
  answers = [];
  stubFetch();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a design returned to while its saves are failing", () => {
  it("shows the edit as unsaved and failed, not the page's copy as saved", async () => {
    const visit = await editAndFail();
    const edited = visit.store.getState().design;

    leaveForBAndReturnToA(visit);

    expect(visit.store.getState()).toMatchObject({
      design: edited,
      savedDesign: visit.pageCopy,
      saveStatus: "error",
      saveResumesAtMs: null,
      hasBeenEdited: true,
      revision: A_REVISION,
    });
  });

  it("sends the edit once the backoff already armed ends, and then shows it saved", async () => {
    const visit = await editAndFail();
    leaveForBAndReturnToA(visit);

    await pass(BACKOFF_FIRST_STEP_MS - 1);
    expect(writes).toHaveLength(1);
    await pass(1);

    expect(writes).toHaveLength(2);
    expect(placementIdsIn(writes[1]?.body)).not.toContain(FIRST_REMOVED);
    expect(writes[1]?.expectedRevision).toBe(A_REVISION);
    expect(visit.store.getState().saveStatus).toBe("idle");
    expect(visit.store.getState().design).toBe(
      visit.store.getState().savedDesign,
    );
    expect(visit.store.getState().revision).toBe("3");
  });

  it("puts an edit made after the return into the same request as the earlier one, answered as stored", async () => {
    const visit = await editAndFail();
    leaveForBAndReturnToA(visit);

    removePlacement(visit.store, SECOND_REMOVED);
    await pass(BACKOFF_FIRST_STEP_MS);

    expect(writes).toHaveLength(2);
    expect(placementIdsIn(writes[1]?.body)).not.toContain(FIRST_REMOVED);
    expect(placementIdsIn(writes[1]?.body)).not.toContain(SECOND_REMOVED);
    expect(visit.store.getState().saveStatus).toBe("idle");
  });

  it("shows a read-only load the stored copy and none of the held write", async () => {
    const visit = await editAndFail();
    const designOfB = { ...visit.pageCopy, presetId: "the other design" };
    load(visit.store, {
      designId: DESIGN_B,
      design: designOfB,
      revision: B_REVISION,
    });

    visit.store.getState().hydrate({
      designId: DESIGN_A,
      design: visit.pageCopy,
      revision: A_REVISION,
      canWrite: false,
    });

    expect(visit.store.getState()).toMatchObject({
      design: visit.pageCopy,
      saveStatus: "idle",
      hasBeenEdited: false,
    });
  });
});

interface HeldAnswer {
  readonly answer: (response: Response) => void;
}

/** Design A on screen and one edit made whose save request is out and unanswered until the test answers it. */
async function editAndHoldTheRequest(): Promise<Visit & HeldAnswer> {
  const store = await loadFreshStore();
  const pageCopy = store.getState().design;
  load(store, { designId: DESIGN_A, design: pageCopy, revision: A_REVISION });
  let answer: (response: Response) => void = () => undefined;
  answers.push(
    () =>
      new Promise<Response>((resolve) => {
        answer = resolve;
      }),
  );
  removePlacement(store, FIRST_REMOVED);
  await pass(0);
  return {
    store,
    pageCopy,
    answer: (response) => {
      answer(response);
    },
  };
}

describe("a design returned to while its save request is out", () => {
  it("shows the edit as unsaved and being saved, not the page's copy as saved", async () => {
    const visit = await editAndHoldTheRequest();
    const edited = visit.store.getState().design;

    leaveForBAndReturnToA(visit);

    expect(visit.store.getState()).toMatchObject({
      design: edited,
      savedDesign: visit.pageCopy,
      saveStatus: "saving",
      saveResumesAtMs: null,
      hasBeenEdited: true,
      revision: A_REVISION,
    });
  });

  it("shows it saved at the answered revision when the answer arrives after the return", async () => {
    const visit = await editAndHoldTheRequest();
    const edited = visit.store.getState().design;
    leaveForBAndReturnToA(visit);

    visit.answer(json({ id: DESIGN_A, revision: "2" }));
    await pass(0);

    expect(visit.store.getState()).toMatchObject({
      saveStatus: "idle",
      revision: "2",
    });
    expect(visit.store.getState().design).toBe(edited);
    expect(visit.store.getState().savedDesign).toBe(edited);
  });

  it("builds the next edit on the written design and states the answered revision, never a conflict", async () => {
    const visit = await editAndHoldTheRequest();
    leaveForBAndReturnToA(visit);
    visit.answer(json({ id: DESIGN_A, revision: "2" }));
    await pass(0);

    removePlacement(visit.store, SECOND_REMOVED);
    await pass(MIN_SAVE_INTERVAL_MS);

    expect(writes).toHaveLength(2);
    expect(writes[1]?.expectedRevision).toBe("2");
    expect(placementIdsIn(writes[1]?.body)).not.toContain(FIRST_REMOVED);
    expect(placementIdsIn(writes[1]?.body)).not.toContain(SECOND_REMOVED);
    expect(visit.store.getState().saveStatus).toBe("idle");
  });

  it("puts an edit made while the request is still out into the request that follows it, with the earlier one", async () => {
    const visit = await editAndHoldTheRequest();
    leaveForBAndReturnToA(visit);

    removePlacement(visit.store, SECOND_REMOVED);
    visit.answer(json({ id: DESIGN_A, revision: "2" }));
    await pass(MIN_SAVE_INTERVAL_MS);

    expect(writes).toHaveLength(2);
    expect(writes[1]?.expectedRevision).toBe("2");
    expect(placementIdsIn(writes[1]?.body)).not.toContain(FIRST_REMOVED);
    expect(placementIdsIn(writes[1]?.body)).not.toContain(SECOND_REMOVED);
  });

  it("shows the edit as failed when the answer is a failure, and sends it again", async () => {
    const visit = await editAndHoldTheRequest();
    const edited = visit.store.getState().design;
    leaveForBAndReturnToA(visit);

    visit.answer(serverError());
    await pass(0);
    expect(visit.store.getState()).toMatchObject({
      design: edited,
      saveStatus: "error",
      saveResumesAtMs: null,
    });
    await pass(BACKOFF_FIRST_STEP_MS);

    expect(writes).toHaveLength(2);
    expect(writes[1]?.expectedRevision).toBe(A_REVISION);
    expect(placementIdsIn(writes[1]?.body)).not.toContain(FIRST_REMOVED);
    expect(visit.store.getState().saveStatus).toBe("idle");
  });
});

/** Design A on screen, one edit stored and a second one made inside the interval, so it is ready and not yet sent. */
async function editTwiceInsideTheInterval(): Promise<Visit> {
  const store = await loadFreshStore();
  const pageCopy = store.getState().design;
  load(store, { designId: DESIGN_A, design: pageCopy, revision: A_REVISION });
  removePlacement(store, FIRST_REMOVED);
  await pass(0);
  removePlacement(store, SECOND_REMOVED);
  return { store, pageCopy };
}

describe("a design returned to while its edit is ready and not yet sent", () => {
  it("shows the edit as unsaved with no failure, not the page's copy as saved", async () => {
    const visit = await editTwiceInsideTheInterval();
    const edited = visit.store.getState().design;

    leaveForBAndReturnToA(visit);

    expect(visit.store.getState()).toMatchObject({
      design: edited,
      savedDesign: visit.pageCopy,
      saveStatus: "idle",
      saveResumesAtMs: null,
      hasBeenEdited: true,
    });
    expect(
      placementIdsIn(JSON.stringify(visit.store.getState().design)),
    ).not.toContain(SECOND_REMOVED);
  });

  it("sends it once at the interval's end, and then shows it saved at the answered revision", async () => {
    const visit = await editTwiceInsideTheInterval();
    leaveForBAndReturnToA(visit);

    await pass(MIN_SAVE_INTERVAL_MS - 1);
    expect(writes).toHaveLength(1);
    await pass(1);

    expect(writes).toHaveLength(2);
    expect(writes[1]?.expectedRevision).toBe("2");
    expect(placementIdsIn(writes[1]?.body)).not.toContain(SECOND_REMOVED);
    expect(visit.store.getState()).toMatchObject({
      saveStatus: "idle",
      revision: "3",
    });
    expect(visit.store.getState().design).toBe(
      visit.store.getState().savedDesign,
    );
  });

  it("puts an edit made after the return into that one request with the earlier edits", async () => {
    const visit = await editTwiceInsideTheInterval();
    leaveForBAndReturnToA(visit);

    removePlacement(visit.store, THIRD_REMOVED);
    await pass(MIN_SAVE_INTERVAL_MS);

    expect(writes).toHaveLength(2);
    expect(writes[1]?.expectedRevision).toBe("2");
    for (const removed of [FIRST_REMOVED, SECOND_REMOVED, THIRD_REMOVED]) {
      expect(placementIdsIn(writes[1]?.body)).not.toContain(removed);
    }
  });
});
