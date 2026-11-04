// @vitest-environment happy-dom
//
// The draft of prices as a screen holds it: a write names the revision the screen last saw, one write is out at a time,
// a write refused as `changed-meanwhile` leaves the state read again, and nothing is shown as written until the server
// said so.
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  getStaffSessionExpiry,
  resetStaffSessionExpiryForTests,
} from "@/staff/staff-session-expiry";
import type { PriceDraftClient } from "@/price-dashboard/price-draft-client";
import { usePriceDraft } from "@/price-dashboard/use-price-draft";

import { flushPromises, renderHook } from "../support/render-hook";
import { BASE_CABINET_RULE, stateOf } from "./dashboard-state-fixture";
import { inMemoryPriceDraftClient } from "./in-memory-price-draft-client";

const ANCHOR_ADDRESS = {
  kind: "cabinet",
  ruleId: BASE_CABINET_RULE,
  field: "anchorMinor",
} as const;
const DEPTH_ADDRESS = { kind: "depth-rule" } as const;

afterEach(() => {
  resetStaffSessionExpiryForTests();
});

function mount(client: PriceDraftClient, initialState = stateOf([], "4")) {
  return renderHook(() => usePriceDraft({ initial: initialState, client }));
}

describe("a change that is written", () => {
  it("is adopted as the server stored it, and the next write names the revision it moved to", async () => {
    const server = inMemoryPriceDraftClient(stateOf([], "4"));
    const draft = mount(server.client);

    let first: unknown;
    await act(async () => {
      first = await draft.result.current.change({
        address: DEPTH_ADDRESS,
        value: 18,
      });
    });
    await act(async () => {
      await draft.result.current.change({
        address: ANCHOR_ADDRESS,
        value: 500_000,
      });
    });

    expect(first).toEqual({ kind: "saved" });
    expect(
      server.calls.map(
        (call) => call.kind === "change" && call.request.expectedDraftRevision,
      ),
    ).toEqual(["4", "5"]);
    expect(draft.result.current.state.draft.draftRevision).toBe("6");
    expect(
      draft.result.current.state.draft.changes.map(
        ({ address }) => address.kind,
      ),
    ).toEqual(["depth-rule", "cabinet"]);
    draft.unmount();
  });

  it("is taken out again by its address", async () => {
    const server = inMemoryPriceDraftClient(
      stateOf([{ address: DEPTH_ADDRESS, value: 18 }], "4"),
    );
    const draft = mount(server.client, server.state());

    await act(async () => {
      await draft.result.current.revert({
        kind: "change",
        address: DEPTH_ADDRESS,
      });
    });

    expect(draft.result.current.state.draft.changes).toEqual([]);
    draft.unmount();
  });
});

describe("a write that is not written", () => {
  it("leaves the draft as it was and says which code the server refused it with", async () => {
    const server = inMemoryPriceDraftClient(stateOf([], "4"));
    const draft = mount(server.client);

    let result: unknown;
    await act(async () => {
      result = await draft.result.current.change({
        address: DEPTH_ADDRESS,
        value: 101,
      });
    });

    expect(result).toEqual({ kind: "refused", code: "TOO_LARGE" });
    expect(draft.result.current.state.draft).toEqual({
      draftRevision: "4",
      changes: [],
    });
    draft.unmount();
  });

  it("reads the state again when the draft moved meanwhile, and writes nothing", async () => {
    const server = inMemoryPriceDraftClient(stateOf([], "4"));
    const draft = mount(server.client);
    server.moveDraftBehindTheScreen();

    let result: unknown;
    await act(async () => {
      result = await draft.result.current.change({
        address: DEPTH_ADDRESS,
        value: 18,
      });
    });

    expect(result).toEqual({ kind: "conflict" });
    expect(server.calls.map(({ kind }) => kind)).toEqual([
      "change",
      "readState",
    ]);
    expect(draft.result.current.state.draft).toEqual({
      draftRevision: "5",
      changes: [],
    });
    draft.unmount();
  });

  it("is failed when the client throws, and the screen is not left busy", async () => {
    const draft = mount({
      readState: () => Promise.resolve(undefined),
      change: () => Promise.reject(new Error("offline")),
      revert: () => Promise.reject(new Error("offline")),
      bulk: () => Promise.reject(new Error("offline")),
    });

    let result: unknown;
    await act(async () => {
      result = await draft.result.current.change({
        address: DEPTH_ADDRESS,
        value: 18,
      });
    });

    expect(result).toEqual({ kind: "failed" });
    expect(draft.result.current.isBusy).toBe(false);
    expect(draft.result.current.state.draft.draftRevision).toBe("4");
    draft.unmount();
  });

  it("raises the session sheet for an ended session, keeping what was typed, and is failed", async () => {
    const server = inMemoryPriceDraftClient(stateOf([], "4"));
    server.answerNextWriteWith({ kind: "session-ended" });
    const draft = mount(server.client);

    let result: unknown;
    await act(async () => {
      result = await draft.result.current.change({
        address: DEPTH_ADDRESS,
        value: 18,
      });
    });

    expect(result).toEqual({ kind: "failed" });
    expect(getStaffSessionExpiry()).toEqual({ keepsTypedText: true });
    draft.unmount();
  });
});

describe("one write at a time", () => {
  it("does not send a second write while the first is out, and is busy until it is answered", async () => {
    const server = inMemoryPriceDraftClient(stateOf([], "4"));
    const release = server.holdNextWrite();
    const draft = mount(server.client);

    let first: Promise<unknown> = Promise.resolve();
    let second: unknown;
    await act(async () => {
      first = draft.result.current.change({
        address: DEPTH_ADDRESS,
        value: 18,
      });
      second = await draft.result.current.change({
        address: ANCHOR_ADDRESS,
        value: 500_000,
      });
    });

    expect(second).toEqual({ kind: "busy" });
    expect(draft.result.current.isBusy).toBe(true);
    expect(server.calls).toHaveLength(1);

    release();
    await act(async () => {
      await first;
    });
    await flushPromises();
    expect(draft.result.current.isBusy).toBe(false);
    expect(draft.result.current.state.draft.changes).toHaveLength(1);
    draft.unmount();
  });
});

describe("a bulk action", () => {
  it("is adopted as a group, with the counts the server gave", async () => {
    const server = inMemoryPriceDraftClient(stateOf([], "4"));
    const draft = mount(server.client);

    let result: unknown;
    await act(async () => {
      result = await draft.result.current.bulk({
        target: { scope: "all" },
        percent: 5,
      });
    });

    expect(result).toMatchObject({
      kind: "saved",
      amountCount: expect.any(Number) as number,
    });
    const { changes } = draft.result.current.state.draft;
    expect(changes.length).toBeGreaterThan(1);
    expect(new Set(changes.map(({ groupId }) => groupId)).size).toBe(1);
    draft.unmount();
  });
});

describe("an amount wanted at an address", () => {
  const ACTIVE_ANCHOR_MINOR = 396_000;
  const ANCHOR_WANTED = { address: ANCHOR_ADDRESS, value: 500_000 };

  it("is a change, sent as the address and the value and nothing the caller carried beside them", async () => {
    const server = inMemoryPriceDraftClient(stateOf([], "4"));
    const draft = mount(server.client);

    await act(async () => {
      await draft.result.current.changeOrRevert(
        { ...ANCHOR_WANTED, fieldKey: "anchorMinor" } as typeof ANCHOR_WANTED,
        ACTIVE_ANCHOR_MINOR,
      );
    });

    expect(server.calls.map((call) => call.kind)).toEqual(["change"]);
    expect(server.state().draft.changes).toEqual([ANCHOR_WANTED]);
    draft.unmount();
  });

  it("takes the draft's change out when the value is the active one", async () => {
    const server = inMemoryPriceDraftClient(stateOf([ANCHOR_WANTED], "4"));
    const draft = mount(server.client, server.state());

    let result: unknown;
    await act(async () => {
      result = await draft.result.current.changeOrRevert(
        { address: ANCHOR_ADDRESS, value: ACTIVE_ANCHOR_MINOR },
        ACTIVE_ANCHOR_MINOR,
      );
    });

    expect(result).toEqual({ kind: "saved" });
    expect(server.calls.map((call) => call.kind)).toEqual(["revert"]);
    expect(server.state().draft.changes).toEqual([]);
    draft.unmount();
  });

  it("sends nothing when the value is the active one and the draft holds no change there", async () => {
    const server = inMemoryPriceDraftClient(stateOf([], "4"));
    const draft = mount(server.client);

    let result: unknown;
    await act(async () => {
      result = await draft.result.current.changeOrRevert(
        { address: ANCHOR_ADDRESS, value: ACTIVE_ANCHOR_MINOR },
        ACTIVE_ANCHOR_MINOR,
      );
    });

    expect(result).toEqual({ kind: "unchanged" });
    expect(server.calls).toEqual([]);
    draft.unmount();
  });

  it("reads the change the draft holds now, not the one it held when the screen last rendered", async () => {
    const server = inMemoryPriceDraftClient(stateOf([], "4"));
    const draft = mount(server.client);

    let result: unknown;
    await act(async () => {
      await draft.result.current.changeOrRevert(
        ANCHOR_WANTED,
        ACTIVE_ANCHOR_MINOR,
      );
      result = await draft.result.current.changeOrRevert(
        { address: ANCHOR_ADDRESS, value: ACTIVE_ANCHOR_MINOR },
        ACTIVE_ANCHOR_MINOR,
      );
    });

    expect(result).toEqual({ kind: "saved" });
    expect(server.state().draft.changes).toEqual([]);
    draft.unmount();
  });
});
