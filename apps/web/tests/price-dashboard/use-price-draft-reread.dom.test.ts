// @vitest-environment happy-dom
//
// Reading the state again, as `usePriceDraft` offers it: what a read says it came to (adopted, failed, or beaten by a
// later one), and that the draft takes no write while a read is out, so a write cannot land beside the read and drop
// the revisions it carries.
import { act } from "react";
import { describe, expect, it } from "vitest";

import type { DashboardStateWire } from "@/price-dashboard/price-dashboard-wire-contract";
import type { PriceDraftClient } from "@/price-dashboard/price-draft-client";
import { usePriceDraft } from "@/price-dashboard/use-price-draft";

import { flushPromises, renderHook } from "../support/render-hook";
import { BASE_CABINET_RULE, stateOf } from "./dashboard-state-fixture";
import { deferred } from "./publish-desk-harness";

const ANCHOR = {
  address: {
    kind: "cabinet",
    ruleId: BASE_CABINET_RULE,
    field: "anchorMinor",
  },
  value: 500_000,
} as const;

type Read = Promise<DashboardStateWire | undefined>;

/** A client whose reads are answered, in the order they are asked, by the promises it is given. */
function clientReading(
  reads: readonly Read[],
  change: PriceDraftClient["change"] = () =>
    Promise.resolve({ kind: "failed" }),
): PriceDraftClient & { readonly changes: () => number } {
  let asked = 0;
  let sent = 0;
  return {
    readState: () => reads[asked++] ?? Promise.resolve(undefined),
    change: (request) => {
      sent += 1;
      return change(request);
    },
    revert: () => Promise.resolve({ kind: "failed" }),
    bulk: () => Promise.resolve({ kind: "failed" }),
    changes: () => sent,
  };
}

function mount(client: PriceDraftClient) {
  return renderHook(() => usePriceDraft({ initial: stateOf([], "4"), client }));
}

describe("a read of the state again", () => {
  it("is adopted, and says so with the state it read", async () => {
    const read = stateOf([], "9");
    const draft = mount(clientReading([Promise.resolve(read)]));

    let outcome: unknown;
    await act(async () => {
      outcome = await draft.result.current.refresh();
    });

    expect(outcome).toEqual({ kind: "read", state: read });
    expect(draft.result.current.state).toEqual(read);
    draft.unmount();
  });

  it("says it failed when nothing could be read and nothing else replaced the state meanwhile", async () => {
    const draft = mount(clientReading([Promise.resolve(undefined)]));

    let outcome: unknown;
    await act(async () => {
      outcome = await draft.result.current.refresh();
    });

    expect(outcome).toEqual({ kind: "failed" });
    expect(draft.result.current.state.draft.draftRevision).toBe("4");
    draft.unmount();
  });

  it("says it was beaten, not that it failed, when it failed after a newer state was adopted", async () => {
    const answer = deferred<DashboardStateWire | undefined>();
    const draft = mount(clientReading([answer.promise]));
    let outcome: unknown;
    await act(async () => {
      const pending = draft.result.current.refresh();
      draft.result.current.adopt(stateOf([], "12"));
      answer.resolve(undefined);
      outcome = await pending;
    });

    expect(outcome).toEqual({ kind: "superseded", state: undefined });
    expect(draft.result.current.state.draft.draftRevision).toBe("12");
    draft.unmount();
  });

  it("leaves the later read standing when two answer out of the order they were asked", async () => {
    const first = deferred<DashboardStateWire | undefined>();
    const second = deferred<DashboardStateWire | undefined>();
    const draft = mount(clientReading([first.promise, second.promise]));
    const outcomes: unknown[] = [];
    await act(async () => {
      const early = draft.result.current.refresh();
      const late = draft.result.current.refresh();
      second.resolve(stateOf([], "8"));
      outcomes.push(await late);
      first.resolve(stateOf([], "7"));
      outcomes.push(await early);
    });

    expect(draft.result.current.state.draft.draftRevision).toBe("8");
    expect(outcomes).toEqual([
      { kind: "read", state: stateOf([], "8") },
      { kind: "superseded", state: stateOf([], "7") },
    ]);
    draft.unmount();
  });
});

describe("the draft while a read of the state is out", () => {
  it("takes no write, and is free again once the read is answered", async () => {
    const answer = deferred<DashboardStateWire | undefined>();
    const client = clientReading([answer.promise]);
    const draft = mount(client);
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = draft.result.current.refresh();
    });
    expect(draft.result.current.isBusy).toBe(true);

    let during: unknown;
    await act(async () => {
      during = await draft.result.current.change(ANCHOR);
    });
    expect(during).toEqual({ kind: "busy" });
    expect(client.changes()).toBe(0);

    await act(async () => {
      answer.resolve(stateOf([], "9"));
      await pending;
    });
    expect(draft.result.current.isBusy).toBe(false);
    draft.unmount();
  });

  it("stays held through the read a refused write asks for, and no other write goes out meanwhile", async () => {
    const answer = deferred<DashboardStateWire | undefined>();
    const client = clientReading([answer.promise], () =>
      Promise.resolve({ kind: "conflict" }),
    );
    const draft = mount(client);
    let write: Promise<unknown> = Promise.resolve();
    act(() => {
      write = draft.result.current.change(ANCHOR);
    });
    await act(async () => {
      await flushPromises(3);
    });
    expect(draft.result.current.isBusy).toBe(true);

    let second: unknown;
    await act(async () => {
      second = await draft.result.current.change(ANCHOR);
    });
    expect(second).toEqual({ kind: "busy" });

    await act(async () => {
      answer.resolve(stateOf([], "9"));
      await write;
    });
    expect(draft.result.current.isBusy).toBe(false);
    expect(client.changes()).toBe(1);
    draft.unmount();
  });
});
