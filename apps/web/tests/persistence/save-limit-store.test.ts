// The limit on saves through the app's own store, with only `fetch` stubbed, as `saved-design-bookkeeping.test.ts`
// does: what a refused save leaves on screen and in the store, that nothing is sent while it waits, and that the last
// edit is what is stored when it goes. The overwrite's read of the stored revision, refused, is written down once and
// leaves the conflict standing.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MINTED_ID = "design-under-test";
const FIRST_REMOVED = "p7";
const SECOND_REMOVED = "p24";
const MILLISECONDS_PER_SECOND = 1000;

interface Sent {
  readonly method: string;
  readonly expectedRevision: string | null;
  readonly body: string | null;
}

let sent: Sent[];
let answers: (() => Response)[];

function json(
  payload: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function saveLimitRefusal(retryAfterSeconds: number): Response {
  return json({ code: "SAVE_LIMIT_REACHED" }, 429, {
    "Retry-After": String(retryAfterSeconds),
  });
}

function stubFetch() {
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    sent.push({
      method: init.method ?? "GET",
      expectedRevision: headers.get("x-expected-revision"),
      body: typeof init.body === "string" ? init.body : null,
    });
    const scripted = answers.shift();
    if (scripted !== undefined) return Promise.resolve(scripted());
    if (init.method === "POST") {
      return Promise.resolve(json({ id: MINTED_ID, revision: "1" }, 201));
    }
    return Promise.resolve(json({ id: MINTED_ID, revision: "2" }));
  });
}

async function loadFreshStore() {
  vi.resetModules();
  const module = await import("../../src/store/configurator-store");
  return module.useConfiguratorStore;
}

type Store = Awaited<ReturnType<typeof loadFreshStore>>;

function removePlacement(store: Store, id: string): void {
  store.getState().select({ kind: "placement", id });
  store.getState().remove();
}

const methodsSent = (): string[] => sent.map(({ method }) => method);

describe("a save the limit refused, through the store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sent = [];
    answers = [];
    stubFetch();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("leaves the store waiting with the time the answer stated, the change kept and nothing lost", async () => {
    answers.push(() => json({ id: MINTED_ID, revision: "1" }, 201));
    answers.push(() => saveLimitRefusal(30));
    const store = await loadFreshStore();
    const editedAtMs = Date.now();

    removePlacement(store, FIRST_REMOVED);
    await vi.advanceTimersByTimeAsync(0);

    const state = store.getState();
    expect(state.saveStatus).toBe("error");
    expect(state.saveResumesAtMs).toBe(
      editedAtMs + 30 * MILLISECONDS_PER_SECOND,
    );
    expect(state.design).not.toBe(state.savedDesign);
  });

  it("forgets the wait when another design is loaded, which describes another generation", async () => {
    answers.push(() => json({ id: MINTED_ID, revision: "1" }, 201));
    answers.push(() => saveLimitRefusal(30));
    const store = await loadFreshStore();
    removePlacement(store, FIRST_REMOVED);
    await vi.advanceTimersByTimeAsync(0);

    store.getState().hydrate({
      design: store.getState().design,
      designId: "another-design",
      revision: "3",
      canWrite: true,
    });

    expect(store.getState().saveStatus).toBe("idle");
    expect(store.getState().saveResumesAtMs).toBeNull();
  });

  it("sends nothing while it waits and one write at the time, which holds the last edit made meanwhile", async () => {
    answers.push(() => json({ id: MINTED_ID, revision: "1" }, 201));
    answers.push(() => saveLimitRefusal(30));
    const store = await loadFreshStore();
    removePlacement(store, FIRST_REMOVED);
    await vi.advanceTimersByTimeAsync(0);
    expect(methodsSent()).toEqual(["POST", "PUT"]);

    removePlacement(store, SECOND_REMOVED);
    await vi.advanceTimersByTimeAsync(30 * MILLISECONDS_PER_SECOND - 1);
    expect(methodsSent()).toEqual(["POST", "PUT"]);
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(0);

    expect(methodsSent()).toEqual(["POST", "PUT", "PUT"]);
    expect(sent.at(-1)?.body).toBe(JSON.stringify(store.getState().design));
    const state = store.getState();
    expect(state.saveStatus).toBe("idle");
    expect(state.saveResumesAtMs).toBeNull();
    expect(state.design).toBe(state.savedDesign);
  });

  it("keeps what is stored equal to the last edit when the refusal comes twice", async () => {
    answers.push(() => json({ id: MINTED_ID, revision: "1" }, 201));
    answers.push(() => saveLimitRefusal(30));
    answers.push(() => saveLimitRefusal(45));
    const store = await loadFreshStore();
    removePlacement(store, FIRST_REMOVED);
    await vi.advanceTimersByTimeAsync(30 * MILLISECONDS_PER_SECOND);
    removePlacement(store, SECOND_REMOVED);
    await vi.advanceTimersByTimeAsync(45 * MILLISECONDS_PER_SECOND);
    await vi.advanceTimersByTimeAsync(0);

    expect(methodsSent()).toEqual(["POST", "PUT", "PUT", "PUT"]);
    expect(sent.at(-1)?.body).toBe(JSON.stringify(store.getState().design));
    expect(store.getState().saveStatus).toBe("idle");
  });
});

describe("a design loaded again while its own write waits, through the store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sent = [];
    answers = [];
    stubFetch();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** Edits the minted design, has the save refused for 30 s, then leaves for another design and loads this one again
   *  from the page's own copy, which is what the server held before the edit. */
  async function leaveAndLoadAgain(
    store: Store,
    canWrite: boolean | "checking" = "checking",
  ) {
    const pageCopy = store.getState().design;
    store.getState().hydrate({
      design: pageCopy,
      designId: MINTED_ID,
      revision: "1",
      canWrite: true,
    });
    answers.push(() => saveLimitRefusal(30));
    removePlacement(store, FIRST_REMOVED);
    await vi.advanceTimersByTimeAsync(0);
    const edited = store.getState().design;
    const refusedAtMs = Date.now();
    store.getState().hydrate({
      design: pageCopy,
      designId: "another-design",
      revision: "5",
      canWrite: true,
    });
    store.getState().hydrate({
      design: pageCopy,
      designId: MINTED_ID,
      revision: "1",
      canWrite,
    });
    return { pageCopy, edited, refusedAtMs };
  }

  it("shows the waiting design, unsaved, with its wait, and not the server's copy as saved", async () => {
    const store = await loadFreshStore();

    const { pageCopy, edited, refusedAtMs } = await leaveAndLoadAgain(store);

    const state = store.getState();
    expect(state.design).toBe(edited);
    expect(state.savedDesign).toBe(pageCopy);
    expect(state.saveStatus).toBe("error");
    expect(state.saveResumesAtMs).toBe(
      refusedAtMs + 30 * MILLISECONDS_PER_SECOND,
    );
    expect(state.hasBeenEdited).toBe(true);
    expect(state.revision).toBe("1");
  });

  it("sends the one waiting write at the stated time with no edit made, and then shows it saved", async () => {
    const store = await loadFreshStore();
    const { edited } = await leaveAndLoadAgain(store);

    await vi.advanceTimersByTimeAsync(30 * MILLISECONDS_PER_SECOND - 1);
    expect(methodsSent()).toEqual(["PUT"]);
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(0);

    expect(methodsSent()).toEqual(["PUT", "PUT"]);
    expect(sent.at(-1)?.body).toBe(JSON.stringify(edited));
    const state = store.getState();
    expect(state.saveStatus).toBe("idle");
    expect(state.saveResumesAtMs).toBeNull();
    expect(state.design).toBe(state.savedDesign);
    expect(state.revision).toBe("2");
  });

  it("lets an edit made after the return join the one write, which holds both edits", async () => {
    const store = await loadFreshStore();
    await leaveAndLoadAgain(store);

    removePlacement(store, SECOND_REMOVED);
    await vi.advanceTimersByTimeAsync(30 * MILLISECONDS_PER_SECOND);
    await vi.advanceTimersByTimeAsync(0);

    expect(methodsSent()).toEqual(["PUT", "PUT"]);
    const written = JSON.parse(sent.at(-1)?.body ?? "{}") as {
      placements: { id: string }[];
    };
    const ids = written.placements.map(({ id }) => id);
    expect(ids).not.toContain(FIRST_REMOVED);
    expect(ids).not.toContain(SECOND_REMOVED);
    expect(sent.at(-1)?.body).toBe(JSON.stringify(store.getState().design));
    expect(store.getState().saveStatus).toBe("idle");
  });

  it("gives a read-only load the server's copy as before, whoever's write waits", async () => {
    const store = await loadFreshStore();

    const { pageCopy } = await leaveAndLoadAgain(store, false);

    const state = store.getState();
    expect(state.design).toBe(pageCopy);
    expect(state.saveStatus).toBe("idle");
    expect(state.saveResumesAtMs).toBeNull();
  });

  it("gives a design with nothing waiting the server's copy, saved, as before", async () => {
    const store = await loadFreshStore();
    const loaded = { ...store.getState().design, presetId: "loaded" };

    store.getState().hydrate({
      design: loaded,
      designId: MINTED_ID,
      revision: "3",
      canWrite: true,
    });

    const state = store.getState();
    expect(state.design).toBe(loaded);
    expect(state.savedDesign).toBe(loaded);
    expect(state.saveStatus).toBe("idle");
    expect(state.hasBeenEdited).toBe(false);
    expect(state.revision).toBe("3");
  });
});

describe("the overwrite's read of the stored revision, refused, through the store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sent = [];
    answers = [];
    stubFetch();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function intoConflict(store: Store): Promise<void> {
    store.getState().hydrate({
      design: store.getState().design,
      designId: MINTED_ID,
      revision: "1",
      canWrite: true,
    });
    answers.push(() => json({ code: "REVISION_CONFLICT" }, 409));
    removePlacement(store, FIRST_REMOVED);
    await vi.advanceTimersByTimeAsync(0);
  }

  function readRefusal(): Response {
    return json({ code: "READ_LIMIT_REACHED", error: "BODY-MARKER-31" }, 429);
  }

  it("writes one line without the answer's body, keeps the conflict and asks once, with no loop", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const store = await loadFreshStore();
    await intoConflict(store);
    answers.push(readRefusal);

    store.getState().overwriteConflict();
    await vi.advanceTimersByTimeAsync(10 * 60 * MILLISECONDS_PER_SECOND);

    expect(store.getState().saveStatus).toBe("conflict");
    expect(methodsSent()).toEqual(["PUT", "GET"]);
    expect(warn.mock.calls).toEqual([
      [
        "[save]",
        {
          event: "overwrite-read-failed",
          reason: "Loading a design failed: HTTP status 429",
        },
      ],
    ]);
  });

  it("can save again afterwards: the next press reads, then writes against the revision it read", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const store = await loadFreshStore();
    await intoConflict(store);
    answers.push(readRefusal);
    store.getState().overwriteConflict();
    await vi.advanceTimersByTimeAsync(0);
    answers.push(() =>
      json({
        id: MINTED_ID,
        design: store.getState().design,
        revision: "7",
        canWrite: true,
      }),
    );

    store.getState().overwriteConflict();
    await vi.advanceTimersByTimeAsync(2 * MILLISECONDS_PER_SECOND);

    expect(methodsSent()).toEqual(["PUT", "GET", "GET", "PUT"]);
    expect(sent.at(-1)?.expectedRevision).toBe("7");
    expect(store.getState().saveStatus).toBe("idle");
  });
});
