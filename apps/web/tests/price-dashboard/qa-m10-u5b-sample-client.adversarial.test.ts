// Adversarial QA of the in-memory client, against what the real routes answer. The sample is what every non-production
// build writes through, so an answer it gives that no route would give shows a person a behaviour the real desk never has.
// The oracles are the real ones: the domain's text rule for a version's label, `judgeDraft` for a change, `readVersionPage`
// for a page, `planPublish`'s staleness rule for a publish.
import fc from "fast-check";
import {
  judgeVersionLabel,
  type DraftChange,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { judgeDraft } from "@/price-dashboard/draft-judgement";
import { readVersionPage } from "@/lib/server/price-dashboard/publish-requests";
import type {
  DashboardStateWire,
  PriceVersionSummaryWire,
  PublishTextRefusalCode,
} from "@/price-dashboard/price-dashboard-wire-contract";
import type { PublishClient } from "@/price-dashboard/publish-client";
import { SAMPLE_PUBLISH_PAGE } from "@/price-dashboard/publish-sample";
import { makeSamplePublishClient } from "@/price-dashboard/publish-sample-client";

const STATE: DashboardStateWire = SAMPLE_PUBLISH_PAGE.state;
const PAGE_SIZE = 20;

function publishRequest(label: string, overrides: object = {}) {
  return {
    expectedDraftRevision: STATE.draft.draftRevision,
    expectedActiveSequence: STATE.active.sequenceNumber,
    expectedAvailabilityRevision: STATE.active.availability.revision,
    label,
    note: "",
    ...overrides,
  };
}

function historyOf(count: number): readonly PriceVersionSummaryWire[] {
  return Array.from({ length: count }, (_, position) => {
    const sequenceNumber = count - position;
    return {
      versionId: `v${String(sequenceNumber)}`,
      sequenceNumber,
      label: `Version ${String(sequenceNumber)}`,
      state: position === 0 ? ("active" as const) : ("archived" as const),
      publishedAt: "2026-10-01T00:00:00.000Z",
      changeCount: 1,
    };
  });
}

function clientOver(
  state: DashboardStateWire,
  history?: readonly PriceVersionSummaryWire[],
): PublishClient {
  return makeSamplePublishClient({
    state,
    archived: new Map(),
    ...(history === undefined
      ? {}
      : { history: { versions: history, pageSize: PAGE_SIZE } }),
  });
}

async function everyListedVersion(client: PublishClient, pages: number) {
  const listed: PriceVersionSummaryWire[] = [];
  let total = -1;
  for (let page = 1; page <= pages; page += 1) {
    const outcome = await client.readVersionPage(page);
    if (outcome.kind !== "listed") throw new Error("a page was not listed");
    listed.push(...outcome.list.versions);
    total = outcome.list.total;
  }
  return { listed, total };
}

/** The pieces a label is built from: plain letters and every class of character the route's text rule treats apart. */
const LABEL_PIECES = [
  "a",
  "Z",
  " ",
  "\u00A0",
  "\u3000",
  "\u2800",
  "\u200D",
  "\u200B",
  "\u202E",
  "\u2066",
  "\u0007",
  "\u2028",
  "e\u0301",
  "\u00E9",
  "\u{1D11E}",
  "\u{1F600}",
] as const;

describe("the label's refusal is the domain's", () => {
  const CODE_OF = {
    REQUIRED: "TEXT_EMPTY",
    TOO_LONG: "TEXT_TOO_LONG",
    FORBIDDEN_CHARACTER: "TEXT_FORBIDDEN_CHARACTER",
    NOT_TEXT: "TEXT_FORBIDDEN_CHARACTER",
  } as const satisfies Record<string, PublishTextRefusalCode>;

  async function sampleVerdict(label: string): Promise<string> {
    const outcome = await clientOver(STATE).publish(publishRequest(label));
    if (outcome.kind === "invalid") return outcome.code;
    return outcome.kind === "published" ? "accepted" : outcome.kind;
  }

  function routeVerdict(label: string): string {
    const judged = judgeVersionLabel(label.trim());
    return judged.ok ? "accepted" : CODE_OF[judged.code];
  }

  it.each([
    ["the braille blank alone", "⠀"],
    ["a right-to-left override, which the route refuses as typed", "a‮b"],
    ["a zero-width joiner among letters, which the route strips", "a‍b"],
    [
      "a name of 80 astral characters, which the route counts by code point",
      "\u{1D11E}".repeat(80),
    ],
    ["a name of 81 astral characters", "\u{1D11E}".repeat(81)],
    ["a decomposed name that is short once composed", "é".repeat(60)],
    ["a no-break space alone", " "],
    ["an ideographic space alone", "　"],
  ])("gives %s the verdict the route gives", async (_name, label) => {
    expect(await sampleVerdict(label)).toBe(routeVerdict(label));
  });

  it("agrees with the route on any text, once the desk has trimmed it", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .array(fc.constantFrom(...LABEL_PIECES), { maxLength: 90 })
          .map((pieces) => pieces.join("")),
        async (typed) => {
          const label = typed.trim();

          expect(await sampleVerdict(label)).toBe(routeVerdict(label));
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("a publish the route judges stale", () => {
  it("is not published against an active sequence the page did not read", async () => {
    const outcome = await clientOver(STATE).publish(
      publishRequest("Ajustari", {
        expectedActiveSequence: STATE.active.sequenceNumber - 1,
      }),
    );

    expect(outcome.kind).not.toBe("published");
  });

  it("is not published against an availability head the page did not read", async () => {
    const outcome = await clientOver(STATE).publish(
      publishRequest("Ajustari", {
        expectedAvailabilityRevision: `${STATE.active.availability.revision}-moved`,
      }),
    );

    expect(outcome.kind).not.toBe("published");
  });
});

describe("a change the route would refuse", () => {
  const NEGATIVE_ANCHOR = {
    address: {
      kind: "cabinet",
      ruleId: "cabinet.base-cabinet",
      field: "anchorMinor",
    },
    value: -1,
  } as const;

  it("is refused with the code the route names, not told as a failure to write", async () => {
    const judged = judgeDraft({
      book: STATE.active.book,
      changes: [NEGATIVE_ANCHOR as DraftChange],
      firstNewIndex: 0,
    });
    expect(judged.kind).toBe("refused-new-change");

    const outcome = await clientOver({
      ...STATE,
      draft: { draftRevision: "1", changes: [] },
    }).change({ expectedDraftRevision: "1", change: NEGATIVE_ANCHOR });

    expect(outcome).toEqual({
      kind: "refused",
      code: judged.kind === "refused-new-change" ? judged.code : undefined,
    });
  });
});

describe("a page the route would refuse", () => {
  it("is not listed: the route answers 400 for a page that is not 1 to 10 000 in whole digits", async () => {
    const client = clientOver(STATE, historyOf(45));
    const listed: number[] = [];

    for (const page of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      10_001,
    ]) {
      const reading = readVersionPage(
        new URLSearchParams({ page: String(page) }),
      );
      expect(reading.ok, `the route refuses page ${String(page)}`).toBe(false);
      if ((await client.readVersionPage(page)).kind === "listed") {
        listed.push(page);
      }
    }

    expect(listed, "pages the sample listed that no route would").toEqual([]);
  });
});

describe("a history that grows by a publish", () => {
  const VERSIONS = 45;

  it("lists every version once across its pages, the new one at the head of the first, and a total that counts it", async () => {
    const before = historyOf(VERSIONS);
    const client = clientOver(
      {
        ...STATE,
        active: { ...STATE.active, sequenceNumber: VERSIONS },
      },
      before,
    );
    const outcome = await client.publish(
      publishRequest("Ajustari", { expectedActiveSequence: VERSIONS }),
    );
    expect(outcome.kind).toBe("published");

    const { listed, total } = await everyListedVersion(client, 3);

    expect(total).toBe(VERSIONS + 1);
    const sequences = listed.map((version) => version.sequenceNumber);
    expect(sequences[0], "the new version heads the history").toBe(
      VERSIONS + 1,
    );
    expect(
      [...sequences].sort((first, second) => first - second),
      "every version once",
    ).toEqual(Array.from({ length: VERSIONS + 1 }, (_, index) => index + 1));
  });
});
