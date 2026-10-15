// Adversarial QA for M3 Wave 3C-2b, driven through the app's own store singleton.
//
// The implementer's suite asserts request *methods*. This one asserts request *bodies* wherever the
// criterion is about state — "the final state always lands" is a claim about what was written, not
// about how many writes happened — and it drives the bursts across the new interval boundary rather
// than within one tick.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEGACY_ENUM_FINISHES } from "@lemnaria/configurator-domain";

/** Every scripted response reports this revision, and the store therefore states it on the next
 *  save. These tests attack the write path's scheduling, not its concurrency rule. */
const TEST_REVISION = "1";

const MINTED_ID = "design-under-test";
const MIN_SAVE_INTERVAL_MS = 1000;
/** Removing the fridge succeeds and leaves a void selected, so the next command against that
 *  selection refuses — which is how a refusal is produced without inventing one. */
const FRIDGE_ID = "p7";
const OVER_FRIDGE_ID = "p24";

interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly body: string | undefined;
}

let requests: RecordedRequest[];
let failuresRemaining: number;
let failEveryWrite: boolean;
let forbidEveryWrite: boolean;
let throttleWrites: number;
let holdRequests: boolean;
let heldResolvers: (() => void)[];

function stubFetch(): void {
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    requests.push({
      url,
      method,
      body: typeof init.body === "string" ? init.body : undefined,
    });

    const answer = (): Response => {
      if (method === "PUT" && forbidEveryWrite) {
        return new Response("{}", { status: 403 });
      }
      if (method === "PUT" && throttleWrites > 0) {
        throttleWrites -= 1;
        return new Response("{}", { status: 429 });
      }
      if (failEveryWrite && method === "PUT") {
        return new Response("{}", { status: 500 });
      }
      if (failuresRemaining > 0) {
        failuresRemaining -= 1;
        return new Response("{}", { status: 500 });
      }
      return new Response(
        JSON.stringify({ id: MINTED_ID, revision: TEST_REVISION }),
        {
          status: method === "POST" ? 201 : 200,
          headers: { "content-type": "application/json" },
        },
      );
    };

    if (!holdRequests) return Promise.resolve(answer());
    return new Promise<Response>((resolve) => {
      heldResolvers.push(() => {
        resolve(answer());
      });
    });
  });
}

function releaseHeld(): void {
  holdRequests = false;
  for (const release of heldResolvers.splice(0)) release();
}

async function loadFreshStore() {
  vi.resetModules();
  const module = await import("../../src/store/configurator-store");
  return module.useConfiguratorStore;
}

function writesOf(): RecordedRequest[] {
  return requests.filter((request) => request.method === "PUT");
}

beforeEach(() => {
  vi.useFakeTimers();
  requests = [];
  failuresRemaining = 0;
  failEveryWrite = false;
  forbidEveryWrite = false;
  throttleWrites = 0;
  holdRequests = false;
  heldResolvers = [];
  stubFetch();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("mint exactly once, under a burst that straddles the in-flight mint", () => {
  it("mints one row when commands keep arriving while the mint is still in flight", async () => {
    const store = await loadFreshStore();
    holdRequests = true;

    // First command starts the mint, which is now held open.
    store.getState().select({ kind: "placement", id: FRIDGE_ID });
    store.getState().remove();
    await vi.advanceTimersByTimeAsync(0);
    expect(requests.map((request) => request.method)).toEqual(["POST"]);

    // More commands land *during* the mint. None of them may start a second one.
    store.getState().select({ kind: "placement", id: OVER_FRIDGE_ID });
    store.getState().remove();
    store.getState().select({ kind: "placement", id: "p8" });
    store.getState().setFinish(LEGACY_ENUM_FINISHES.oak);
    await vi.advanceTimersByTimeAsync(0);
    expect(
      requests.filter((request) => request.method === "POST"),
    ).toHaveLength(1);

    releaseHeld();
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS * 3);

    expect(
      requests.filter((request) => request.method === "POST"),
    ).toHaveLength(1);
    expect(writesOf().length).toBeGreaterThan(0);
  });

  it("mints one row even when the first write after the mint fails and retries", async () => {
    const store = await loadFreshStore();
    failuresRemaining = 0;

    store.getState().select({ kind: "placement", id: FRIDGE_ID });
    store.getState().remove();
    await vi.advanceTimersByTimeAsync(0);
    // The mint has happened; make the writes that follow fail for a while.
    failuresRemaining = 3;
    store.getState().select({ kind: "placement", id: OVER_FRIDGE_ID });
    store.getState().remove();

    await vi.advanceTimersByTimeAsync(30_000);

    expect(
      requests.filter((request) => request.method === "POST"),
    ).toHaveLength(1);
    expect(store.getState().saveStatus).toBe("idle");
  });
});

describe("the final state always lands, across the interval", () => {
  it("writes the last design of a burst that spans the interval window", async () => {
    const store = await loadFreshStore();
    store.getState().select({ kind: "placement", id: FRIDGE_ID });
    store.getState().remove();
    await vi.advanceTimersByTimeAsync(0);

    // Four more commands inside the window, then let it expire.
    store.getState().select({ kind: "placement", id: OVER_FRIDGE_ID });
    store.getState().remove();
    await vi.advanceTimersByTimeAsync(100);
    store.getState().select({ kind: "placement", id: "p8" });
    store.getState().setFinish(LEGACY_ENUM_FINISHES.oak);
    await vi.advanceTimersByTimeAsync(100);
    store.getState().setHandle("push");
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS * 2);

    // Whatever the intermediate writes were, the last one must carry the store's current design.
    const lastWrite = writesOf().at(-1);
    expect(lastWrite).toBeDefined();
    expect(JSON.parse(lastWrite?.body ?? "null")).toEqual(
      JSON.parse(JSON.stringify(store.getState().design)),
    );
  });

  it("keeps the id stable across every write after the mint", async () => {
    const store = await loadFreshStore();
    store.getState().select({ kind: "placement", id: FRIDGE_ID });
    store.getState().remove();
    await vi.advanceTimersByTimeAsync(0);
    store.getState().select({ kind: "placement", id: OVER_FRIDGE_ID });
    store.getState().remove();
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS * 2);

    // The first command's own write follows the mint, and the second command is made once the id is
    // held, so its write is the one that has to find that id. Without the floor of two, a coalescer
    // that stopped writing for an identity it already holds an id for would leave only the first.
    expect(writesOf().length).toBeGreaterThanOrEqual(2);
    for (const write of writesOf()) {
      expect(write.url).toBe(`/api/designs/${MINTED_ID}`);
    }
  });
});

describe("a refused command persists nothing", () => {
  it("issues no request for a refusal that follows a successful command", async () => {
    const store = await loadFreshStore();
    store.getState().select({ kind: "placement", id: FRIDGE_ID });
    store.getState().remove();
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS * 2);
    const before = requests.length;
    expect(before).toBeGreaterThan(0);

    // A void is selected after the remove, so all three of these refuse.
    store.getState().remove();
    store.getState().setFinish(LEGACY_ENUM_FINISHES.oak);
    store.getState().setHandle("push");
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS * 3);

    expect(requests).toHaveLength(before);
    expect(store.getState().lastRejection).not.toBeNull();
  });

  it("issues nothing at all when the very first command refuses", async () => {
    const store = await loadFreshStore();
    store.getState().deselect();

    store.getState().remove();
    store.getState().insert("base-cabinet");
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS * 3);

    expect(requests).toEqual([]);
    expect(store.getState().designId).toBeNull();
    expect(store.getState().hasPersistedSuccessfully).toBe(false);
  });
});

// Lead 5. The two fields disagree in exactly one state, and it is the state that matters: the mint
// created a row, so a design id exists *somewhere*, but no edit of the customer's has ever been
// stored — the row still holds the seeded fixture. Sharing it would share a kitchen the customer
// never configured, which is why the gate is `hasPersistedSuccessfully` and not the id.
describe("what gates a shareable link", () => {
  it("presents nothing shareable after a mint whose follow-up write keeps failing", async () => {
    const store = await loadFreshStore();
    // The mint succeeds — a row now exists — and every write of the customer's design after it
    // fails. That is the state the two fields are there to tell apart.
    failEveryWrite = true;

    store.getState().select({ kind: "placement", id: FRIDGE_ID });
    store.getState().remove();
    await vi.advanceTimersByTimeAsync(30_000);

    // A row exists — the mint succeeded — and the writes that carry the customer's edit did not.
    expect(
      requests.filter((request) => request.method === "POST"),
    ).toHaveLength(1);
    expect(
      requests.filter((request) => request.method === "PUT").length,
    ).toBeGreaterThan(0);
    expect(store.getState().saveStatus).toBe("error");
    // …and the store still offers nothing to share, because nothing of the customer's is stored.
    expect(store.getState().designId).toBeNull();
    expect(store.getState().hasPersistedSuccessfully).toBe(false);
    // The edit itself was never reverted.
    expect(
      store.getState().records.some((record) => record.id === FRIDGE_ID),
    ).toBe(false);
  });

  it("turns both on together once a write finally succeeds", async () => {
    const store = await loadFreshStore();
    failuresRemaining = 2;

    store.getState().select({ kind: "placement", id: FRIDGE_ID });
    store.getState().remove();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(store.getState().designId).toBe(MINTED_ID);
    expect(store.getState().hasPersistedSuccessfully).toBe(true);
    expect(store.getState().saveStatus).toBe("idle");
  });
});

describe("no interaction blocks on a write", () => {
  it("applies the edit and returns before any response arrives", async () => {
    const store = await loadFreshStore();
    holdRequests = true;

    store.getState().select({ kind: "placement", id: FRIDGE_ID });
    store.getState().remove();

    // Nothing has been released, so no request has resolved — and yet the design is already
    // mutated, the records re-derived and the selection moved.
    expect(store.getState().records.some((r) => r.id === FRIDGE_ID)).toBe(
      false,
    );
    expect(store.getState().selection?.kind).toBe("void");
    releaseHeld();
  });

  it("reports 'saving' while the write is in flight and 'idle' only after it lands", async () => {
    const store = await loadFreshStore();
    holdRequests = true;

    store.getState().select({ kind: "placement", id: FRIDGE_ID });
    store.getState().remove();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().saveStatus).toBe("saving");

    releaseHeld();
    await vi.advanceTimersByTimeAsync(MIN_SAVE_INTERVAL_MS * 2);

    expect(store.getState().saveStatus).toBe("idle");
  });
});

// R1.2 through the shipped wiring. The store is where a UI would read this, so the terminal state
// has to be visible there and has to leave the "nothing shareable" gate alone.
describe("a design this browser cannot write reaches the store as its own status", () => {
  it("reports 'unauthorized', stops requesting, and keeps the edit", async () => {
    const store = await loadFreshStore();
    // The mint succeeds — this browser once held a credential — and then the cookie is gone.
    forbidEveryWrite = true;

    store.getState().select({ kind: "placement", id: FRIDGE_ID });
    store.getState().remove();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    const writes = requests.filter((request) => request.method === "PUT");
    expect(writes).toHaveLength(1);
    expect(store.getState().saveStatus).toBe("unauthorized");
    // Distinct from a retryable failure, and the "nothing shareable" gate is untouched.
    expect(store.getState().hasPersistedSuccessfully).toBe(false);
    expect(store.getState().designId).toBeNull();
    // And the customer's edit still stands in the UI, which is the part that must never regress.
    expect(store.getState().records.some((r) => r.id === FRIDGE_ID)).toBe(
      false,
    );
  });

  it("does not send a further request for later edits once refused", async () => {
    const store = await loadFreshStore();
    forbidEveryWrite = true;
    store.getState().select({ kind: "placement", id: FRIDGE_ID });
    store.getState().remove();
    await vi.advanceTimersByTimeAsync(5000);
    const after = requests.length;

    store.getState().select({ kind: "placement", id: OVER_FRIDGE_ID });
    store.getState().remove();
    store.getState().select({ kind: "placement", id: "p8" });
    store.getState().setFinish(LEGACY_ENUM_FINISHES.oak);
    await vi.advanceTimersByTimeAsync(60 * 1000);

    expect(requests).toHaveLength(after);
    expect(store.getState().saveStatus).toBe("unauthorized");
  });

  it("keeps retrying a 429, which is a refusal that can recover", async () => {
    const store = await loadFreshStore();
    throttleWrites = 3;

    store.getState().select({ kind: "placement", id: FRIDGE_ID });
    store.getState().remove();
    await vi.advanceTimersByTimeAsync(60 * 1000);

    // Throttling must not end the session's writing the way a credential refusal does.
    expect(
      requests.filter((request) => request.method === "PUT").length,
    ).toBeGreaterThan(3);
    expect(store.getState().saveStatus).toBe("idle");
    expect(store.getState().hasPersistedSuccessfully).toBe(true);
  });
});
