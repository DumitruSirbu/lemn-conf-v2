// @vitest-environment happy-dom
//
// The draft's creation of a linked accessory, as a screen holds it: it goes through the client's route for it, one write at a
// time with the draft revision the screen last saw, the draft moves only when the server said so, and a client that has no
// route is a creation that cannot be made, which is told before anything is sent.
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";
import { usePriceDraft } from "@/price-dashboard/use-price-draft";

import { renderHook } from "../support/render-hook";
import { accessoryPageOf, CREATED, LINKED_BUILD_ID } from "./accessory-harness";
import { inMemoryPriceDraftClient } from "./in-memory-price-draft-client";

const CREATION = {
  value: {
    linkedBuildId: LINKED_BUILD_ID,
    perUnitMinor: 8_000,
    name: "Suport pentru farfurii",
  },
} as const;

afterEach(() => {
  resetStaffSessionExpiryForTests();
});

function mount(options: { readonly withRoute?: boolean } = {}) {
  const { state } = accessoryPageOf();
  const server = inMemoryPriceDraftClient(state);
  const client =
    options.withRoute === false
      ? { ...server.client, createAccessory: undefined }
      : server.client;
  const draft = renderHook(() => usePriceDraft({ initial: state, client }));
  return { draft, server };
}

describe("creating an accessory", () => {
  it("sends the revision the screen holds with the creation, and adopts the draft the server answers with", async () => {
    const { draft, server } = mount();

    const result = await act(() =>
      draft.result.current.createAccessory(CREATION.value),
    );

    expect(result).toEqual({
      kind: "created",
      created: { kind: "accessory", accessoryId: CREATED },
    });
    expect(server.calls).toEqual([
      {
        kind: "createAccessory",
        request: { expectedDraftRevision: "1", ...CREATION },
      },
    ]);
    expect(draft.result.current.state.draft.changes).toHaveLength(1);
    expect(draft.result.current.state.draft.draftRevision).toBe("2");
  });

  it("is told, before anything is sent, to be impossible where the client has no route for it", async () => {
    const { draft, server } = mount({ withRoute: false });

    const result = await act(() =>
      draft.result.current.createAccessory(CREATION.value),
    );

    expect(draft.result.current.canCreateAccessory).toBe(false);
    expect(draft.result.current.canCreateHardwareClass).toBe(true);
    expect(result).toEqual({ kind: "failed" });
    expect(server.calls).toEqual([]);
    expect(draft.result.current.state.draft.changes).toEqual([]);
  });

  it("sends no second creation while one is out, and says it was not sent", async () => {
    const { draft, server } = mount();
    const release = server.holdNextWrite();

    let second: unknown;
    await act(async () => {
      const first = draft.result.current.createAccessory(CREATION.value);
      second = await draft.result.current.createAccessory(CREATION.value);
      release();
      await first;
    });

    expect(second).toEqual({ kind: "busy" });
    expect(server.calls.map((call) => call.kind)).toEqual(["createAccessory"]);
  });

  it("reads the state again and changes nothing else when another writer got there first", async () => {
    const { draft, server } = mount();
    server.moveDraftBehindTheScreen();

    const result = await act(() =>
      draft.result.current.createAccessory(CREATION.value),
    );

    expect(result).toEqual({ kind: "conflict" });
    expect(server.calls.map((call) => call.kind)).toEqual([
      "createAccessory",
      "readState",
    ]);
    expect(draft.result.current.state.draft.changes).toEqual([]);
    expect(draft.result.current.state.draft.draftRevision).toBe("2");
  });

  it("leaves the draft alone and hands the refusal on", async () => {
    const { draft, server } = mount();
    server.answerNextWriteWith({
      kind: "refused",
      code: "LINK_TARGET_UNKNOWN",
    });

    const result = await act(() =>
      draft.result.current.createAccessory(CREATION.value),
    );

    expect(result).toEqual({ kind: "refused", code: "LINK_TARGET_UNKNOWN" });
    expect(draft.result.current.state.draft.changes).toEqual([]);
  });
});
