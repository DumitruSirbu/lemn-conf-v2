// What the publish, history and restore routes answer is read before it is believed: an answer that is not exactly the
// wire's shape is no answer, and nothing a body adds beside its members reaches a screen.
import { describe, expect, it } from "vitest";

import { readDashboardStateWire } from "@/price-dashboard/price-dashboard-wire-reading";
import {
  readCandidateRefusals,
  readWireItemRef,
  readPublishedWire,
  readRestoredWire,
  readVersionListWire,
} from "@/price-dashboard/publish-wire-reading";

const SUMMARY = {
  versionId: "v-1",
  sequenceNumber: 2,
  label: "Autumn",
  state: "active",
  publishedAt: "2026-11-01T08:00:00.000Z",
  changeCount: 3,
};

describe("a publish answer", () => {
  it("is read from its three members, and from nothing else", () => {
    expect(
      readPublishedWire({
        versionId: "v-2",
        sequenceNumber: 2,
        availabilityRevision: "7",
        book: { secret: true },
      }),
    ).toEqual({
      versionId: "v-2",
      sequenceNumber: 2,
      availabilityRevision: "7",
    });
  });

  it.each([
    ["a missing member", { versionId: "v-2", sequenceNumber: 2 }],
    [
      "a sequence given as text",
      { versionId: "v-2", sequenceNumber: "2", availabilityRevision: "7" },
    ],
    ["no body", undefined],
    ["a list", []],
  ])("is no answer for %s", (_name, body) => {
    expect(readPublishedWire(body)).toBeUndefined();
  });
});

describe("a history page", () => {
  it("is read member by member, newest first as sent", () => {
    expect(
      readVersionListWire({
        total: 1,
        page: 1,
        pageSize: 20,
        versions: [{ ...SUMMARY, book: {} }],
      }),
    ).toEqual({ total: 1, page: 1, pageSize: 20, versions: [SUMMARY] });
  });

  it.each([
    ["a state the history has no word for", { ...SUMMARY, state: "preparing" }],
    ["a count given as text", { ...SUMMARY, changeCount: "3" }],
    ["a date nobody can read", { ...SUMMARY, publishedAt: "yesterday-ish" }],
    ["an entry that is no object", "v-1"],
  ])("is no page when one entry carries %s", (_name, entry) => {
    expect(
      readVersionListWire({
        total: 1,
        page: 1,
        pageSize: 20,
        versions: [entry],
      }),
    ).toBeUndefined();
  });
});

describe("a restore answer", () => {
  it("is the draft and the count of changes it added", () => {
    expect(
      readRestoredWire({
        draft: { draftRevision: "5", changes: [] },
        addedChangeCount: 0,
      }),
    ).toEqual({
      draft: { draftRevision: "5", changes: [] },
      addedChangeCount: 0,
    });
  });

  it("is no answer without a readable draft or a count", () => {
    expect(
      readRestoredWire({ draft: { draftRevision: "5" }, addedChangeCount: 1 }),
    ).toBeUndefined();
    expect(
      readRestoredWire({ draft: { draftRevision: "5", changes: [] } }),
    ).toBeUndefined();
  });
});

describe("the reasons of a refused publish", () => {
  it("keep a change's index and code, and a catalogue reason's text and numbers, and drop what is nested", () => {
    expect(
      readCandidateRefusals({
        status: "candidate-refused",
        refusals: [
          { source: "changes", index: 1, code: "UNKNOWN_RULE" },
          {
            source: "catalogue",
            code: "SIZE_LIST_MISMATCH",
            ruleId: "cabinet.x",
            buildId: "x",
            listedWidthsMm: [300, 400],
          },
          { source: "pricing", code: "INVALID_PRICE_BOOK" },
        ],
      }),
    ).toEqual([
      { source: "changes", index: 1, code: "UNKNOWN_RULE" },
      {
        source: "catalogue",
        code: "SIZE_LIST_MISMATCH",
        ruleId: "cabinet.x",
        buildId: "x",
      },
      { source: "pricing", code: "INVALID_PRICE_BOOK" },
    ]);
  });

  it("leave out an entry of a source nobody knows, a change with a code outside the closed list, and a body that lists none", () => {
    expect(
      readCandidateRefusals({
        refusals: [
          { source: "elsewhere", code: "X" },
          { source: "changes", index: 0, code: "NOT_A_CODE" },
          { source: "changes", index: "0", code: "UNKNOWN_RULE" },
          "text",
        ],
      }),
    ).toEqual([]);
    expect(readCandidateRefusals({ status: "candidate-refused" })).toEqual([]);
  });
});

describe("the item a conflict names", () => {
  it.each([
    [
      { kind: "hardware", tierId: "t-1", extra: 1 },
      { kind: "hardware", tierId: "t-1" },
    ],
    [
      { kind: "material", tierId: "t-2" },
      { kind: "material", tierId: "t-2" },
    ],
    [
      { kind: "accessory", accessoryId: "a-1" },
      { kind: "accessory", accessoryId: "a-1" },
    ],
  ])("is read as an item: %j", (declared, item) => {
    expect(readWireItemRef(declared)).toEqual(item);
  });

  it("is no item without the id its kind names", () => {
    expect(readWireItemRef({ kind: "hardware" })).toBeUndefined();
    expect(
      readWireItemRef({ kind: "accessory", tierId: "t-1" }),
    ).toBeUndefined();
    expect(readWireItemRef("hardware")).toBeUndefined();
  });
});

describe("the active version a state names", () => {
  const stateWith = (publishedAt: string) => ({
    active: {
      versionId: "v-1",
      sequenceNumber: 1,
      label: "One",
      publishedAt,
      book: {},
      availability: {},
    },
    draft: { draftRevision: "1", changes: [] },
  });

  it("is read with a date a screen can format, and is no state with one it cannot", () => {
    expect(
      readDashboardStateWire(stateWith("2026-11-01T08:00:00.000Z"))?.active
        .publishedAt,
    ).toBe("2026-11-01T08:00:00.000Z");
    expect(readDashboardStateWire(stateWith("not a date"))).toBeUndefined();
  });
});
