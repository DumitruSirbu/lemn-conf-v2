// A design loaded again while its own write waits for the limit on saves, through the app's own store with only
// `fetch` stubbed: the returns the developer's cases stop short of. A second leave and return, a wait refused again
// after a return, a server copy that moved on meanwhile, another design on screen while the first one's write waits
// and when it goes, and a load of the same design with no other design between.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DESIGN_A = "design-a";
const DESIGN_B = "design-b";
const A_REVISION = "1";
const B_REVISION = "5";
const A_REVISION_AFTER_ANOTHER_TAB = "9";
const FIRST_REMOVED = "p7";
const SECOND_REMOVED = "p24";
const WAIT_SECONDS = 30;
const RETURNS = 2;
const SECOND_WAIT_SECONDS = 45;
const SECOND_MS = 1000;
const HOUR_MS = 3600 * SECOND_MS;
const CONFLICT_STATUS = 409;
const LIMIT_STATUS = 429;

interface Write {
  readonly designId: string;
  readonly expectedRevision: string | null;
  readonly body: string;
}

let writes: Write[];
let answers: (() => Response)[];

function json(
  payload: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function refusedFor(seconds: number): () => Response {
  return () =>
    json({ code: "SAVE_LIMIT_REACHED" }, LIMIT_STATUS, {
      "Retry-After": String(seconds),
    });
}

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
    return Promise.resolve(
      scripted?.() ?? json({ id: designId, revision: "2" }),
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

interface Waiting {
  readonly store: Store;
  readonly pageCopy: Design;
  readonly edited: Design;
  readonly resumesAtMs: number;
}

/** Design A on screen, one edit made, its save refused for the first wait. */
async function editAndBeRefused(): Promise<Waiting> {
  const store = await loadFreshStore();
  const pageCopy = store.getState().design;
  load(store, { designId: DESIGN_A, design: pageCopy, revision: A_REVISION });
  answers.push(refusedFor(WAIT_SECONDS));
  removePlacement(store, FIRST_REMOVED);
  await pass(0);
  return {
    store,
    pageCopy,
    edited: store.getState().design,
    resumesAtMs: Date.now() + WAIT_SECONDS * SECOND_MS,
  };
}

function load(
  store: Store,
  loaded: { designId: string; design: Design; revision: string },
): void {
  store.getState().hydrate({ ...loaded, canWrite: "checking" });
}

function leaveForB({ store, pageCopy }: Waiting): Design {
  const designOfB = { ...pageCopy, presetId: "the other design" };
  load(store, { designId: DESIGN_B, design: designOfB, revision: B_REVISION });
  return designOfB;
}

function returnToA({ store, pageCopy }: Waiting): void {
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

describe("a design left and returned to twice while its write waits", () => {
  it("is shown waiting with the first time each time, on one timer, and one write stores both edits", async () => {
    const waiting = await editAndBeRefused();
    const { store, edited, resumesAtMs } = waiting;

    for (let round = 1; round <= RETURNS; round += 1) {
      leaveForB(waiting);
      await pass(SECOND_MS);
      returnToA(waiting);

      expect(store.getState().design).toBe(edited);
      expect(store.getState().saveStatus).toBe("error");
      expect(store.getState().saveResumesAtMs).toBe(resumesAtMs);
      expect(vi.getTimerCount()).toBe(1);
    }
    removePlacement(store, SECOND_REMOVED);
    await pass(WAIT_SECONDS * SECOND_MS);

    expect(writes).toHaveLength(2);
    expect(placementIdsIn(writes[1]?.body)).not.toContain(FIRST_REMOVED);
    expect(placementIdsIn(writes[1]?.body)).not.toContain(SECOND_REMOVED);
    expect(store.getState().saveStatus).toBe("idle");
    expect(store.getState().design).toBe(store.getState().savedDesign);
  });
});

describe("a returned design whose write is refused again when its wait ends", () => {
  it("tells the screen that shows it now the second time, and a second return is given that time", async () => {
    const waiting = await editAndBeRefused();
    const { store, edited } = waiting;
    leaveForB(waiting);
    returnToA(waiting);
    answers.push(refusedFor(SECOND_WAIT_SECONDS));

    await pass(WAIT_SECONDS * SECOND_MS);
    const secondResumesAtMs = Date.now() + SECOND_WAIT_SECONDS * SECOND_MS;

    expect(store.getState().saveStatus).toBe("error");
    expect(store.getState().saveResumesAtMs).toBe(secondResumesAtMs);
    leaveForB(waiting);
    returnToA(waiting);
    expect(store.getState().design).toBe(edited);
    expect(store.getState().saveResumesAtMs).toBe(secondResumesAtMs);
  });

  it("sends the same edit a third time when the second wait ends, and then shows it saved", async () => {
    const waiting = await editAndBeRefused();
    const { store, edited } = waiting;
    leaveForB(waiting);
    returnToA(waiting);
    answers.push(refusedFor(SECOND_WAIT_SECONDS));
    await pass(WAIT_SECONDS * SECOND_MS);
    leaveForB(waiting);
    returnToA(waiting);

    await pass(SECOND_WAIT_SECONDS * SECOND_MS - 1);
    expect(writes).toHaveLength(2);
    await pass(1);

    expect(writes.map(({ body }) => body)).toEqual(
      Array.from({ length: 3 }, () => JSON.stringify(edited)),
    );
    expect(store.getState().saveStatus).toBe("idle");
    expect(store.getState().savedDesign).toBe(edited);
  });
});

describe("a returned design whose stored copy another tab changed meanwhile", () => {
  /** The return's page holds what the other tab stored: another design at a later revision. */
  async function returnToACopyThatMovedOn() {
    const waiting = await editAndBeRefused();
    leaveForB(waiting);
    const fromTheOtherTab = { ...waiting.pageCopy, presetId: "the other tab" };
    load(waiting.store, {
      designId: DESIGN_A,
      design: fromTheOtherTab,
      revision: A_REVISION_AFTER_ANOTHER_TAB,
    });
    return { ...waiting, fromTheOtherTab };
  }

  it("shows the waiting edit as unsaved over the other tab's copy, still held to its own revision", async () => {
    const { store, edited, fromTheOtherTab } = await returnToACopyThatMovedOn();

    expect(store.getState().design).toBe(edited);
    expect(store.getState().savedDesign).toBe(fromTheOtherTab);
    expect(store.getState().revision).toBe(A_REVISION);
  });

  it("says a conflict when the wait ends, having asked to write over the old revision only", async () => {
    const { store, edited } = await returnToACopyThatMovedOn();
    answers.push(() => json({}, CONFLICT_STATUS));

    await pass(WAIT_SECONDS * SECOND_MS);
    await pass(HOUR_MS);

    expect(writes.map(({ expectedRevision }) => expectedRevision)).toEqual([
      A_REVISION,
      A_REVISION,
    ]);
    expect(store.getState().saveStatus).toBe("conflict");
    expect(store.getState().saveResumesAtMs).toBeNull();
    expect(store.getState().design).toBe(edited);
  });
});

describe("another design on screen while the first one's write waits", () => {
  it("is shown as the server holds it, saved, and its own edit is sent at once under its own address", async () => {
    const waiting = await editAndBeRefused();
    const { store } = waiting;

    const designOfB = leaveForB(waiting);

    expect(store.getState().design).toBe(designOfB);
    expect(store.getState().saveStatus).toBe("idle");
    expect(store.getState().saveResumesAtMs).toBeNull();
    removePlacement(store, SECOND_REMOVED);
    await pass(SECOND_MS);
    expect(writes.map(({ designId }) => designId)).toEqual([
      DESIGN_A,
      DESIGN_B,
    ]);
    expect(writes[1]?.expectedRevision).toBe(B_REVISION);
    expect(writes[1]?.body).toBe(JSON.stringify(store.getState().design));
    expect(placementIdsIn(writes[1]?.body)).toContain(FIRST_REMOVED);
  });

  it("is untouched when the first one's write goes at its time, whole, under the first's address", async () => {
    const waiting = await editAndBeRefused();
    const { store, edited } = waiting;
    const designOfB = leaveForB(waiting);

    await pass(WAIT_SECONDS * SECOND_MS - 1);
    expect(writes).toHaveLength(1);
    await pass(1);

    expect(writes[1]).toEqual({
      designId: DESIGN_A,
      expectedRevision: A_REVISION,
      body: JSON.stringify(edited),
    });
    const state = store.getState();
    expect(state.designId).toBe(DESIGN_B);
    expect(state.design).toBe(designOfB);
    expect(state.savedDesign).toBe(designOfB);
    expect(state.revision).toBe(B_REVISION);
    expect(state.saveStatus).toBe("idle");
  });

  it("leaves nothing to give the first design once its write has gone: a later load is the page's, saved", async () => {
    const waiting = await editAndBeRefused();
    const { store, edited } = waiting;
    leaveForB(waiting);
    await pass(WAIT_SECONDS * SECOND_MS);

    load(store, { designId: DESIGN_A, design: edited, revision: "2" });

    expect(store.getState().design).toBe(edited);
    expect(store.getState().savedDesign).toBe(edited);
    expect(store.getState().saveStatus).toBe("idle");
    expect(store.getState().hasBeenEdited).toBe(false);
    expect(store.getState().revision).toBe("2");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("a design loaded again while its write waits, with no other design between", () => {
  it("keeps the waiting edit and its time, and the one write still goes once at that time", async () => {
    const waiting = await editAndBeRefused();
    const { store, edited, resumesAtMs } = waiting;

    returnToA(waiting);

    expect(store.getState().design).toBe(edited);
    expect(store.getState().saveResumesAtMs).toBe(resumesAtMs);
    await pass(WAIT_SECONDS * SECOND_MS);
    expect(writes).toHaveLength(2);
    expect(writes[1]?.body).toBe(JSON.stringify(edited));
    expect(store.getState().saveStatus).toBe("idle");
    expect(store.getState().design).toBe(store.getState().savedDesign);
  });
});
